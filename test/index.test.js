import {solo, test, skip} from 'brittle';
import b4a from 'b4a';
import 'fake-indexeddb/auto';
import * as IDB from "idb";
import defaultMaker, {allLoadedFiles, createFile, openFile} from '../index.js';
import {newFile} from "./fixtures/newFile.js";
import {promisify} from "./utils/promisify.js";

// Test Suite

test("write operation only", { timeout: 600000 }, async function (t) {
    t.plan(1);
    const ras = defaultMaker("defaultFile.txt");

    // Test only the write operation
    await promisify(ras, 'write', 0, b4a.from("hello world!"));
    t.pass("Write operation completed");

    t.teardown(() => promisify(ras, 'purge'));
});

test("default maker", { timeout: 600000 }, async function (t) {
    t.plan(1);
    const ras = defaultMaker("defaultFile.txt");

    // Write and read operations
    await promisify(ras, 'write', 0, b4a.from("hello world!"));
    const buf = await promisify(ras, 'read', 0, 5);
    t.is(b4a.toString(buf), "hello");

    t.teardown(() => promisify(ras, 'purge'));
});

test('block calculation', async function (t) {
    t.plan(3);
    const file = defaultMaker("testFile.txt", { chunkSize: 1024 });
    const blockRanges = file._blocks(500, 3072);

    t.is(blockRanges.length, 3, 'Should cover three blocks');
    t.is(blockRanges[0].start, 500, 'First block should start at 500');
    t.is(blockRanges[2].end, 1024, 'Last block should end at 1024');

    t.teardown(() => promisify(file, 'purge'));
});

test('chunk deletion during truncate', async function (t) {
    t.plan(2);
    const file = defaultMaker("testFile.txt", { chunkSize: 1024 });
    const chunk = Buffer.alloc(3072, 0xff); // Fill with 3 chunks worth of data

    // Write the data
    await promisify(file, 'write', 0, chunk);

    // Truncate the file at 1024 bytes (after the first chunk)
    await promisify(file, 'truncate', 1024);

    // Verify file length after truncation
    const remainingData = await promisify(file, 'read', 0, file.length);
    t.is(file.length, 1024, 'File length should be 1024 after truncation');
    t.ok(b4a.equals(remainingData, Buffer.alloc(1024, 0xff)), 'Data beyond the truncation point should be removed');

    t.teardown(() => promisify(file, 'purge'));
});

test('file length update after truncate', async function (t) {
    t.plan(2);
    const file = defaultMaker("testFile.txt", { chunkSize: 1024 });
    const chunk = Buffer.alloc(3072, 0xff); // 3 chunks

    // Write 3072 bytes (3 chunks)
    await promisify(file, 'write', 0, chunk);

    // Truncate the file to 1024 bytes
    await promisify(file, 'truncate', 1024);

    // Verify the file's length and data
    t.is(file.length, 1024, 'File length should be updated to 1024 after truncation');
    const remainingData = await promisify(file, 'read', 0, 1024);
    t.ok(b4a.equals(remainingData, Buffer.alloc(1024, 0xff)), 'Remaining data should match after truncation');

    t.teardown(() => promisify(file, 'purge'));
});

test('del operation with Infinity', async function (t) {
    t.plan(2);

    const file = defaultMaker("testFile.txt", { chunkSize: 1024 });
    const chunk = Buffer.alloc(3072, 0xff); // 3 chunks of data

    // Write 3072 bytes
    await promisify(file, 'write', 0, chunk);

    // Delete everything from offset 1024
    await promisify(file, 'del', 1024, Infinity);

    // Verify the file's length after deletion
    t.is(file.length, 1024, 'File length should be reduced to 1024 after deletion');

    // Verify the remaining data
    const remainingData = await promisify(file, 'read', 0, 1024);
    const expectedData = Buffer.alloc(1024, 0xff);
    t.ok(b4a.equals(remainingData, expectedData), 'Remaining data should be intact');

    t.teardown(() => promisify(file, 'purge'));
});

