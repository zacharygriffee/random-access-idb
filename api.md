### API Documentation

---

## `class RandomAccessIdb`

`RandomAccessIdb` provides a random-access interface for reading and writing data in chunks using IndexedDB.

### Constructor

```javascript
new RandomAccessIdb(fileName: string, config?: object)
```

- **fileName** (string): The name of the file to be created or accessed in IndexedDB.
- **config** (object, optional): Configuration options such as:
  - `chunkSize` (number): The size of the chunks to be used for reading/writing data (default: 4096).

### Properties

- **fileName**: Returns the file name associated with the instance.
- **chunkSize**: Returns the chunk size used for this instance.
- **length**: Returns the length of the file (in bytes).

### Methods

---

#### `open(cb: function): void`

Opens the IndexedDB file and loads its metadata.

- **cb**: Callback function invoked when the operation is complete.
  - **err**: Error object (if any).
  - **db**: Database connection object.

---

#### `write(offset: number, data: Buffer, cb: function): void`

Writes data to the file starting at the specified offset.

- **offset** (number): The offset (in bytes) from where to start writing.
- **data** (Buffer): The buffer containing the data to write.
- **cb**: Callback function invoked when the operation is complete.

---

#### `read(offset: number, size: number, cb: function): void`

Reads data from the file starting at the specified offset.

- **offset** (number): The offset (in bytes) from where to start reading.
- **size** (number): The number of bytes to read.
- **cb**: Callback function invoked when the operation is complete.
  - **err**: Error object (if any).
  - **data**: The buffer containing the read data.

---

#### `truncate(offset: number, cb: function): void`

Truncates the file to the specified length. If the file is larger than `offset`, it will be shortened. If smaller, it will be padded with zeros.

- **offset** (number): The length to truncate the file to.
- **cb**: Callback function invoked when the operation is complete.

---

#### `del(offset: number, size: number, cb: function): void`

Deletes a range of bytes from the file starting at `offset` and spanning `size` bytes.

- **offset** (number): The starting position of the deletion.
- **size** (number): The number of bytes to delete.
- **cb**: Callback function invoked when the operation is complete.

---

#### `close(cb: function): void`

Closes the file and cleans up the internal database connection.

- **cb**: Callback function invoked when the operation is complete.

---

#### `stat(cb: function): void`

Retrieves the file's metadata, such as length and chunk size.

- **cb**: Callback function invoked when the operation is complete.
  - **err**: Error object (if any).
  - **stats**: Object containing file metadata.
    - `length`: The length of the file.
    - `chunkSize`: The chunk size used for the file.
    - `fileName`: The file name.

---

#### `suspend(cb: function): void`

Suspends the queue and emits a `suspend` event.

- **cb**: Callback function invoked when the operation is complete.

---

#### `purge(cb: function): void`

Deletes the file from IndexedDB and resets its metadata.

- **cb**: Callback function invoked when the operation is complete.

---

## Helper Functions

---

### `createFile(fileName: string, config?: object): RandomAccessIdb`

Creates or opens an existing `RandomAccessIdb` file.

- **fileName** (string): The name of the file to be created or opened.
- **config** (object, optional): Configuration options, such as:
  - `chunkSize` (number): The size of chunks to be used (default: 4096).
  - `directory` (string): Directory to store the file.

Returns a new `RandomAccessIdb` instance.

---

### `openFile(fileName: string, config?: object): Promise<IDBDatabase>`

Opens an IndexedDB file and returns the database connection.

- **fileName** (string): The name of the file to open.
- **config** (object, optional): Optional configuration options for the IndexedDB database.

Returns a `Promise` that resolves to the database connection object.
