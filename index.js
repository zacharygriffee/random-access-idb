import Dexie from "dexie";
import RandomAccessStorage from "random-access-storage";
import {blocks} from "./lib/blocks.js";
import b4a from "b4a";

// todo: add a file metadata for stats
//       like block size (chunk size) as to ensure
//       a file is always opened with
//       its original block size
//       among other stats.
//
// todo: Error handling testing. Currently, unlikely
//       indexeddb errors have not been tested

/**
 * Current default configurations.
 * @type {{chunkSize: number, MapClass: MapConstructor}}
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
 * Create an indexeddb database entry
 *
 * @example // File creation example
 *
 * const fileMaker = create();
 * const rai = fileMaker("helloWorld.txt");
 * rai.write(0, Buffer.from("hello world!!!"));
 *
 * @param [dbName="rai"] The name of the database
 * @param [config] Optional configurations
 * @param [config.chunkSize=4096] The chunk size of the files created from the created database.
 * When reopened, it should have the same size it was created with.
 * @param [config.size=4096] Alias of {@link config.chunkSize}
 * @returns Function<RandomAccessIdb>
 */
export function openDatabase(dbName = "rai", config = {}) {
    if (typeof config === "number") config = {chunkSize: config};
    const MapClass = defaultConfig.MapClass;
    const {

        size,
        chunkSize = size || defaultConfig.chunkSize
    } = config;

    if (!RandomAccessIdb.loadedFiles) RandomAccessIdb.loadedFiles = new MapClass();
    const db = new Dexie(dbName);

    maker.db = db;
    return maker;

    /**
     * Creates the random access storage instance of a file.
     * @param fileName
     * @returns {RandomAccessIdb} RandomAccessIdb class instance
     */
    function maker(fileName) {
        const key = dbName + "#" + fileName + "#length";
        if (RandomAccessIdb.loadedFiles.has(key)) {
            return RandomAccessIdb.loadedFiles.get(key);
        }

        if (!(this instanceof RandomAccessIdb)) {
            return maker.call(new RandomAccessIdb(), fileName);
        }

        db.version(1).stores({
            [fileName]: '++chunk,data'
        });

        const instance = Object.defineProperties(this, {
            length: {
                get() {
                    return Number(localStorage.getItem(key) || 0);
                }, set(newLength) {
                    if (newLength === 0) return localStorage.removeItem(key);
                    localStorage.setItem(key, newLength);
                }
            }, fileName: {
                get() {
                    return fileName
                }
            }, db: {
                get() {
                    return db
                }
            }, table: {
                get() {
                    return db[fileName];
                }
            }, chunkSize: {
                get() {
                    return chunkSize;
                }
            }, dbName: {
                get() {
                    return dbName;
                }
            }
        });

        RandomAccessIdb.loadedFiles.set(key, instance);
        return instance;
    }
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
 * @property {Dexie} db
 * The db this file is created under.
 * @property {Dexie.Table} Table
 * The table in the db this file is created.
 * @property {number} chunkSize
 * The chunk size this file is stored on the database.
 * @property {string} dbName
 * The database name this file is stored on.
 */
class RandomAccessIdb extends RandomAccessStorage {
    static loadedFiles;

    _blocks(i, j) {
        const {
            chunkSize
        } = this;
        return blocks(chunkSize, i, j)
    }

    async __open() {
        const {
            db
        } = this;
        if (!db.isOpen()) await db.open();
    }

    async _open(req) {
        try {
            await this.__open();
            req.callback(null, null);
        } catch (e) {
            req.callback(e);
        }
    }

    async _read(req) {
        let {
            offset, size
        } = req;

        if (size === 0) return req.callback(null, b4a.alloc(0));

        const {
            table, length, chunkSize
        } = this;

        await this.__open();

        if (length === 0) {
            const error = new Error("No file");
            error.code = "ENOENT";
            return req.callback(error, null);
        }
        if (size === Number.POSITIVE_INFINITY) size = offset + length;

        if ((length || 0) < offset + size) {
            return req.callback(new Error('Could not satisfy length'))
        }

        const blocks = this._blocks(offset, offset + size);
        const [{block: firstBlock}] = blocks;
        const [{block: lastBlock}] = [...blocks].reverse();

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
        const {
            table, chunkSize, length, db
        } = this;

        const {
            offset, data
        } = req;

        await this.__open();

        const blocks = this._blocks(offset, offset + data.length);
        const [{block: firstBlock}] = blocks;
        const [{block: lastBlock}] = [...blocks].reverse();
        let newLength;

        db.transaction("readwrite", table,
            async function () {
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
            }).catch(e => {
            req.callback(e);
        });

    }

    async _del(req) {
        let {
            offset, size
        } = req;

        const {
            length, table, chunkSize
        } = this;

        await this.__open();

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
        const {
            offset
        } = req;

        const {
            length, chunkSize, table
        } = this;

        await this.__open();

        if (offset === length) {
            return req.callback(null, null);
        } else if (offset > length) {
            const oldLength = length;
            return this.write(length, b4a.alloc(req.offset - length), (err) => {
                if (err) return req.callback(err, null);
                this.length = oldLength;
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
                let truncatedData = b4a.alloc(blockRange);
                let {data, chunk} = await table.get(firstBlock);
                b4a.copy(truncatedData, data, start, start, blockRange)
                await table.put({
                    chunk, data
                })
            }
            this.length = offset;
            req.callback(null, null);
        } catch (e) {
            req.callback(e, null);
        }
    }

    _stat(req) {
        // todo: add metadata to file entry to hold the chunk size (chunk size),
        //       and other information about the file like user specific
        //       data, author, creation time, pre-calculated hashes.
        this.__open().then(
            () => req.callback(null, {size: this.length})
        );
    }

    _close(req) {
        // It really makes no sense to me to close the file
        // the only thing I can think of is to keep a count of each file opened
        // per database, and once each file of that database is closed, just close the
        // database as a whole. But, I really don't see why unless someone can
        // enlighten me.
        req.callback(null, null);
    }
}

/**
 * Get a map of all loaded files.
 *
 * @example
 * // You could do this
 * rai("helloWorld.txt");
 * allLoadedFiles.get("helloWorld.txt").read(0, 5, (e, v) => {});
 * @type Map | config.MapClass
 */
export const allLoadedFiles = RandomAccessIdb.loadedFiles

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