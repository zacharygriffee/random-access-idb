import * as IDB from "idb/build/index.js";

const meta = await (class Meta {
    static async create() {
        const meta = new this();
        meta.db = await IDB.openDB("###meta", undefined, {
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
        return meta;
    }

    del(fileName) {
        const tx = this.db.transaction("meta", "readwrite");
        const store = tx.objectStore('meta');
        return store.delete(fileName).then(async (x) => {
            await tx.done;
            return x;
        }).catch(e => {
            console.log("Failed to del meta", e);
            return false;
        });
    }

    get(fileName) {
        const tx = this.db.transaction("meta", "readonly");
        const store = tx.objectStore('meta');

        return store.get(fileName).then(
            async (result) => {
                await tx.done
                return result;
            }
        ).catch(e => {
            console.log("Failed to get meta", e);
            return false;
        })
    }

    async set(meta) {
        const tx = this.db.transaction("meta", "readwrite");
        const store = tx.objectStore("meta");
        await store.put(meta);
        return tx.done;
    }
}).create();
export {meta};
