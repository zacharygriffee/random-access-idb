import {blocks} from "./lib/blocks.js";
import b4a from "b4a";
import * as IDB from "idb";
import path from "tiny-paths";
import {promise as Q} from "./lib/fastq.js";
import EventEmitter from "tiny-emitter";

const metaDb = await IDB.openDB("###meta", undefined, {
    upgrade(db) {
        const dataStore = db.createObjectStore('meta', {
            keyPath: 'fileName',
            autoIncrement: false,
        });

        dataStore.createIndex("length", "length");
        dataStore.createIndex("type", "type");
        dataStore.createIndex("chunkSize", "chunkSize");
    }
});

function delMetaOfFile(fileName) {
    const tx = metaDb.transaction("meta", "readwrite");
    const store = tx.objectStore('meta');
    return store.delete(fileName).catch(e => {
        console.log("Failed to del meta", e);
        return false;
    })
}

function getMetaOfFile(fileName) {
    const tx = metaDb.transaction("meta", "readonly");
    const store = tx.objectStore('meta');
    if (!fileName) {
        debugger;
    }
    return store.get(fileName).catch(e => {
        console.log("Failed to get meta", e);
        return false;
    })
}

async function setMetaOfFile({fileName, length, ...rest} = {}) {
    const tx = metaDb.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    await store.put({
        fileName,
        length: length || 0,
        ...rest
    });
    return tx.done;
}

async function openFile(fileName, config = {}) {
    const {
        openBlockingHandler,
        openBlockedHandler
    } = config;
    if (fileName === "######meta") {
        throw new Error("Reserved db name");
    }
    return await IDB.openDB(fileName, undefined, {
        upgrade(db) {
            const dataStore = db.createObjectStore('chunks', {
                // The 'id' property of the object will be the key.
                keyPath: 'chunk',
                // If it isn't explicitly set, create a value by auto incrementing.
                autoIncrement: false,
            });

            dataStore.createIndex("data", "data");
        },
        blocking(currentVersion, blockedVersion, event) {
            openBlockingHandler(currentVersion, blockedVersion, event);
        },
        blocked(...args) {
            openBlockedHandler(...args);
        }
    });
}

async function getChunks(db, range = {}, inclusiveLow = true, inclusiveHigh = true) {
    const tx = db.transaction("chunks", "readonly");
    const store = tx.objectStore('chunks');

    let keyRange;

    if (range.end == null)
        keyRange = IDBKeyRange.lowerBound(range.start, !inclusiveHigh);
    else if (range.start == null)
        keyRange = IDBKeyRange.upperBound(range.end, !inclusiveLow);
    else if (range.start && range.end) {
        keyRange = IDBKeyRange.bound(range.start, range.end, !inclusiveLow, !inclusiveHigh);
    } else {
        keyRange = undefined;
    }

    return await store.getAll(keyRange);
}

async function setChunks(db, chunkBook = []) {
    if (!Array.isArray(chunkBook)) chunkBook = [chunkBook];
    const tx = db.transaction("chunks", "readwrite");
    const store = tx.objectStore('chunks');
    const promises = [];
    for (const {chunk, data} of chunkBook) {
        promises.push(
            store.put(
                {
                    chunk,
                    data
                }
            )
        );
    }
    promises.push(tx.done);
    await Promise.all(promises);
}

// todo: Error handling testing. Currently, unlikely
//       indexeddb errors have not been tested
/**
 * Current default configurations.
 * @type {{chunkSize: number, MapClass: MapConstructor, dbSeparator: string}}
 */
export let defaultConfig = {
    chunkSize: 4096, MapClass: Map
};

/**
 * Update default configurations for all further database creations.
 *
 * @example
 * updateDefaultConfig(existingConfig => ({...existingConfig, chunkSize: 1024, MapClass: ObservableMap}));
 *
 * @param cb
 * @returns {Promise<void>}
 */
export function updateDefaultConfig(cb) {
    return Promise.resolve(cb(defaultConfig)).then((changedConfig) => {
        defaultConfig = changedConfig;
    })
}

/**
 * Get a map of all loaded files.
 * stored by a key with this format by default: dbName\0fileName
 * So you could do:
 * allLoadedFiles.get("rai\0helloWorld.txt");
 */
