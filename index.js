import Dexie from "dexie";
import RandomAccessStorage from "random-access-storage";
import {blocks} from "./lib/blocks.js";
import b4a from "b4a";
import {get, set, del} from "idb-keyval";

const dbSeparator = "\0";

// todo: add a file metadata for stats
//       like block size (chunk size) as to ensure
//       a file is always opened with
//       its original block size
//       among other stats.
//
// todo: Error handling testing. Currently, unlikely
//       indexeddb errors have not been tested
//
// TODO: Make api sensitive to dexie upgrade changes.
// TODO: make cross-browser-tab capable
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
let allLoadedDb = null;

/**
 * Create an indexeddb database entry
 *
 * @example // File creation example
 *
 * const fileMaker = openDatabase();
 * const rai = fileMaker("helloWorld.txt");
 * rai.write(0, Buffer.from("hello world!!!"));
 *
 * @param [dbName="rai"] The name of the database
 * @param [config] Optional configurations
 * @param [config.chunkSize=4096] The chunk size of the files created from the created database.
 * When reopened, it should have the same size it was created with.
 * @param [config.size=4096] Alias of {@link config.chunkSize}
 *
 * @returns Function<RandomAccessIdb>
 */
export function openDatabase(dbName = "rai", config = {}) {
    const MapClass = defaultConfig.MapClass;
    if (typeof config === "number") config = {chunkSize: config};
    if (!allLoadedDb) allLoadedDb = new MapClass();
    if (!allLoadedFiles) allLoadedFiles = new MapClass();

    const {
        size, chunkSize = size || defaultConfig.chunkSize
    } = config;

    const dbSeparator = defaultConfig.dbSeparator;

    Object.defineProperties(maker, {
        db: {
            get() {
                return allLoadedDb.get(dbName)
            }
        }
    });

    return maker;

    /**
     * Creates the random access storage instance of a file.
     * @param fileName
     * @property db {Dexie} Dexie database running this maker function.
     * @returns {RandomAccessIdb} RandomAccessIdb class instance
     */
    function maker(fileName) {
        const key = b4a.toString(b4a.from(makeKey(dbSeparator, dbName, fileName)), "hex");

        if (allLoadedFiles.has(key)) {
            return allLoadedFiles.get(key);
        }

        if (!(this instanceof RandomAccessIdb)) {
            return maker.call(new RandomAccessIdb(), fileName);
        }

        upsertDb(dbName, {[fileName]: '++chunk,data'})

        const instance = Object.defineProperties(this, {
            fileName: {
                get() {
                    return fileName
                }
            }, db: {
                get() {
                    return allLoadedDb.get(dbName)
                }
            }, table: {
                get() {
                    return this.db[fileName];
                }
            }, chunkSize: {
                get() {
                    return chunkSize;
                }
            }, dbName: {
                get() {
                    return dbName;
                }
            }, key: {
                get() {
                    return key;
                }
            }
        });

        allLoadedFiles.set(key, instance);
        return instance;
    }
}

// see: https://dexie.org/docs/Dexie/Dexie.open()
function upsertDb(dbName, changes) {
    const oldDb = allLoadedDb.get(dbName);
    oldDb?.close();

    if (!oldDb || oldDb.tables.length === 0) return makeNewDb(1, changes);

    const currentSchema = oldDb.tables.reduce((result, {name, schema}) => {
        result[name] = [schema.primKey.src, ...schema.indexes.map(idx => idx.src)].join(',');
        return result;
    }, {});

    return makeNewDb(oldDb.verno, currentSchema).version(oldDb.verno + 1).stores(changes);

    function makeNewDb(version, changes) {
        const newDb = new Dexie(dbName);
        newDb.on('blocked', () => false);
        newDb.version(version).stores(changes);
        allLoadedDb.set(dbName, newDb);
        return newDb;
    }
}

async function getLength() {
    const existingCount = await this.table.count();
    if (existingCount === 0) {
        // In case the table for the file was deleted but not the length key.
        await delLength.bind(this)().catch(_ => {});
        return this.length = 0;
    }
    return this.length = await get(this.key + dbSeparator + "length") || 0;
}

