## Classes

<dl>
<dt><a href="#RandomAccessIdb">RandomAccessIdb</a> ⇐ <code>RandomAccessStorage</code></dt>
<dd></dd>
</dl>

## Members

<dl>
<dt><a href="#defaultConfig">defaultConfig</a> : <code>Object</code></dt>
<dd><p>Current default configurations.</p>
</dd>
<dt><a href="#allLoadedFiles">allLoadedFiles</a></dt>
<dd><p>Get a map of all loaded files.
stored by a key with this format by default: dbName\0fileName
So you could do:
allLoadedFiles.get(&quot;rai\0helloWorld.txt&quot;);</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#updateDefaultConfig">updateDefaultConfig(cb)</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Update default configurations for all further database creations.</p>
</dd>
<dt><a href="#createFile">createFile([fileName], [config])</a> ⇒</dt>
<dd><p>Create a random access idb instance</p>
</dd>
</dl>

<a name="RandomAccessIdb"></a>

## RandomAccessIdb ⇐ <code>RandomAccessStorage</code>
**Kind**: global class  
**Extends**: <code>RandomAccessStorage</code>  
**See**

- https://github.com/random-access-storage/random-access-storage
- https://dexie.org/docs/Dexie/Dexie
- https://dexie.org/docs/Table/Table

**Properties**

| Name | Type | Description |
| --- | --- | --- |
| length | <code>Number</code> | Total length of the file |
| fileName | <code>String</code> | The fileName of the file |
| chunkSize | <code>number</code> | The chunk size this file is stored on the database. |
| key | <code>string</code> | The key this file uses in allLoadedFiles map. |


