import b4a from 'b4a';
import * as IDB from 'idb';
import { blocks } from './lib/blocks.js';
import { metaManager } from './lib/MetaManager.js';
import { QueueManager } from './lib/QueueManager.js';
import EventEmitter from 'tiny-emitter';

class RandomAccessIdb extends EventEmitter {
    constructor(fileName, config = {}) {
        super();

        // Set metadata and initialize properties
        this.suspended = false;
        this.opened = false;
        this.closed = true;
        this.meta = {
            chunkSize: 4096,
            ...config,
            fileName, // Default chunk size
            length: 0,
        };
        this.queue = new QueueManager();  // QueueManager for sequential task handling
        this.metaManager = metaManager;  // MetaManager for handling metadata

        // this._writeBlocks = this._writeBlocks.bind(this); // Bind the method for consistent access
        this._initializeDB();  // Initialize the database connection immediately
    }

    // Ensure that the database is initialized only once
    async _initializeDB() {
        if (this.db && this.opened && !this.closed) {
            // console.log('Database is already initialized and open.');
            return;  // Exit if the database is already initialized and open
        }

        try {
            this.db = await openFile(this.fileName, { chunkSize: this.chunkSize });
            // console.log(`Database for file ${this.fileName} opened successfully.`);
            const meta = await this.metaManager.get(this.fileName);
            this.meta = meta || { fileName: this.fileName, chunkSize: this.chunkSize, length: 0 };
            this.opened = true;
            this.closed = false;
        } catch (err) {
            // console.error(`Failed to open database for ${this.fileName}:`, err);
        }
    }

    async ready() {
        if (!this.opened) {
            await this._initializeDB();
        }
    }

    async ensureDBReady() {
        if (!this.opened || this.closed) {
            await this._initializeDB();  // Initialize if the database is not open
        }

        // Check if the database has been purged or closed
        if (!this.db) {
            // console.warn('Database has been purged. Reinitializing as a new file.');
            await this._initializeDB();  // Reinitialize if the database was purged
        }
    }

    get fileName() {
        return this.meta.fileName;
    }

    get chunkSize() {
        return this.meta.chunkSize;
    }

    get length() {
        return this.meta.length;
    }

    get paused() {
        return this.queue.isPaused;
    }

    // Open the database and load metadata
    open(cb = () => {}) {
        this.ready()
            .then(async (db) => {
                this.db = db;
                const meta = await metaManager.get(this.fileName);  // Retrieve metadata for this file
                this.meta = meta || { fileName: this.fileName, chunkSize: this.chunkSize, length: 0 };  // Default meta if null
                this.opened = true;
                this.closed = false;
                cb(null);
            })
            .catch(err => cb(err));
    }

    write(offset, data, cb = () => {}) {
        this.queue.addTask(async () => {
            await this.ensureDBReady();

            const blocks = this._blocks(offset, offset + data.length);
            const db = this.db;
            const tx = db.transaction('chunks', 'readwrite');
            const store = tx.objectStore('chunks');

            let cursor = 0;

            for (const { block, start, end } of blocks) {
                const chunk = await store.get(block) || { data: b4a.alloc(this.chunkSize) };
                const chunkDataLength = end - start;
                b4a.copy(b4a.from(data), chunk.data, start, cursor, cursor + chunkDataLength);

                await store.put({ chunk: block, data: chunk.data });
                cursor += chunkDataLength;
            }

            await tx.done;

            const newLength = Math.max(this.meta.length, offset + data.length);
            this.meta.length = newLength;
            await this.metaManager.set(this.meta);

            cb(null);
        }).catch(cb);
    }

    read(offset, size, cb = () => {}) {
        this.queue.addTask(async () => {
            await this.ensureDBReady();

            const length = this.meta.length;
            if (offset + size > length) {
                const e = new Error(`Error: offset + size (${offset + size}) is greater than the file length (${length})`);
                e.code = "EINVAL";
                return cb(e);
            }

            const blocks = this._blocks(offset, offset + size);
            const db = this.db;
            const tx = db.transaction('chunks', 'readonly');
            const store = tx.objectStore('chunks');
            const result = [];

            for (const { block, start, end } of blocks) {
                const chunk = await store.get(block);
                if (chunk && chunk.data) {
                    result.push(chunk.data.slice(start, end));
                } else {
                    result.push(b4a.alloc(end - start, 0));
                }
            }

            await tx.done;
            const finalResult = result.length ? b4a.concat(result) : b4a.alloc(0);
            cb(null, finalResult);
        }).catch(cb);
    }

