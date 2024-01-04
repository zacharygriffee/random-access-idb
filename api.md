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
</dl>

## Constants

<dl>
<dt><a href="#allLoadedFiles">allLoadedFiles</a></dt>
<dd><p>Get a map of all loaded files.
stored by a key with this format by default: dbName\0version\0fileName
So you could do:
allLoadedFiles.get(&quot;rai\01\0helloWorld.txt&quot;);</p>
</dd>
</dl>

## Functions

<dl>
<dt><a href="#updateDefaultConfig">updateDefaultConfig(cb)</a> ⇒ <code>Promise.&lt;void&gt;</code></dt>
<dd><p>Update default configurations for all further database creations.</p>
</dd>
<dt><a href="#openDatabase">openDatabase([dbName], [config])</a> ⇒</dt>
<dd><p>Create an indexeddb database entry</p>
</dd>
<dt><a href="#make">make(fileName, config)</a> ⇒ <code><a href="#RandomAccessIdb">RandomAccessIdb</a></code></dt>
<dd><p>Open database &#39;dbName=rai&#39; then you can create files from the same function.</p>
<p>This is the same as openDatabase(&quot;rai&quot;)(fileName); or openDatabase()(fileName);</p>
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
| db | <code>Dexie</code> | The db this file is created under. |
| Table | <code>Dexie.Table</code> | The table in the db this file is created. |
| chunkSize | <code>number</code> | The chunk size this file is stored on the database. |
| dbName | <code>string</code> | The database name this file is stored on. |
| key | <code>string</code> | The key this file uses in allLoadedFiles map. |
| version | <code>number</code> | The version of the database this file was opened from. |

<a name="defaultConfig"></a>

## defaultConfig : <code>Object</code>
Current default configurations.

**Kind**: global variable  
<a name="allLoadedFiles"></a>

## allLoadedFiles
Get a map of all loaded files.
stored by a key with this format by default: dbName\0version\0fileName
So you could do:
allLoadedFiles.get("rai\01\0helloWorld.txt");

**Kind**: global constant  
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
<a name="openDatabase"></a>

## openDatabase([dbName], [config]) ⇒
Create an indexeddb database entry

**Kind**: global function  
**Returns**: Function<RandomAccessIdb>  

| Param | Default | Description |
| --- | --- | --- |
| [dbName] | <code>&quot;rai&quot;</code> | The name of the database |
| [config] |  | Optional configurations |
| [config.chunkSize] | <code>4096</code> | The chunk size of the files created from the created database. When reopened, it should have the same size it was created with. |
| [config.size] | <code>4096</code> | Alias of [config.chunkSize](config.chunkSize) |
| [config.version] | <code>1</code> | Default version to open files. You can specify version for each file in the openDatabase~maker function as well. **Don't use decimals in version. Whole numbers only** **Good**: 103254 **Bad**: 1.23.521 |

**Example**  
```js
// File creation example

const fileMaker = openDatabase();
const rai = fileMaker("helloWorld.txt");
rai.write(0, Buffer.from("hello world!!!"));
```
<a name="openDatabase..maker"></a>

### openDatabase~maker(fileName, version) ⇒ [<code>RandomAccessIdb</code>](#RandomAccessIdb)
Creates the random access storage instance of a file.

**Kind**: inner method of [<code>openDatabase</code>](#openDatabase)  
**Returns**: [<code>RandomAccessIdb</code>](#RandomAccessIdb) - RandomAccessIdb class instance  

| Param | Description |
| --- | --- |
| fileName |  |
| version | Version of database to open this file from |

<a name="make"></a>

## make(fileName, config) ⇒ [<code>RandomAccessIdb</code>](#RandomAccessIdb)
Open database 'dbName=rai' then you can create files from the same function.

This is the same as openDatabase("rai")(fileName); or openDatabase()(fileName);

**Kind**: global function  
**Returns**: [<code>RandomAccessIdb</code>](#RandomAccessIdb) - RandomAccessIdb instance.  

| Param | Description |
| --- | --- |
| fileName | file to create |
| config | See config for openDatabase function |