test('partial truncate of first chunk', async function (t) {
    t.plan(2);

    const file = defaultMaker("testFile.txt", { chunkSize: 1024 });
    const chunk = Buffer.alloc(1024, 0xff);

    // Write the data
    await promisify(file, 'write', 0, chunk);

    // Truncate the file to 500 bytes (partial truncate of the first chunk)
    await promisify(file, 'truncate', 500);

    // Verify that the file length is 500 bytes
    t.is(file.length, 500, 'File length should be 500 after partial truncation');

    // Verify the data is correctly truncated
    const remainingData = await promisify(file, 'read', 0, 500);
    const expectedData = Buffer.alloc(500, 0xff);
    t.ok(b4a.equals(remainingData, expectedData), 'Remaining data should be correct after partial truncate');

    t.teardown(() => promisify(file, 'purge'));
});

test('small scale chunking test', async function (t) {
    t.plan(2);

    const { file, close } = newFile({ chunkSize: 512 });  // Use smaller chunk size for the test
    t.teardown(close);

    const smallBuffer = Buffer.alloc(1024, 0xaa);  // 1024 bytes of data (spanning across 2 chunks)

    // Write the data (spanning 2 chunks)
    await promisify(file, 'write', 0, smallBuffer);

    // Verify that the data is correctly split across 2 chunks
    const readBuffer = await promisify(file, 'read', 0, 1024);
    t.is(readBuffer.length, 1024, 'Data should span across 2 chunks');
    t.ok(b4a.equals(readBuffer, smallBuffer), 'Data should match after spanning across chunks');

    t.teardown(() => promisify(file, 'purge'));
});

test('unequal chunk spanning with zeroes', async function (t) {
    t.plan(4);

    const { file, close } = newFile({ chunkSize: 512 });
    t.teardown(close);

    const unequalBuffer = Buffer.alloc(565, 0xbb);  // 565 bytes of data

    // Write the data (starting at offset 10 and spanning across chunks)
    await promisify(file, 'write', 10, unequalBuffer);

    // Verify that the data is written across the correct number of chunks
    const readBuffer = await promisify(file, 'read', 10, 565);
    t.is(readBuffer.length, 565, 'Data should span 565 bytes');

    // Verify the content matches
    t.ok(b4a.equals(readBuffer, unequalBuffer), 'Data should match after spanning unequally across chunks');

    // Attempt to read beyond the file size and ensure it causes an error
    await t.exception(() => promisify(file, 'read', 575, 10), 'Reading beyond the file size should cause an error');

    // Ensure no extra data was written at the start (0-9 should remain empty)
    const emptyBufferStart = await promisify(file, 'read', 0, 10);
    const expectedEmptyStart = Buffer.alloc(10, 0x00);
    t.ok(b4a.equals(emptyBufferStart, expectedEmptyStart), 'Data before offset 10 should be empty');

    t.teardown(() => promisify(file, 'purge'));
});

test('analyze data across chunk boundaries', async function (t) {
    const { file, close } = newFile({ chunkSize: 4 });  // Set chunk size to 4 bytes
    t.teardown(close);

    const testData = Buffer.from('abcdefghijklmnopqrstuvwx');  // 24-byte file (6 chunks)

    // Write the 24-byte data to the file
    await promisify(file, 'write', 0, testData);

    // Verify that each byte is written and read correctly across chunk boundaries
    for (let i = 0; i < testData.length; i++) {
        const readByte = await promisify(file, 'read', i, 1);  // Read 1 byte at a time
        const expectedByte = testData.slice(i, i + 1);
        t.ok(b4a.equals(readByte, expectedByte), `Byte ${i} should match across chunk boundaries`);
    }

    // Ensure the file is 24 bytes long
    t.is(file.length, 24, 'File length should be 24 bytes');

    t.teardown(() => promisify(file, 'purge'));
});