export let allLoadedFiles = null;

/**
 * Create a random access idb instance
 *
 * @example // File creation example
 *
 * const rai = createFile("helloWorld.txt");
 * rai.write(0, Buffer.from("hello world!!!"));
 *
 * @param [fileName] The name of the file
 * @param [config] Optional configurations
 * @param [config.chunkSize=4096] The chunk size of the files created from the created database.
 * Chunk size will be stored in the file's metadata and used for the next open.
 * @param [config.size=4096] Alias of {@link config.chunkSize}
 * @param [config.openBlockingHandler] Handler in the case that another tab, process, or part of the code tries to open
 * the same file. Default behavior is to close if this instance blocks another instance
 * @param [config.openBlockedHandler] If this instance encounters a block by another instance (tab, process, etc), how
 * to handle it. Default, does nothing and waits for the other process to close the file.
 * @param [config.deleteBlockingHandler] In the case where this instance wants to delete (purge) the file, but is blocked
 * by another instance operating on it. Default behavior is to do nothing and wait.
 * @param [config.MapClass] A custom map class to use for file listing instead of the native map class. Default is native map class.
 * @param [config.directory] Put the files into directory.
 * @returns Function<RandomAccessIdb>
 */
function createFile(fileName, config = {}) {
    const {
        size,
        chunkSize = size,
        MapClass,
        openBlockingHandler = (currVer, blockedVer, event) => {
            console.warn("Closed due to blocking.", fileName);
            return event.target.close();
        },
        openBlockedHandler,
        deleteBlockingHandler,
        prefix,
        directory = prefix
    } = ({...defaultConfig, ...config});
    if (directory) fileName = path.join(directory, path.resolve('/', fileName).replace(/^\w+:\\/, ''))
    if (!allLoadedFiles) allLoadedFiles = new MapClass();
    if (allLoadedFiles.has(fileName)) {
        const ras = allLoadedFiles.get(fileName);
        if (ras.closed) {
            delete allLoadedFiles.delete(fileName);
        } else {
            return ras;
        }
    }

    config.chunkSize ||= chunkSize;
    const ready = (async () => {
        const meta = await getMetaOfFile(fileName);
        if (!meta) {
            await setMetaOfFile({
                fileName,
                length: 0,
                chunkSize: config.chunkSize
            });
        }

        return await openFile(fileName, {openBlockingHandler, openBlockedHandler, ...config});
    })();

    const ras = new RandomAccessIdb({ready, fileName, ...config});
    ras.deleteBlockingHandler = deleteBlockingHandler;
    allLoadedFiles.set(fileName, ras);
    return ras;
}

/**
 * @class RandomAccessIdb
 * @extends RandomAccessStorage
 * @see https://github.com/random-access-storage/random-access-storage
 * @property {Number} length
 * Total length of the file
 * @property {String} fileName
 * The fileName of the file
 * @property {number} chunkSize
 * The chunk size this file is stored on the database.
 * @property {string} key
 * The key this file uses in allLoadedFiles map.
 */
class RandomAccessIdb extends EventEmitter {
    length;

    constructor({ready, fileName, chunkSize}) {
        super();
        this.ready = () => ready;
        this.fileName = fileName
        this.chunkSize = chunkSize;
        this.suspended = false;
        this.opened = false;
        this.closed = true;
        this._startQ();
    }

    async refreshLength() {
        const meta = await getMetaOfFile(this.fileName);
        this.length = meta.length;
    }

    async setLength(length) {
        this.length = length;
        return setMetaOfFile({
            fileName: this.fileName,
            length,
            chunkSize: this.chunkSize
        });
    }

    async ensureChunkSize() {
        const meta = await getMetaOfFile(this.fileName);
        if (meta && meta.chunkSize) this.chunkSize = meta.chunkSize;
    }

    _startQ() {
        if (this.queue) return;
        let timer, stallTimeout = 10000;
        this.queue ||= Q(
            async ({task, request}) => {
                try {
                    timer = setTimeout(() => {
                        console.error("The queue stalled", {task, request});
                    }, stallTimeout);
                    const result = await Promise.resolve(task());
                    if (request.callback) await request.callback(null, result);
                } catch (e) {
                    if (request.callback) return request.callback(e);
                    throw e;
                } finally {
                    if (timer) clearTimeout(timer);
                }
            }, 1
        );
    }

