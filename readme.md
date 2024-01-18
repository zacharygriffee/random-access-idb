# random-access-idb

---

### Support the cause towards decentralization

bitcoin: bc1q9fpu6muvmg5fj76pyzg3ffjrmksnvfj3c0xva6

---


### [API Documentation](https://github.com/zacharygriffee/random-access-idb/blob/master/api.md)

See: [random-access-storage][1] for the full api about what this library derives from.

[1]: https://github.com/random-access-storage/random-access-storage

---
## Test it

## In Node

```sh
npm test
```

## In Browser

### [Test it in your browser](https://raw.githack.com/zacharygriffee/random-access-idb/6c446e654450df1b2b6c9db378ab39bbe487c2b5/test.html)

---

## Installation

```sh
npm install @zacharygriffee/random-access-idb --save
```

## Import

``` ecmascript 6
import RAI from "@zacharygriffee/random-access-idb";

// or

import {openDatabase} from "@zacharygriffee/random-access-idb";
```
---

## Improvements

- Uses [b4a](https://github.com/holepunchto/b4a) for buffer operations
- Uses battle tested and fast [dexie.js](https://dexie.org/) for indexeddb management
- Implements `del` and `truncate`, and removes empty chunks from database with these operations.
- Extends with `purge` to delete a file from the database table.

---
## Example

> When you need complex solutions

``` ecmascript 6
    import {openDatabase} from "@zacharygriffee/random-access-idb";
    
    // Always open the database with the same chunksize it was created with.
    const margaritaDb = openDatabase("margarita", { chunkSize: 1024 });
    const martiniDb = openDatabase("martini", { chunkSize: 512 );
    
    const goldenMargarita = margaritaDb("goldenMargarita.txt");
    goldenMargarita.write(0, b4a.from("add orange juice"), (e) => {
        goldenMargarita.read(4, 6, (e, buffer) => {
            b4a.toString(buffer); // orange
        })
    });
    
    const dryGinMartini = martiniDb("dryGinMartini.txt");
    
    dryGinMartini.write(0, b4a.from("less vermouth"), (e) => {
            dryGinMartini.read(5, 8, (e, buffer) => {
            b4a.toString(buffer); // vermouth
        })
    });
    
```

## Simple Example

> When your life is simple and don't need all that extra stuff.
``` ecmascript 6
    import rai from "@zacharygriffee/random-access-idb";
    
    // default export is like calling openDatabase('rai')("hello.txt");
    const file = rai("hello.txt");
    file.write(0, b4a.from("hello world"), (e) => {
        file.read(0, 5, (e, buffer) => {
            b4a.toString(buffer); // hello
        })
    });
```

---

## Todo

- [ ] Add a metadata for stats. Block/Chunk size. 
- [ ] Error handling and testing of errors
- [ ] Multiple browser tab support

--- 

Distributed under the MIT license. See ``LICENSE`` for more information.