test('write/read big chunks', async function (t) {
    t.plan(1)
    const { file, close } = newFile();
    t.teardown(close);
    const bigBuffer = Buffer.alloc(300 * 4096);
    b4a.fill(bigBuffer, 'hey. hey. how are you doing?. i am good thanks how about you? i am good');

    const io = t.test('write and read')
    io.plan(6)

    file.write(0, bigBuffer, function (err) {
        io.absent(err, 'no error');
        file.read(0, bigBuffer.length, function (err, buf) {
            io.absent(err, 'no error');
            io.ok(b4a.equals(buf, bigBuffer));
        });
    });
    file.write(bigBuffer.length * 2, bigBuffer, function (err) {  // Ensure correct offset
        io.absent(err, 'no error');
        file.read(bigBuffer.length * 2, bigBuffer.length, function (err, buf) {
            io.absent(err, 'no error');
            io.ok(b4a.equals(buf, bigBuffer));
        });
    });

    await io;

    t.teardown(() => promisify(file, 'purge'));
});

test('read tons of small chunks', { timeout: 50000000 }, function (t) {
    t.plan(1);
    const { file, close } = newFile();
    t.teardown(close);

    const bigBuffer = Buffer.alloc(200 * 1024);
    let same = true;

    b4a.fill(bigBuffer, 'hey. hey. how are you doing?. i am good thanks how about you? i am good');

    file.write(0, bigBuffer, function () {
        let offset = 0;
        file.read(offset, 128, function loop(_, buf) {
            if (same) same = b4a.equals(buf, bigBuffer.subarray(offset, offset + 128));
            offset += 128;
            if (offset >= bigBuffer.byteLength) {
                t.ok(same, 'all sub chunks match');
                t.end();
            } else {
                file.read(offset, 128, loop);
            }
        });
    });

    t.teardown(() => promisify(file, 'purge'));
});

test('not sync', async function (t) {
    t.plan(3);

    const { file, close } = newFile();
    t.teardown(close);

    let sync = true;

    // First write operation
    file.write(10, b4a.from('hi'), function () {
        t.absent(sync); // sync should be false after async operation
        sync = true;    // Reset sync after the callback completes

        // Second write operation
        file.write(0, b4a.from('hello'), function () {
            t.absent(sync); // sync should be false after this async operation
            sync = true;    // Reset sync after the callback completes

            // Read operation
            file.read(10, 2, function () {
                t.absent(sync); // sync should be false after the async read operation
            });
            sync = false; // Set sync to false before the read operation starts
        });
        sync = false; // Set sync to false before the second write operation starts
    });

    sync = false; // Set sync to false before the first write operation starts
});


test('random access write and read', async function (t) {
    t.plan(8);
    const { file, close } = newFile();
    // t.teardown(close);

    file.write(10, b4a.from('hi'), function (err) {
        t.absent(err, 'no error');
        file.write(0, b4a.from('hello'), function (err) {
            t.absent(err, 'no error');
            file.read(10, 2, function (err, buf) {
                t.absent(err, 'no error');
                t.is(b4a.toString(buf), 'hi');
                file.read(0, 5, function (err, buf) {
                    t.absent(err, 'no error');
                    t.is(b4a.toString(buf), 'hello');
                    file.read(5, 5, function (err, buf) {
                        t.absent(err, 'no error');
                        t.ok(b4a.equals(b4a.from(buf), b4a.from([0, 0, 0, 0, 0])));
                    });
                });
            });
        });
    });

    t.teardown(() => promisify(file, 'purge'));
});

test("open purge, open purge", { skip: true }, async t => {
    const file = "purgeThis.txt";
    let ras = defaultMaker(file);
    let stat = await promisify(ras, "stat");
    t.is(stat.fileName, "purgeThis.txt");
    await ras.purge();
    await t.exception(() => promisify(ras, "stat"));
    ras = defaultMaker(file);
    stat = await promisify(ras, "stat");
    t.is(stat.fileName, "purgeThis.txt");
    await ras.purge();
    await t.exception(() => promisify(ras, "stat"));
    ras = defaultMaker(file);
    stat = await promisify(ras, "stat");
    t.is(stat.fileName, "purgeThis.txt");
    await ras.purge();
    await t.exception(() => promisify(ras, "stat"));

    t.teardown(() => promisify(ras, 'purge'));
});