* [RandomAccessIdb](#RandomAccessIdb) ⇐ <code>RandomAccessStorage</code>
    * [.open(cb)](#RandomAccessIdb+open)
    * [.close(cb)](#RandomAccessIdb+close)
    * [.write(offset, data, cb)](#RandomAccessIdb+write)
    * [.read(offset, size, cb)](#RandomAccessIdb+read)
    * [.del(offset, size, cb)](#RandomAccessIdb+del)
    * [.truncate(offset, cb)](#RandomAccessIdb+truncate)
    * [.stat(cb)](#RandomAccessIdb+stat)
    * [.purge(cb)](#RandomAccessIdb+purge)

<a name="RandomAccessIdb+open"></a>

### randomAccessIdb.open(cb)
Open the database table the file exists in

**Kind**: instance method of [<code>RandomAccessIdb</code>](#RandomAccessIdb)  

| Param | Description |
| --- | --- |
| cb | (e) => |

<a name="RandomAccessIdb+close"></a>

### randomAccessIdb.close(cb)
Closes the file. This allows for other tabs to operate on the file.

**Kind**: instance method of [<code>RandomAccessIdb</code>](#RandomAccessIdb)  

| Param | Description |
| --- | --- |
| cb | (error) => |

<a name="RandomAccessIdb+write"></a>

### randomAccessIdb.write(offset, data, cb)
Write `data` starting at `offset`

**Kind**: instance method of [<code>RandomAccessIdb</code>](#RandomAccessIdb)  
**Todo**

- [ ] Unlike truncate and del, if a write operation results in empty chunks,
      those chunks will not be deleted from underlying table for speed reasons.
      Create function that will 'find empty chunks' to delete.


| Param | Description |
| --- | --- |
| offset | Offset to begin writing bytes from data parameter |
| data | A buffer of `data` to write |
| cb | (error) => |

<a name="RandomAccessIdb+read"></a>

### randomAccessIdb.read(offset, size, cb)
Read `size` amount of bytes starting from `offset`.

Will reopen the file if it had been closed.

Conditions:
- If `size` is zero, will return a zero length buffer.
- If `offset+size` is greater than file length, will error with code ENOENT to mimic random-access-file.

**Kind**: instance method of [<code>RandomAccessIdb</code>](#RandomAccessIdb)  

| Param | Description |
| --- | --- |
| offset | Offset to begin reading bytes |
| size | The amount of bytes to read |
| cb | (error, buffer) => |

<a name="RandomAccessIdb+del"></a>

### randomAccessIdb.del(offset, size, cb)
Deletes `size` amount of bytes starting at `offset`. Any empty chunks are deleted from the underlying database table.

**Kind**: instance method of [<code>RandomAccessIdb</code>](#RandomAccessIdb)  

| Param | Description |
| --- | --- |
| offset | Offset to begin deleting bytes from |
| size | The amount of bytes to delete |
| cb | (error) => |

<a name="RandomAccessIdb+truncate"></a>

### randomAccessIdb.truncate(offset, cb)
- If `offset` is greater than size of file, will grow the file with empty bytes to that length.
- If `offset` is less than size of file, will delete all data after `offset` and any resulting empty chunks are
  deleted from underlying database table.
- If `offset` is the same, nothing is done to the file.

**Kind**: instance method of [<code>RandomAccessIdb</code>](#RandomAccessIdb)  

| Param | Description |
| --- | --- |
| offset | Offset to begin aforementioned operations. |
| cb | (error) => |

<a name="RandomAccessIdb+stat"></a>

### randomAccessIdb.stat(cb)
Callback returns an object resulting in the statistics of the file.
{ size, fileName, length, blockSize }

**Kind**: instance method of [<code>RandomAccessIdb</code>](#RandomAccessIdb)  

| Param | Description |
| --- | --- |
| cb | (error, stat) => |

<a name="RandomAccessIdb+purge"></a>

### randomAccessIdb.purge(cb)
Purge the file from the table.
'Closes' the file from allFilesOpened map.

**Kind**: instance method of [<code>RandomAccessIdb</code>](#RandomAccessIdb)  

| Param | Description |
| --- | --- |
| cb | (error) => |

<a name="defaultConfig"></a>

## defaultConfig : <code>Object</code>
Current default configurations.

**Kind**: global variable  
<a name="allLoadedFiles"></a>

## allLoadedFiles
Get a map of all loaded files.
stored by a key with this format by default: dbName\0fileName
So you could do:
allLoadedFiles.get("rai\0helloWorld.txt");

**Kind**: global variable  
<a name="updateDefaultConfig"></a>

## updateDefaultConfig(cb) ⇒ <code>Promise.&lt;void&gt;</code>
Update default configurations for all further database creations.

**Kind**: global function  

| Param |
| --- |
| cb | 

**Example**  
```js
updateDefaultConfig(existingConfig => ({...existingConfig, chunkSize: 1024, MapClass: ObservableMap}));
```
<a name="createFile"></a>

## createFile([fileName], [config]) ⇒
Create a random access idb instance

**Kind**: global function  
**Returns**: Function<RandomAccessIdb>  

| Param | Default | Description |
| --- | --- | --- |
| [fileName] |  | The name of the file |
| [config] |  | Optional configurations |
| [config.chunkSize] | <code>4096</code> | The chunk size of the files created from the created database. Chunk size will be stored in the file's metadata and used for the next open. |
| [config.size] | <code>4096</code> | Alias of [config.chunkSize](config.chunkSize) |
| [config.openBlockingHandler] |  | Handler in the case that another tab, process, or part of the code tries to open the same file. Default behavior is to close if this instance blocks another instance |
| [config.openBlockedHandler] |  | If this instance encounters a block by another instance (tab, process, etc), how to handle it. Default, does nothing and waits for the other process to close the file. |
| [config.deleteBlockingHandler] |  | In the case where this instance wants to delete (purge) the file, but is blocked by another instance operating on it. Default behavior is to do nothing and wait. |
| [config.MapClass] |  | A custom map class to use for file listing instead of the native map class. Default is native map class. |

**Example**  
```js
// File creation example

const rai = createFile("helloWorld.txt");
rai.write(0, Buffer.from("hello world!!!"));
```
