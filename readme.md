# RandomAccessIdb

`RandomAccessIdb` is a library that provides a random-access interface for IndexedDB storage in web applications. It allows for efficient reading, writing, and management of data blocks using a chunk-based approach, similar to how traditional file systems manage files.

## Features
- Supports chunk-based random access storage on top of IndexedDB.
- Provides functions to read, write, delete, and truncate data.
- Automatically manages metadata and file size.
- Supports queuing of read/write operations to ensure consistency.
- Allows purging and reinitializing storage when needed.

## Installation

You can include this library in your project by cloning the repository or importing it into your project as needed.

```sh 
    npm install @zacharygriffee/random-access-idb
```

## Usage

### 1. Creating a New File

To create a new `RandomAccessIdb` file, use the `createFile` function:

```javascript
import { createFile } from '@zacharygriffee/random-access-idb';

const ras = createFile('myFile.txt', { chunkSize: 1024 });
```

### 2. Writing Data

Use the `write` method to write data to the file. The method accepts an offset, the data buffer, and a callback function:

```javascript
const buffer = b4a.alloc(1024, 'Hello, World!'); // 1KB buffer

ras.write(0, buffer, (err) => {
    if (err) {
        console.error('Write failed:', err);
    } else {
        console.log('Write successful');
    }
});
```

### 3. Reading Data

To read data from the file, use the `read` method with the offset, size, and callback:

```javascript
ras.read(0, 1024, (err, data) => {
    if (err) {
        console.error('Read failed:', err);
    } else {
        console.log('Read data:', b4a.toString(data));
    }
});
```

### 4. Truncating the File

You can truncate the file by specifying an offset:

```javascript
ras.truncate(512, (err) => {
    if (err) {
        console.error('Truncate failed:', err);
    } else {
        console.log('Truncate successful');
    }
});
```

### 5. Deleting Data

To delete specific blocks of data, use the `del` method:

```javascript
ras.del(0, 512, (err) => {
    if (err) {
        console.error('Delete failed:', err);
    } else {
        console.log('Delete successful');
    }
});
```

### 6. Purging the File

To delete the file from IndexedDB and reset its metadata, use the `purge` method:

```javascript
ras.purge((err) => {
    if (err) {
        console.error('Purge failed:', err);
    } else {
        console.log('File purged successfully');
    }
});
```

### 7. Retrieving File Stats

To get metadata about the file (e.g., file size, chunk size), use the `stat` method:

```javascript
ras.stat((err, stats) => {
    if (err) {
        console.error('Stat failed:', err);
    } else {
        console.log('File stats:', stats);
    }
});
```

## Error Handling

This library mimics typical file system error codes, such as `ENOENT`, when trying to access a file or block that doesn’t exist. Make sure to handle errors properly in callbacks.

Example:

```javascript
ras.read(0, 1024, (err, data) => {
    if (err) {
        if (err.code === 'ENOENT') {
            console.error('File not found or empty:', err);
        } else {
            console.error('Read error:', err);
        }
    } else {
        console.log('Read successful:', data);
    }
});
```

## [API](api.md)

## License

This project is licensed under the MIT License.

---