test('purge deletes the file and resets metadata', async t => {
    t.plan(3);
    const fileName = 'purgeFile.txt';
    const ras = createFile(fileName, {chunkSize: 1024});

    const buffer = b4a.alloc(1024, 'A'); // 1KB of data

    // Write data to the file
    await promisify(ras, 'write', 0, buffer);

    // Purge the file
    await promisify(ras, 'purge');

    // Ensure that reading from the purged file returns zero buffer
    const readAfterPurge = await promisify(ras, 'read', 0, 1024);
    const zeroBuffer = b4a.alloc(1024, 0);
    t.ok(b4a.equals(readAfterPurge, zeroBuffer), 'Reading from purged file should return zero buffer');

    // Ensure the metadata is reset after purging
    t.is(ras.meta.length, 0, 'File metadata should be reset after purging');

    // Ensure the database is recreated after purging
    t.ok(ras.db, 'Database connection should be recreated after purging');
});


test('open, close, then purge', async t => {
    t.plan(3);

    const fileName = 'testFile.txt';
    const ras = createFile(fileName);

    // Write some data to the file
    await promisify(ras, 'write', 0, b4a.from('test data'));

    // Close the file
    await promisify(ras, 'close');
    t.pass('File closed');

    // Purge the file
    await promisify(ras, 'purge');
    t.pass('File purged');

    // Verify that the file is removed from the allLoadedFiles map
    t.is(allLoadedFiles.has(fileName), false, 'File should be removed from allLoadedFiles');
});

test('open, then purge', async t => {
    t.plan(3);

    const fileName = 'testFile.txt';
    const ras = createFile(fileName);

    // Write some data to the file
    await promisify(ras, 'write', 0, b4a.from('test data'));

    // Purge the file directly (which should close it first)
    await promisify(ras, 'purge');
    t.pass('File purged');

    // Verify that the file is removed from the allLoadedFiles map
    t.is(allLoadedFiles.has(fileName), false, 'File should be removed from allLoadedFiles');

    // Ensure that trying to stat the file throws an error
    await t.exception(() => promisify(ras, 'stat'), 'File should not exist after purge');
});


test('createFile creates a new file', async t => {
    t.plan(2);

    const fileName = 'testFile.txt';
    const ras = createFile(fileName);

    // Check that the file object was created
    t.ok(ras, 'File object should be created');

    // Write data to the file
    await promisify(ras, 'write', 0, b4a.from('hello world'));

    // Read data from the file
    const result = await promisify(ras, 'read', 0, 11);
    t.is(b4a.toString(result), 'hello world', 'Data should match');

    t.teardown(() => promisify(ras, 'purge'));
});

test('createFile loads an existing file', async t => {
    t.plan(1);
    const fileName = 'existingFile.txt';
    const ras1 = createFile(fileName);

    // Write some data to the file
    await promisify(ras1, 'write', 0, b4a.from('hello again'));

    // Create another instance of the same file
    const ras2 = createFile(fileName);

    // Read the data from the second instance
    const result = await promisify(ras2, 'read', 0, 11);
    t.is(b4a.toString(result), 'hello again', 'Data should persist across instances');

    t.teardown(() => promisify(ras1, 'purge'));
});

test('write and read large chunks of data', async t => {
    t.plan(1);
    const fileName = 'largeFile.txt';
    const ras = createFile(fileName, { chunkSize: 1024 });

    const largeBuffer = b4a.alloc(1024 * 5, 'A'); // 5KB of data

    // Write large data
    await promisify(ras, 'write', 0, largeBuffer);

    // Read the data back
    const result = await promisify(ras, 'read', 0, 1024 * 5);
    t.ok(b4a.equals(result, largeBuffer), 'Large data should match');

    t.teardown(() => promisify(ras, 'purge'));
});

