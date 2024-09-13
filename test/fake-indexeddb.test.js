import { test } from 'brittle';
import 'fake-indexeddb/auto';  // Simulate IndexedDB environment
import { openDB } from 'idb';   // Import openDB from idb for IndexedDB handling

// Test 1: Basic Write and Read Operation (Isolated)
test('fake-indexeddb basic write and read operations', async t => {
    t.plan(2);

    // Unique database name for isolation
    const uniqueDBName = `testDB_${Date.now()}`;

    // Open a database and create an object store
    const db = await openDB(uniqueDBName, 1, {
        upgrade(db) {
            const store = db.createObjectStore('store', { keyPath: 'id' });
            store.createIndex('value', 'value');
        }
    });

    // Write operation
    const tx = db.transaction('store', 'readwrite');
    const store = tx.objectStore('store');
    await store.put({ id: 1, value: 'hello world' });
    await tx.done;

    // Read operation
    const readTx = db.transaction('store', 'readonly');
    const readStore = readTx.objectStore('store');
    const result = await readStore.get(1);
    await readTx.done;

    t.is(result.value, 'hello world', 'Should return the correct value');
    db.close();
    // Clean up: Delete the database
    await indexedDB.deleteDatabase(uniqueDBName);
    t.pass('Database deleted successfully');
});

// Test 2: Truncation and Deletion Test (Isolated)
test('fake-indexeddb truncation and deletion test', async t => {
    t.plan(3);

    const uniqueDBName = `testDB2_${Date.now()}`;  // Unique database name

    // Open a database with an object store for testing truncation
    const db = await openDB(uniqueDBName, 1, {
        upgrade(db) {
            const store = db.createObjectStore('store', { keyPath: 'id' });
        }
    });

    // Write some data
    const tx = db.transaction('store', 'readwrite');
    const store = tx.objectStore('store');
    await store.put({ id: 1, data: 'This is some data' });
    await tx.done;

    // Check the data before truncation
    const readTx = db.transaction('store', 'readonly');
    const readStore = readTx.objectStore('store');
    let result = await readStore.get(1);
    t.is(result.data, 'This is some data', 'Should read the correct data before truncation');
    await readTx.done;

    // Perform truncation by putting a shorter data item
    const truncateTx = db.transaction('store', 'readwrite');
    const truncateStore = truncateTx.objectStore('store');
    await truncateStore.put({ id: 1, data: 'Truncated' });
    await truncateTx.done;

    // Check the data after truncation
    const verifyTx = db.transaction('store', 'readonly');
    const verifyStore = verifyTx.objectStore('store');
    result = await verifyStore.get(1);
    t.is(result.data, 'Truncated', 'Should return truncated data');
    db.close();
    // Clean up: Delete the database
    await indexedDB.deleteDatabase(uniqueDBName);
    t.pass('Database deleted successfully');
});

// Test 3: Write, Delete, and Metadata Handling (Isolated)
test('fake-indexeddb write, delete, and metadata handling', async t => {
    t.plan(4);

    const uniqueDBName = `testDB3_${Date.now()}`;  // Unique database name

    // Step 1: Open a database and ensure the chunks object store is created
    const db = await openDB(uniqueDBName, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('chunks')) {
                db.createObjectStore('chunks', { keyPath: 'chunk' });
            }
        }
    });

    // Step 2: Write 3KB of data into the database
    const writeTx = db.transaction('chunks', 'readwrite');
    const store = writeTx.objectStore('chunks');
    await store.put({ chunk: 0, data: 'D'.repeat(3072) });  // Writing 3KB of 'D'
    await writeTx.done;

    // Step 3: Read the data back to ensure it was written correctly
    const readTx = db.transaction('chunks', 'readonly');
    const readStore = readTx.objectStore('chunks');
    let result = await readStore.get(0);
    t.is(result.data.length, 3072, 'Should read back 3KB of data');
    await readTx.done;

    // Step 4: Delete data from 512 onwards
    const deleteTx = db.transaction('chunks', 'readwrite');
    const deleteStore = deleteTx.objectStore('chunks');
    const chunk = await deleteStore.get(0);
    if (chunk && chunk.data) {
        const retainedData = chunk.data.slice(0, 512);  // Keep only the first 512 bytes
        await deleteStore.put({ chunk: 0, data: retainedData });
    }
    await deleteTx.done;

    // Step 5: Read the data back to ensure the deletion worked
    const readBackTx = db.transaction('chunks', 'readonly');
    const readBackStore = readBackTx.objectStore('chunks');
    result = await readBackStore.get(0);
    t.is(result.data.length, 512, 'Should retain only 512 bytes after deletion');
    await readBackTx.done;

    // Step 6: Verify metadata handling
    const metadataTx = db.transaction('chunks', 'readwrite');
    const metadataStore = metadataTx.objectStore('chunks');
    await metadataStore.put({ chunk: 'meta', length: 512 });  // Simulating a metadata entry for file length
    await metadataTx.done;

    const verifyMetadataTx = db.transaction('chunks', 'readonly');
    const verifyMetadataStore = verifyMetadataTx.objectStore('chunks');
    const metadata = await verifyMetadataStore.get('meta');
    t.is(metadata.length, 512, 'Metadata should reflect the correct file length after deletion');
    await verifyMetadataTx.done;
    db.close();
    // Clean up: Delete the database
    await indexedDB.deleteDatabase(uniqueDBName);
    t.pass('Database deleted successfully');
});