async function putLength() {
    if (this.length === 0) {
        return delLength.bind(this)();
    }
    return set(this.key + dbSeparator + "length", this.length)
}

async function delLength() {
    return del(this.key + dbSeparator + "length", this.length)
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
 * @property {string} dbName
 * The database name this file is stored on.
 * @property {string} key
 * The key this file uses in allLoadedFiles map.
 */
class RandomAccessIdb extends RandomAccessStorage {
    length;

    /**
     * Open the database table the file exists in
     * @param cb (e) =>
     */
    open(cb) {
        super.open(cb)
    }

    /**
     * Deletes the file from allLoadedFiles.
     * @todo Determine if any further implementation of close is even needed
     *       It really makes no sense to me to close the file
     *       the only thing I can think of is to keep a count of each file opened
     *       per database, and once each file of that database is closed, just close the
     *       database as a whole.
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
     * For now, only size of file is included which is the same as length property.
     *
     * @todo Add metadata to files to include block size, author, creation date, and precalculated hashes.
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
    purge(cb) {
        const {
            table
        } = this;

        this.close(() => {
            delLength.bind(this)();
            this.length = 0;
            table.clear();
            cb(null, null)
        });
    }

    _blocks(i, j) {
        const {
            chunkSize
        } = this;
        return blocks(chunkSize, i, j)
    }

    async __open() {
        if (!this.db.isOpen()) await this.db.open();
    }

    async _open(req) {
        try {
            await this.__open();
            await getLength.bind(this)();
            req.callback(null, null);
        } catch (e) {
            req.callback(e);
        }
    }

    async _read(req) {
        await this.__open();

        let {
            offset, size
        } = req;

        if (size === 0) return req.callback(null, b4a.alloc(0));

        const {
            table, length, chunkSize
        } = this;

        if (length === 0) {
            const error = new Error("No file");
            error.code = "ENOENT";
            return req.callback(error, null);
        }
        if (size === Number.POSITIVE_INFINITY) size = length - offset;

        if ((length || 0) < offset + size) {
            return req.callback(new Error('Could not satisfy length'))
        }

        const blocks = this._blocks(offset, offset + size);
        const [{block: firstBlock}] = blocks;
        const {block: lastBlock} = blocks[blocks.length - 1];

        let cursor = 0;
        try {
            const bufferObject = (await table.where("chunk")
                .between(firstBlock, lastBlock, true, true)
                .toArray())
                .reduce((acc, {data, chunk}) => {
                    cursor = chunk - firstBlock;
                    const {start, end} = blocks[cursor];
                    acc[chunk] = b4a.from(data.slice(start, end));
                    return acc;
                }, {});


            req.callback(null, b4a.concat(blocks.map((o) => bufferObject[o.block] || b4a.alloc(chunkSize))));
        } catch (e) {
            req.callback(e);
        }
    }

    async _write(req) {
        await this.__open();

        const {
            table, chunkSize, length, db
        } = this;

        const {
            offset, data
        } = req;

        const blocks = this._blocks(offset, offset + data.length);
        const [{block: firstBlock}] = blocks;
        const {block: lastBlock} = blocks[blocks.length - 1];
        let newLength;

        db.transaction("readwrite", table, async function () {
            const chunks = (await table.where("chunk")
                .between(firstBlock, lastBlock, true, true)
                .toArray())
                .map(({data}) => data);

            let cursor = 0;
            let i = 0;
            const ops = [];


            for (const {block, start, end} of blocks) {
                const blockPos = i++;
                const blockRange = end - start;

                if (blockRange === chunkSize) {
                    chunks[blockPos] = b4a.from(data.slice(cursor, cursor + blockRange));
                } else {
                    chunks[blockPos] ||= b4a.from(b4a.alloc(chunkSize));
                    b4a.copy(b4a.from(data), chunks[blockPos], start, cursor, cursor + blockRange);
                }

                ops.push({chunk: block, data: b4a.from(chunks[blockPos])});

                cursor += blockRange;
            }

            newLength = Math.max(length || 0, offset + data.length);
            await table.bulkPut(ops);
        })
            .then(() => {
                this.length = newLength;
                req.callback(null);
                putLength.bind(this)()
            })
            .catch(e => {
            req.callback(e);
        });

    }

    async _del(req) {
        await this.__open();

        let {
            offset, size
        } = req;

        const {
            length, table, chunkSize
        } = this;

        if (size === Number.POSITIVE_INFINITY) size = req.size = length - offset;

        if (offset + size > length) {
            size = req.size = Math.max(0, length - offset)
        }

        if (offset + size >= length) {
            return this._truncate(req);
        }

        const blocks = this._blocks(offset, offset + size);
        const firstBlock = blocks.shift();
        const lastBlock = blocks.pop() || firstBlock;
        const deleteBlockCount = lastBlock.block - firstBlock.block;

        if (deleteBlockCount > 1) {
            // Delete anything in between.
            await table.where("chunk")
                .between(firstBlock.block, lastBlock.block, false, false)
                .delete();
        }

        // handle the edges
        const [first, last] = await table.where("chunk")
            .between(firstBlock.block, lastBlock.block, true, true)
            .toArray();


        if (first) {
            const end = last ? firstBlock.end : firstBlock.end - firstBlock.start;
            const empty = b4a.alloc(end);
            b4a.copy(empty, first.data, firstBlock.start);
            await table.put(first);
        }

        if (last) {
            const end = Math.min(lastBlock.end, chunkSize);
            const empty = b4a.alloc(end);
            b4a.copy(empty, last.data, lastBlock.start);
            await table.put(last);
        }

        req.callback(null);
    }

    async _truncate(req) {
        await this.__open();

        const {
            offset
        } = req;

        const {
            length, chunkSize, table
        } = this;

        if (offset === length) {
            // nothing
            return req.callback(null, null);
        } else if (offset > length) {
            // grow
            return this.write(length, b4a.alloc(req.offset - length), (err) => {
                if (err) return req.callback(err, null);
                req.callback(null, null);
            });
        }

        // Shrink
        const blocks = this._blocks(offset, length);
        const [{block: firstBlock, start, end}] = blocks;

        try {
            await table.where("chunk").above(firstBlock).delete();
            const blockRange = end - start;
            if (blockRange === chunkSize) {
                await table.delete(firstBlock);
            } else {
                let {data, chunk} = await table.get(firstBlock);
                let truncatedData = b4a.alloc(blockRange);
                b4a.copy(truncatedData, data, start, start, blockRange)
                await table.put({
                    chunk, data
                })
            }
            this.length = offset;
            putLength.bind(this)();
            req.callback(null, null);
        } catch (e) {
            req.callback(e, null);
        }
    }

    _stat(req) {
        // todo: add metadata to file entry to hold the chunk size (chunk size),
        //       and other information about the file like user specific
        //       data, author, creation time, pre-calculated hashes.
        getLength.bind(this)().then((len) => req.callback(null, {size: len}));
    }

    _close(req) {
        const {
            key
        } = this;
        // It really makes no sense to me to close the file
        // the only thing I can think of is to keep a count of each file opened
        // per database, and once each file of that database is closed, just close the
        // database as a whole. But, I really don't see why unless someone can
        // enlighten me.
        allLoadedFiles.delete(key)
        req.callback(null, null);
    }


}

export function makeKey(sep, dbName, fileName) {
    return [dbName, fileName].join(sep);
}

let defaultFileMaker;

/**
 * Open database 'dbName=rai' then you can create files from the same function.
 *
 * This is the same as openDatabase("rai")(fileName); or openDatabase()(fileName);
 *
 * @function make
 * @param fileName file to create
 * @param config See config for openDatabase function
 * @returns {RandomAccessIdb} RandomAccessIdb instance.
 */
export default function make(fileName, config = {}) {
    if (!defaultFileMaker?.db.isOpen()) {
        defaultFileMaker = openDatabase(undefined, config);
    }

    return defaultFileMaker(fileName);
};

export {make};