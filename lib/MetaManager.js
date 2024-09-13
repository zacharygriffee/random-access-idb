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

    // Retrieve metadata for a specific file
    async get(fileName) {
        const db = await this._openMetaDB();
        const tx = db.transaction('meta', 'readonly');
        const store = tx.objectStore('meta');

        if (!fileName) {
            throw new Error('fileName is required for retrieving metadata');
        }

        // console.log(`Retrieving metadata for fileName: ${fileName}`);

        const result = await store.get(fileName);
        await tx.done;

        // if (!result) {
        //     console.warn(`No metadata found for fileName: ${fileName}`);
        // } else {
        //     console.log(`Retrieved metadata for ${fileName}:`, result);
        // }

        return result;
    }

    async set(meta) {
        if (!meta || !meta.fileName) {
            throw new Error('fileName is required in the metadata');
        }

        // console.log(`Setting metadata for ${meta.fileName}:`, meta);

        const db = await this._openMetaDB();
        const tx = db.transaction('meta', 'readwrite');
        const store = tx.objectStore('meta');

        await store.put(meta);
        await tx.done;
        
        // console.log(`Metadata set successfully for ${meta.fileName}`, meta);
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