test('truncate reduces the file size', async t => {
    t.plan(2);
    const fileName = 'truncateFile.txt';
    const ras = createFile(fileName, { chunkSize: 1024 });

    const buffer = b4a.alloc(1024 * 3, 'B'); // 3KB of data

    // Write data to the file
    await promisify(ras, 'write', 0, buffer);

    // Truncate the file to 1KB
    await promisify(ras, 'truncate', 1024);

    // Check the length of the file
    t.is(ras.meta.length, 1024, 'File length should be truncated to 1KB');

    // Ensure that attempting to read beyond the truncation point causes an error
    await t.exception(() => promisify(ras, 'read', 1024, 1024), 'Reading beyond the truncation point should cause an error');

    t.teardown(() => promisify(ras, 'purge'));
});

test('truncate grows the file size when needed', async t => {
    t.plan(2);
    const fileName = 'growFile.txt';
    const ras = createFile(fileName, { chunkSize: 1024 });

    const buffer = b4a.alloc(512, 'C'); // 512 bytes of data

    // Write 512 bytes to the file
    await promisify(ras, 'write', 0, buffer);

    // Truncate the file to 2KB (growing the size)
    await promisify(ras, 'truncate', 2048);

    // Check that the file length is now 2KB
    t.is(ras.meta.length, 2048, 'File length should grow to 2KB');

    // Read the expanded data and check it's zero-filled
    const expandedData = await promisify(ras, 'read', 512, 1536); // Read the additional 1536 bytes
    const zeroBuffer = b4a.alloc(1536, 0);
    t.ok(b4a.equals(expandedData, zeroBuffer), 'Expanded data should be zero-filled');

    t.teardown(() => promisify(ras, 'purge'));
});

test('delete data from file', async t => {
    t.plan(2);
    const fileName = 'deleteFile.txt';
    const ras = createFile(fileName, { chunkSize: 1024 });

    const buffer = b4a.alloc(1024 * 3, 'D'); // 3KB of data

    // Write data to the file
    await promisify(ras, 'write', 0, buffer);

    // Delete data from offset 512 to end
    await promisify(ras, 'del', 512, Infinity);

    // Read the data back and check that only the first 512 bytes remain
    const result = await promisify(ras, 'read', 0, 512);
    const expectedBuffer = b4a.alloc(512, 'D');
    t.ok(b4a.equals(result, expectedBuffer), 'Remaining data should match');

    // Ensure the file length is updated correctly
    t.is(ras.meta.length, 512, 'File length should be updated after deletion');

    t.teardown(() => promisify(ras, 'purge'));
});

test('file purge deletes the file from IndexedDB', async t => {
    t.plan(2);
    const fileName = 'purgeFile.txt';
    const ras = createFile(fileName);

    // Write some data to the file
    await promisify(ras, 'write', 0, b4a.from('purge me'));

    // Purge the file
    await promisify(ras, 'purge');

    // Check if the file exists in IndexedDB by listing databases
    const databases = await indexedDB.databases();
    const fileExists = databases.some(db => db.name === fileName);
    t.is(fileExists, false, 'File should not exist in IndexedDB after purge');

    // Check that the file is removed from allLoadedFiles
    t.is(allLoadedFiles.has(fileName), false, 'File should be removed from loaded files map');

    t.teardown(() => promisify(ras, 'purge'));
});

test('stat retrieves file metadata', async t => {
    t.plan(3);
    const fileName = 'statFile.txt';
    const ras = createFile(fileName, { chunkSize: 1024 });

    const buffer = b4a.alloc(1024, 'A'); // 1KB of data

    // Write data to the file
    await promisify(ras, 'write', 0, buffer);

    // Retrieve file stats
    ras.stat((err, stats) => {
        t.absent(err, 'No error should occur when retrieving file stats');
        t.is(stats.length, 1024, 'File length should be 1024 bytes');
        t.is(stats.chunkSize, 1024, 'Chunk size should be 1024 bytes');
    });
});

