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
        if (this.closing || this.purging) {
            return;  // Don't reinitialize if closing or purging
        }

        if (!this.opened || this.closed) {
            await this._initializeDB();  // Initialize if the database is not open
        }

        // Check if the database has been purged or closed
        if (!this.db) {
            await this._initializeDB();  // Reinitialize if the database was purged
        }

        // Ensure metadata is properly set up with defaults
        if (!this.meta || isNaN(this.meta.length)) {
            this.meta = {
                fileName: this.fileName,
                chunkSize: this.chunkSize,
                length: 0   // Ensure valid length
            };
        }
    }


    get fileName() {
        if (!this.meta) return null;
        return this.meta.fileName;
    }

    get chunkSize() {
        return this.meta.chunkSize;
    }

    get length() {
        return this?.meta?.length || 0;
    }

    get size() {
        return this?.meta?.length || 0;
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

            // If metadata doesn't exist, initialize it with default values
            if (!this.meta || isNaN(this.meta.length)) {
                this.meta = { fileName: this.fileName, chunkSize: this.chunkSize, length: 0 };
            }

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
            this.meta.length = isNaN(newLength) ? 0 : newLength;  // Sanitize length value
            await this.metaManager.set(this.meta);  // Persist metadata

            cb(null);  // Signal success
        }).catch(cb);
    }


    read(offset, size, cb = () => {}) {
        this.queue.addTask(async () => {
            await this.ensureDBReady();

            const length = this.meta.length;

            // If the file doesn't exist, or it's empty, return a zero-byte buffer
            if (length === 0 || !this.meta) {
                return cb(null, b4a.alloc(size || 0)); // If 'size' is undefined, default to 0
            } else if (offset + size > length) {
                return cb(new FileSystemError(`Could not satisfy length. offset + size (${offset + size}) is greater than the file length (${length})`, "EINVAL"));
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
        // Check if the file is already closed
        if (this.closed) {
            console.warn('File is already closed.');
            cb(null);
            return;
        }

        // Add close task to the queue, waiting for all pending tasks
        this.queue.waitUntilQueueEmpty().then(async () => {
            try {
                // Clear the database connection and other resources
                this.db = null;
                this.queue = {};  // Clearing queue to avoid further operations
                this.closed = true; // Mark file as closed
                console.log('File closed successfully');
                cb(null);
            } catch (error) {
                console.error('Error during close:', error.message);
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
    // Retrieve file metadata
    stat(cb = () => {}) {
        this.queue.addTask(async () => {
            await this.ensureDBReady();
            let err;

            // If meta doesn't exist, assume the file doesn't exist and throw ENOENT
            const meta = await this.metaManager.get(this.fileName);
            if (!meta || isNaN(meta.length)) {
                err = new FileSystemError(`File (${this.fileName}) does not exist`, "ENOENT");

                // Provide fallback stats with length 0 and no chunkSize
                const fallbackStats = {
                    length: 0,
                    fileName: this.fileName
                };

                return cb(err, fallbackStats);  // Throw ENOENT but provide fallback stats
            }

            // Sanitize length in case it is NaN (default it to 0)
            meta.length = isNaN(meta.length) ? 0 : meta.length;

            // Return actual stats if the file exists
            const stats = {
                length: meta.length,   // Ensure length is valid
                size: meta.length,     // Provide the same value for size
                chunkSize: meta.chunkSize || undefined,  // Only include chunkSize if available
                fileName: meta.fileName
            };

            cb(null, stats);  // Return valid stats with no error if the file exists
        }).catch(cb);
    }


    suspend(cb = () => {}) {
        this.queue.pauseQueue();
        setTimeout(() => {
            this.emit('suspend'); 
            cb();
        }, 0);
    }

// Updated purge method
    async _verifyDatabaseExists() {
        if (!('databases' in indexedDB)) {
            console.warn('IndexedDB.databases() is not supported in this browser');
            return true; // Assume it exists for browsers without support
        }

        const databases = await indexedDB.databases();
        return databases.some(db => db.name === this.fileName);
    }

    purge(cb = () => {}) {
        // If the file is already closed, skip to the purge process directly
        if (this.closed) {
            console.log('File already closed, purging directly');
            this._performPurge(cb);
        } else {
            // Otherwise, queue the purge operation to ensure all pending tasks complete
            this.queue.waitUntilQueueEmpty()
                .then(() => this._performPurge(cb))
                .catch(cb);
        }
    }

    async _performPurge(cb = () => {}) {
        try {
            const dbExists = await this._verifyDatabaseExists();
            if (dbExists) {
                console.log(`Purging file ${this.fileName} from database`);

                // Attempt to delete the database
                await IDB.deleteDB(this.fileName);
                const isDeleted = !(await this._verifyDatabaseExists());

                if (!isDeleted) {
                    console.warn(`Database ${this.fileName} may not have been deleted.`);
                }
            } else {
                console.warn(`Database ${this.fileName} does not exist, skipping database deletion.`);
            }

            // Purge the metadata (always attempt this)
            await this.metaManager.del(this.fileName);
            this.db = null;  // Clear the database connection
            this.meta = { fileName: this.fileName, chunkSize: this.chunkSize, length: 0 };  // Reset metadata

            // Remove from loaded files
            allLoadedFiles.delete(this.fileName);
            console.log(`Purge complete for file ${this.fileName}`);

            cb(null);  // Success callback
        } catch (e) {
            console.error(`Error during purge: ${e.message}`);
            cb(e);
        }
    }




    unlink(cb = () => {}) {
        this.purge(cb);
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

class FileSystemError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

export default createFile;