    del(offset, size, cb = () => {}) {
        this.queue.addTask(async () => {
            await this.ensureDBReady();

            // Retrieve the latest metadata before performing the delete
            const meta = await this.metaManager.get(this.fileName);
            this.meta = meta || { fileName: this.fileName, chunkSize: this.chunkSize, length: 0 };

            // console.log(`Current file length before deletion: ${this.meta.length}`);

            if (size === Infinity) {
                size = this.meta.length - offset;
            }

            if (offset >= this.meta.length || size <= 0) {
                // console.warn(`Invalid range: offset ${offset}, size ${size}, length ${this.meta.length}`);
                return cb(new Error('Invalid range for deletion'));
            }

            const endOffset = offset + size;

            // If the deletion size plus offset reaches or exceeds the end of the file, defer to the truncate method
            if (endOffset >= this.meta.length) {
                // console.log(`Deferring deletion to truncate at offset ${offset}`);
                return this.truncate(offset, cb);  // Call the truncate function to handle the shrinkage
            }

            // Proceed with the usual deletion and zero-filling logic
            const blocks = this._blocks(offset, endOffset);
            // console.log('Calculated blocks for deletion:', blocks);

            const db = this.db;
            const tx = db.transaction('chunks', 'readwrite');
            const store = tx.objectStore('chunks');

            const [{ block: firstBlock, start, end }] = blocks;
            const chunk = await store.get(firstBlock);
            if (chunk && chunk.data) {
                const retainedData = chunk.data.slice(0, start);  // Retain the part before the deletion range
                const zeroFill = b4a.alloc(end - start, 0);       // Zero-fill the deleted range
                const remainingData = chunk.data.slice(end);      // Retain the part after the deletion range
                const finalChunkData = b4a.concat([retainedData, zeroFill, remainingData]);  // Concatenate all parts

                await store.put({ chunk: firstBlock, data: finalChunkData });
            }

            // Zero-fill the remaining blocks
            for (const { block } of blocks.slice(1)) {
                await store.put({ chunk: block, data: b4a.alloc(this.chunkSize) });
            }

            await tx.done;

            const newLength = Math.max(this.meta.length, offset + size);
            this.meta.length = newLength;
            await this.metaManager.set(this.meta);  // Persist the updated metadata after deletion

            // console.log(`Deletion complete. File length is now ${newLength}`);
            cb(null);
        }).catch(cb);
    }

    close(cb = () => {}) {
        this.queue.addTask(async () => {
            try {
                // Ensure any pending operations are completed
                await this.ensureDBReady();
                this.db = null;
                this.meta = null;
                this.queue = null; // Assuming the queue should also be cleared
                // console.log('File closed successfully');
                this.emit('close');
                cb(null);
            } catch (error) {
                // console.error('Error during close:', error.message);
                cb(error);
            }
        }).catch(cb);
    }

    truncate(offset, cb = () => {}) {
        this.queue.addTask(async () => {
            await this.ensureDBReady();

            const length = this.meta.length;

            if (offset > length) {
                // Expand the file by zero-padding the gap between the old and new length
                return this.write(length, b4a.alloc(offset - length), cb);
            }

            const blocks = this._blocks(offset, length);
            const db = this.db;
            const tx = db.transaction('chunks', 'readwrite');
            const store = tx.objectStore('chunks');

            // Delete chunks beyond the truncation point
            for (const { block } of blocks.slice(1)) {
                await store.delete(block);
            }

            // Zero out remaining data up to the chunk boundary within the first block
            const [{ block: firstBlock, start }] = blocks;
            const chunk = await store.get(firstBlock);
            if (chunk && chunk.data) {
                const truncatedData = b4a.alloc(chunk.data.length);
                b4a.copy(chunk.data, truncatedData, 0, 0, start);  // Retain data up to the truncation point
                await store.put({ chunk: firstBlock, data: truncatedData });
            }

            await tx.done;

            this.meta.length = offset;  // Update the file length after truncation
            await this.metaManager.set(this.meta);

            cb(null);
        }).catch(cb);
    }