    /**
     * Purge the file from the table.
     * 'Closes' the file from allFilesOpened map.
     *
     * @param cb (error) => {}
     */
    async purge(cb) {
        const self = this;
        await new Promise(resolve => self.close(resolve));
        await IDB.deleteDB(self.fileName, {
            blocked(...args) {
                if (self.deleteBlockingHandler) self.deleteBlockingHandler(...args);
            }
        });
        await delMetaOfFile(self.fileName);
        cb?.();
    }

    _blocks(i, j) {
        const {
            chunkSize
        } = this;
        return blocks(chunkSize, i, j)
    }

    async __open() {
        // Due to the way indexeddb can potentially operate across
        // multiple tabs, and be closed at any moment notice open is
        // called pretty much every op.
        this.db = await this.ready();
        await this.ensureChunkSize();
        await this.refreshLength();
        if (this.suspended) {
            this.emit("unsuspend");
            this.suspended = false;
            this.queue.resume();
        }
        if (!this.opened)
            this.emit("open", this);
        this.closed = false;
        this.opened = true;
    }

    open(cb = noop) {
        this.__open().then(cb);
    }

    read(offset, size, cb = noop) {
        const self = this;
        this.open(() => {
            self.queue.push(
                {
                    request: {
                        callback: cb
                    },
                    async task() {
                        // console.log("reading", self.fileName);

                        if (size === 0) return b4a.alloc(0);

                        const {
                            db, length
                        } = self;

                        if (length === 0) {
                            const error = new Error("No file");
                            error.code = "ENOENT";
                            throw error;
                        }
                        if (size === Number.POSITIVE_INFINITY) size = length - offset;
                        // if ((length || 0) < offset + size) {
                        //     console.error(req, self.fileName);
                        //     throw new Error('Could not satisfy length ');
                        // }
                        const blocks = self._blocks(offset, offset + size);
                        const [{block: firstBlock}] = blocks;
                        const {block: lastBlock} = blocks[blocks.length - 1];

                        const chunks = await getChunks(db, {
                            start: firstBlock,
                            end: lastBlock
                        }, true, true);

                        if (!chunks.length) return b4a.alloc(0);

                        let cursor = 0;

                        const map = [];
                        for (const {data, chunk} of Object.values(chunks)) {
                            cursor = chunk - firstBlock;
                            if (!blocks[cursor]) {
                                continue;
                            }
                            const {start, end} = blocks[cursor];
                            map[cursor] = b4a.from(data.slice(start, end));
                        }
                        // console.log("read", map);
                        return b4a.concat(map);
                    }
                }
            )
        });
    }

    write(offset, data, cb = noop) {
        this.open(() => {

            const self = this;
            const {
                chunkSize, length, db
            } = self;

            self.queue.push({
                request: {callback: cb},
                async task() {
                    // console.log("writing", self.fileName);
                    const blocks = self._blocks(offset, offset + data.length);
                    const [{block: firstBlock}] = blocks;
                    const {block: lastBlock} = blocks[blocks.length - 1];
                    let newLength;

                    const chunks = await getChunks(db, {
                        start: firstBlock,
                        end: lastBlock
                    }, true, true);

                    for (let [key, value] of Object.entries(chunks)) {
                        chunks[key] = value?.data;
                    }

                    let cursor = 0;
                    let i = 0;

                    const tx = db.transaction("chunks", "readwrite");
                    const store = tx.objectStore('chunks');

                    for (const {block, start, end} of blocks) {
                        const blockPos = i++;
                        const blockRange = end - start;

                        if (blockRange === chunkSize) {
                            chunks[blockPos] = b4a.from(data.slice(cursor, cursor + blockRange));
                        } else {
                            chunks[blockPos] ||= b4a.from(b4a.alloc(chunkSize));
                            b4a.copy(b4a.from(data), chunks[blockPos], start, cursor, cursor + blockRange);
                        }
                        await store.put({chunk: block, data: b4a.from(chunks[blockPos])});
                        cursor += blockRange;
                    }

                    newLength = Math.max(length || 0, offset + data.length);
                    await tx.done;
                    await self.setLength(newLength);
                    return null;
                }
            });

        });

    }

