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
<dt><a href="#allLoadedFiles">allLoadedFiles</a> : <code>Map</code> | <code>config.MapClass</code></dt>
<dd><p>Get a map of all loaded files.</p>
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

<a name="defaultConfig"></a>

## defaultConfig : <code>Object</code>
Current default configurations.

**Kind**: global variable  
<a name="allLoadedFiles"></a>

## allLoadedFiles : <code>Map</code> \| <code>config.MapClass</code>
Get a map of all loaded files.

**Kind**: global constant  
**Example**  
```js
// You could do this
rai("helloWorld.txt");
allLoadedFiles.get("helloWorld.txt").read(0, 5, (e, v) => {});
```
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
| [config.chunkSize] | <code>4096</code> | The chunk size of the file stored in the database. This cannot be changed once set and if you reopen the database, it should have the same size it was created with. |
| [config.size] | <code>4096</code> | Alias of [config.chunkSize](config.chunkSize) |

**Example**  
```js
// File creation example

const fileMaker = create();
const rai = fileMaker("helloWorld.txt");
rai.write(0, Buffer.from("hello world!!!"));
```
<a name="openDatabase..maker"></a>

### openDatabase~maker(fileName) ⇒ [<code>RandomAccessIdb</code>](#RandomAccessIdb)
Creates the random access storage instance of a file.

**Kind**: inner method of [<code>openDatabase</code>](#openDatabase)  
**Returns**: [<code>RandomAccessIdb</code>](#RandomAccessIdb) - RandomAccessIdb class instance  

| Param |
| --- |
| fileName | 

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