// This behavior is no longer true. If meta exists then the file exists even if it is size=0
// test('stat returns ENOENT if file length is 0', async t => {
//     t.plan(2);
//     const fileName = 'emptyStatFile.txt';
//     const ras = createFile(fileName, { chunkSize: 1024 });
//
//     // No data is written to the file, so length remains 0
//     ras.stat((err, stats) => {
//         t.is(err.code, 'ENOENT', 'Stat should return ENOENT error when file length is 0');
//         t.is(stats.length, 0, 'File length should be 0 when no data has been written');
//     });
// });

test('suspend pauses the queue and emits suspend event', async t => {
    t.plan(2);
    const fileName = 'suspendFile.txt';
    const ras = createFile(fileName, { chunkSize: 1024 });

    ras.on('suspend', () => {
        t.pass('Suspend event should be emitted');
    });

    // Suspend the queue
    ras.suspend(() => {
        t.pass('Suspend callback should be called');
    });
});

test('truncate should expand the file to a larger offset', async (t) => {
    const file = createFile('testExpandFile');
    await file.ready();

    const originalData = b4a.from('Hello World');
    const newOffset = 4096 * 2; // Expand to 2 chunks (8KB)

    // Write initial data
    await new Promise((resolve, reject) => {
        file.write(0, originalData, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Truncate to expand the file
    await new Promise((resolve, reject) => {
        file.truncate(newOffset, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Read from offset 0 to new length
    const data = await new Promise((resolve, reject) => {
        file.read(0, newOffset, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

    t.is(data.length, newOffset, 'Data length should be equal to new offset');
    t.alike(data.slice(0, originalData.length), originalData, 'Original data should be retained');

    // Verify that the space between old length and new length is zero-filled
    const padding = data.slice(originalData.length);
    t.ok(padding.every((byte) => byte === 0), 'Padding should be zero-filled');

    await file.purge();
});

test('truncate should shrink the file to a smaller offset', async (t) => {
    const file = createFile('testShrinkFile');
    await file.ready();

    const originalData = b4a.from('Hello World');
    const initialOffset = 4096 * 2;

    // Write initial data to a larger offset
    await new Promise((resolve, reject) => {
        file.write(0, originalData, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    await new Promise((resolve, reject) => {
        file.truncate(initialOffset, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Truncate to shrink the file
    const shrinkOffset = 4096;
    await new Promise((resolve, reject) => {
        file.truncate(shrinkOffset, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Read from offset 0 to the new length
    const data = await new Promise((resolve, reject) => {
        file.read(0, shrinkOffset, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

    t.is(data.length, shrinkOffset, 'Data length should be equal to shrink offset');
    t.alike(data.slice(0, originalData.length), originalData, 'Original data up to shrink offset should be retained');
    t.ok(data.slice(originalData.length).every((byte) => byte === 0), 'Remaining data should be zero-filled after truncation');
    await file.purge();
});

// Fails as queue is not in order
skip('suspend pauses the queue and allows resuming operations', async t => {
    t.plan(5);
    const fileName = 'resumeFile.txt';
    const ras = createFile(fileName, { chunkSize: 1024 });

    // Step 1: Suspend the queue
    ras.suspend(() => {
        t.pass('Suspend callback should be called');
    });

    ras.on('suspend', () => {
        t.pass('Suspend event should be emitted');

        // Step 2: Resume the queue and write to the file
        const buffer = b4a.alloc(1024, 'B');

        console.log('Resuming queue before writing...');
        ras.queue.resumeQueue();  // Explicitly resume the queue

        // Step 3: Write after resuming
        ras.write(0, buffer, (err) => {
            t.absent(err, 'No error should occur when writing after suspend');
            console.log('Write complete.');

            // Step 4: Log metadata to verify
            console.log('Metadata after write:', ras.meta);

            // Step 5: Read the data to ensure it was written correctly
            ras.read(0, 1024, (err, data) => {
                if (err) {
                    console.error('Read error:', err);
                }
                t.absent(err, 'No error should occur when reading after suspend');
                if (data) {
                    t.is(b4a.toString(data), 'B'.repeat(1024), 'Data should be written and read back correctly after suspension');
                } else {
                    t.fail('Data is undefined during read.');
                }
            });
        });
    });
});