    del(offset, size, cb = noop) {
        const self = this;
        this.open(() => {
            const {
                length, db, chunkSize
            } = self;

            if (size === Number.POSITIVE_INFINITY) size = length - offset;

            if (offset + size > length) {
                size = Math.max(0, length - offset)
            }
            if (offset + size >= length) {
                return self.truncate(offset, cb);
            }

            self.queue.push(
                {
                    request: {
                        callback: cb
                    },
                    async task() {
                        // console.log("deleting", self.fileName);
                        const blocks = self._blocks(offset, offset + size);
                        const firstBlock = blocks.shift();
                        const lastBlock = blocks.pop() || firstBlock;
                        const deleteBlockCount = lastBlock.block - firstBlock.block;

                        if (deleteBlockCount > 1) {
                            // Delete anything in between.
                            await getChunks(db, {
                                start: firstBlock.block,
                                end: lastBlock.block
                            }, false, false);
                        }

                        const {0: first, 1: last} = await getChunks(db, {
                            start: firstBlock.block,
                            end: lastBlock.block
                        }, true, true);


                        if (first) {
                            const end = last ? firstBlock.end : firstBlock.end - firstBlock.start;
                            const empty = b4a.alloc(end);
                            b4a.copy(empty, first.data, firstBlock.start);
                            await setChunks(db, first);
                        }

                        if (last) {
                            const end = Math.min(lastBlock.end, chunkSize);
                            const empty = b4a.alloc(end);
                            b4a.copy(empty, last.data, lastBlock.start);
                            await setChunks(db, last);
                        }
                    }
                }
            );
        });
    }

    suspend(cb) {
        const self = this;
        this.queue.pause();
        this.suspended = true;
        setTimeout(() => {
            self.emit("suspend");
            cb();
        });
    }

    truncate(offset, cb = noop) {
        const self = this;

        const {
            length, chunkSize, db
        } = self

        if (offset === length) {
            // nothing
            return cb(null, null);
        } else if (offset > length) {
            // grow
            // console.log("growing", self.fileName);
            return this.write(length, b4a.alloc(offset - length), (err) => {
                if (err) return cb(err, null);
                return cb(null, null);
            });
        }

        this.open(() => {
            self.queue.push({
                request: {
                    callback: cb
                },
                async task() {
                    // console.log("shrinking", self.fileName);
                    // Shrink
                    const blocks = self._blocks(offset, length);
                    const [{block: firstBlock, start, end}] = blocks;

                    const [firstChunk, ...restChunks] = await getChunks(db, {
                        start: firstBlock
                    }, true);
                    const tx = db.transaction("chunks", "readwrite");
                    const store = tx.objectStore('chunks');
                    if (restChunks.length > 0) {
                        const ops = [];
                        for (const chunk of restChunks) {
                            ops.push(
                                store.delete(chunk.chunk)
                            );
                        }
                        await Promise.all(ops);
                    }

                    const blockRange = end - start;
                    if (blockRange === chunkSize) {
                        await store.delete(firstBlock);
                    } else {
                        let {data, chunk} = firstChunk;
                        let truncatedData = b4a.alloc(blockRange);
                        b4a.copy(truncatedData, data, start, start, blockRange)
                        await store.put({
                            chunk, data
                        });
                    }
                    await tx.done;
                    await self.setLength(offset);
                    return null;
                }
            })
        });
    }

    stat(cb = noop) {
        const self = this;
        this.open(() => {
            getMetaOfFile(self.fileName).then(
                stat => {
                    cb(null, {
                        ...stat, size: stat.length
                    })
                }
            );
        });
    }

    close(cb) {
        const self = this;
        const {
            fileName, db
        } = this;

        this.open(() => {
            self.queue.push({
                async task() {
                    if (!self.closed) self.emit("close");
                    self.closed = true;
                    self.opened = false;
                    db.close();
                    allLoadedFiles.delete(fileName)
                },
                request: {
                    callback: cb
                }
            });
        });

    }
}

function noop() {
    return () => null
}

export default createFile;
export {createFile};