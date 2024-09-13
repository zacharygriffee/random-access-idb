// MetaManager.js
import { openDB } from 'idb';

class MetaManager {
    constructor() {
        this.db = null;
    }

    // Singleton pattern to ensure only one instance
    static getInstance() {
        if (!MetaManager.instance) {
            MetaManager.instance = new MetaManager();
        }
        return MetaManager.instance;
    }

    // Open the meta database and ensure proper setup
    async _openMetaDB() {
        if (!this.db) {
            this.db = await openDB('###meta', 1, {
                upgrade(db) {
                    const store = db.createObjectStore('meta', {
                        keyPath: 'fileName',
                        autoIncrement: false,
                    });

                    store.createIndex('length', 'length');
                    store.createIndex('type', 'type');
                    store.createIndex('chunkSize', 'chunkSize');
                }
            });
        }
        return this.db;
    }

    // Check if metadata exists for a specific file
    async exists(fileName) {
        if (!fileName) {
            throw new Error('fileName is required to check metadata existence');
        }

        const db = await this._openMetaDB();
        const tx = db.transaction('meta', 'readonly');
        const store = tx.objectStore('meta');

        const result = await store.getKey(fileName);  // getKey returns null if no matching record
        await tx.done;

        return result !== undefined && result !== null;  // Return true if file exists, false otherwise
    }

    // Retrieve metadata for a specific file
    async get(fileName) {
        const db = await this._openMetaDB();
        const tx = db.transaction('meta', 'readonly');
        const store = tx.objectStore('meta');

        if (!fileName) {
            throw new Error('fileName is required for retrieving metadata');
        }

        const result = await store.get(fileName);
        await tx.done;

        return result;
    }

    async set(meta) {
        if (!meta || !meta.fileName) {
            throw new Error('fileName is required in the metadata');
        }

        const db = await this._openMetaDB();
        const tx = db.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');

        await store.put(meta);
        await tx.done;
    }

    // Delete metadata for a specific file
    async del(fileName) {
        const db = await this._openMetaDB();
        const tx = db.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');

        if (!fileName) {
            throw new Error('fileName is required for deleting metadata');
        }

        await store.delete(fileName);
        await tx.done;
    }
}

// Exporting the singleton instance
const metaManager = MetaManager.getInstance();
export { metaManager };
