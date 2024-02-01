import RandomAccessStorage from "random-access-storage";
import {blocks} from "./lib/blocks.js";
import b4a from "b4a";
import * as IDB from "idb";
import path from "tiny-paths";
import {promise as Q} from "./lib/fastq.js";

const queue = Q(
    async ({task, request}) => {
        try {
            const result = await Promise.resolve(task());
            if (request.callback) await request.callback(null, result);
        } catch (e) {
            if (request.callback) return request.callback(e);
            throw e;
        }
    }, 1
);

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
    return store.delete(fileName).catch(e => false)
}

function getMetaOfFile(fileName) {
    const tx = metaDb.transaction("meta", "readonly");
    const store = tx.objectStore('meta');
    return store.get(fileName).catch(e => false)
}

function setMetaOfFile({fileName, length, ...rest} = {}) {
    const tx = metaDb.transaction("meta", "readwrite");
    const store = tx.objectStore("meta");
    store.put({
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
        openBlockingHandler = (currVer, blockedVer, event) => event.target.close(),
        openBlockedHandler,
        deleteBlockingHandler,
        prefix,
        directory = prefix
    } = ({...defaultConfig, ...config});
    if (directory) fileName = path.join(directory, path.resolve('/', fileName).replace(/^\w+:\\/, ''))
    if (!allLoadedFiles) allLoadedFiles = new MapClass();
    if (allLoadedFiles.has(fileName)) {
        return allLoadedFiles.get(fileName);
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
 * @see https://dexie.org/docs/Dexie/Dexie
 * @see https://dexie.org/docs/Table/Table
 * @property {Number} length
 * Total length of the file
 * @property {String} fileName
 * The fileName of the file
 * @property {number} chunkSize
 * The chunk size this file is stored on the database.
 * @property {string} key
 * The key this file uses in allLoadedFiles map.
 */
class RandomAccessIdb extends RandomAccessStorage {
    length;

    constructor({ready, fileName, chunkSize}) {
        super();
        this.ready = () => ready;
        this.fileName = fileName
        this.chunkSize = chunkSize;
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

    /**
     * Open the database table the file exists in
     * @param cb (e) =>
     */
    open(cb) {
        super.open(cb)
    }

    /**
     * Closes the file. This allows for other tabs to operate on the file.
     * @param cb (error) =>
     */
    close(cb) {
        super.close(cb)
    }

    /**
     * Write `data` starting at `offset`
     * @todo Unlike truncate and del, if a write operation results in empty chunks,
     *       those chunks will not be deleted from underlying table for speed reasons.
     *       Create function that will 'find empty chunks' to delete.
     * @param offset Offset to begin writing bytes from data parameter
     * @param data A buffer of `data` to write
     * @param cb (error) =>
     */
    write(offset, data, cb) {
        super.write(offset, data, cb)
    }

    /**
     * Read `size` amount of bytes starting from `offset`.
     *
     * Will reopen the file if it had been closed.
     *
     * Conditions:
     * - If `size` is zero, will return a zero length buffer.
     * - If `offset+size` is greater than file length, will error with code ENOENT to mimic random-access-file.
     * @param offset Offset to begin reading bytes
     * @param size The amount of bytes to read
     * @param cb (error, buffer) =>
     */
    read(offset, size, cb) {
        super.read(offset, size, cb)
    }

    /**
     * Deletes `size` amount of bytes starting at `offset`. Any empty chunks are deleted from the underlying database table.
     * @param offset  Offset to begin deleting bytes from
     * @param size The amount of bytes to delete
     * @param cb (error) =>
     */
    del(offset, size, cb) {
        super.del(offset, size, cb)
    }

    /**
     * - If `offset` is greater than size of file, will grow the file with empty bytes to that length.
     * - If `offset` is less than size of file, will delete all data after `offset` and any resulting empty chunks are
     *   deleted from underlying database table.
     * - If `offset` is the same, nothing is done to the file.
     * @param offset Offset to begin aforementioned operations.
     * @param cb (error) =>
     */
    truncate(offset, cb) {
        super.truncate(offset, cb)
    }

    /**
     * Callback returns an object resulting in the statistics of the file.
     * { size, fileName, length, blockSize }
     *
     * @param cb (error, stat) =>
     */
    stat(cb) {
        super.stat(cb)
    }

    /**
     * Purge the file from the table.
     * 'Closes' the file from allFilesOpened map.
     *
     * @param cb (error) => {}
     */
    async purge(cb) {
        const self = this;
        await new Promise(resolve => this.close(resolve));
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
        this.db = await this.ready();
        await this.ensureChunkSize();
        await this.refreshLength();
    }

    async _open(req) {
        try {
            await this.__open();
            req.callback(null, null);
        } catch (e) {
            req.callback(e);
        }
    }

    _read(req) {
        const self = this;
        queue.push(
            {
                request: req,
                async task() {
                    await self.__open();

                    let {
                        offset, size
                    } = req;

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
                    return b4a.concat(map);
                }
            }
        )
    }

    _write(req) {
        const self = this;
        const {
            chunkSize, length, db
        } = self;

        const {
            offset, data
        } = req;

        queue.push({
            request: req,
            async task() {
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
                        // if (this.fileName.includes("tree")) {
                        //     console.log("Tree set data", {cursor, blockRange, data},  {block, start, end});
                        // }
                        chunks[blockPos] ||= b4a.from(b4a.alloc(chunkSize));
                        b4a.copy(b4a.from(data), chunks[blockPos], start, cursor, cursor + blockRange);
                    }

                    // ops[block] = {chunk: block, data:  b4a.from(chunks[blockPos])};
                    await store.put({chunk: block, data: b4a.from(chunks[blockPos])});
                    cursor += blockRange;
                }

                newLength = Math.max(length || 0, offset + data.length);
                // await setChunks(db, ops);/
                await tx.done;
                await self.setLength(newLength);
                return null;
            }
        });
    }

    _del(req) {
        // await this.__open();

        const self = this;
        let {
            offset, size
        } = req;

        const {
            length, db, chunkSize
        } = this;

        if (size === Number.POSITIVE_INFINITY) size = req.size = length - offset;

        if (offset + size > length) {
            size = req.size = Math.max(0, length - offset)
        }

        if (offset + size >= length) {
            return this._truncate(req);
        }

        queue.push(
            {
                request: req,
                async task() {
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
    }

    _truncate(req) {
        // await this.__open();
        const self = this;
        const {
            offset
        } = req;

        const {
            length, chunkSize, db
        } = this;

        if (offset === length) {
            // nothing
            return req.callback(null, null);
        } else if (offset > length) {
            // grow
            return this.write(length, b4a.alloc(req.offset - length), (err) => {
                if (err) return req.callback(err, null);
                return req.callback(null, null);
            });
        }

        queue.push({
            request: req,
            async task() {

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

    }

    _stat(req) {
        const self = this;

        queue.push({
            request: req,
            async task() {
                await self.ready();
                const stat = await getMetaOfFile(self.fileName);
                console.log("Getting stat", stat, stat.length, self.fileName);
                return {
                    ...stat,
                    size: stat.length
                }
            }
        })

    }

    _close(req) {
        const {
            fileName, db
        } = this;
        queue.push({
            async task() {
                db.close();
                allLoadedFiles.delete(fileName)
            },
            request: req
        });
    }
}

// export function createSource() {
//     return {
//         async get(fileName, config = {}) {
//             return createFile(fileName, config)
//         },
//         async del(fileName, config = {}) {
//             if(allLoadedFiles.has(fileName)) {
//                 await allLoadedFiles.get(fileName).purge();
//             }
//         },
//         async put(fileName, data, config = {}) {
//             const ras = createFile(fileName, config);
//             return new Promise((resolve, reject) => ras.write(0, data, (e) => e ? reject(e) : resolve()));
//         }
//     }
// }

export default createFile;
export {createFile};