    // Retrieve file metadata
    stat(cb = () => {}) {
        this.queue.addTask(async () => {
            await this.ensureDBReady();
            let err;
            // Check if the file metadata exists
            if (!this.meta || !this.meta.fileName || this.meta.length === 0) {
                err = new Error('File does not exist');
                err.code = 'ENOENT';  // Attach ENOENT code
                // console.error('Error in stat:', err.message);
            }

            // Return the file's stats (e.g., length, metadata)
            const stats = {
                length: this.meta.length,
                size: this.meta.length,
                chunkSize: this.meta.chunkSize,
                fileName: this.meta.fileName
            };

            cb(err, stats);  // Successfully return stats
        }).catch(cb);
    }

    suspend(cb = () => {}) {
        this.queue.pauseQueue();
        setTimeout(() => {
            this.emit('suspend');
            cb();
        }, 0);
    }

    purge(cb = () => {}) {
        this.queue.resumeQueue();
        this.queue.addTask(async () => {
            await this.ensureDBReady().catch(e => false);

            try {
                // console.log(`Purging file ${this.fileName}`);

                // Delete the file from IndexedDB
                await IDB.deleteDB(this.fileName);

                // Delete the metadata associated with this file
                await this.metaManager.del(this.fileName);

                // Mark the database as purged by setting db to null
                this.db = null;

                // Reset the metadata specific to this file
                this.meta = {fileName: this.fileName, chunkSize: this.chunkSize, length: 0};

                // Remove the file from the allLoadedFiles map
                allLoadedFiles.delete(this.fileName);
                // console.log(`Removed ${this.fileName} from allLoadedFiles`);

                // console.log(`Purge complete for file ${this.fileName}`);
            } catch (e) {
                cb(null);
            }
            cb(null);
        }).catch(cb);  // Handle any errors
    }

    _blocks(start, end) {
        return blocks(this.chunkSize, start, end);
    }
}

// Exported map for loaded files
export const allLoadedFiles = new Map(); // Using the standard Map

export async function openFile(fileName, config = {}) {
    const {
        openBlockingHandler = (currentVersion, blockedVersion, event) => {
            // console.warn(`Database ${fileName} is blocking the upgrade (currentVersion: ${currentVersion}, blockedVersion: ${blockedVersion}). Closing this connection.`);
            event.target.close();  // Automatically close the current connection
        },
        openBlockedHandler = (event) => {
            // console.warn(`Database ${fileName} is blocked by an existing connection. Closing this connection.`);
            event.target.close();  // Automatically close the current connection
        }
    } = config;

    return await IDB.openDB(fileName, undefined, {
        upgrade(db) {
            const dataStore = db.createObjectStore('chunks', {
                keyPath: 'chunk',
                autoIncrement: false,
            });

            // Create indexes if needed
            dataStore.createIndex('data', 'data');
        },
        blocking(currentVersion, blockedVersion, event) {
            openBlockingHandler?.(currentVersion, blockedVersion, event);
        },
        blocked(...args) {
            openBlockedHandler?.(...args);
        }
    });
}

export function createFile(fileName, config = {}) {
    const { chunkSize = 4096, directory = '' } = config;

    // Ensure the file name is adjusted if a directory is provided
    if (directory) {
        fileName = `${directory}/${fileName}`;
    }

    // Check if the file is already loaded
    if (allLoadedFiles.has(fileName)) {
        const ras = allLoadedFiles.get(fileName);
        if (!ras.closed) {
            return ras;  // Return the already loaded instance
        } else {
            allLoadedFiles.delete(fileName);  // If closed, remove it
        }
    }

    // Create a new instance of RandomAccessIdb
    const ras = new RandomAccessIdb(fileName, { chunkSize });
    allLoadedFiles.set(fileName, ras);  // Store it in the map

    return ras;
}

export default createFile;
