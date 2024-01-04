# random-access-idb

---

[random-access-storage][1] compatible indexedDB storage layer

### [API Documentation](https://github.com/zacharygriffee/random-access-idb/blob/master/api.md)

[1]: https://github.com/random-access-storage/random-access-storage

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
# Example

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

# Simple Example

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

# Todo

```ecmascript 6
/**
     todo: add a file metadata for stats
           like block size (chunk size) as to ensure
           a file is always opened with
           its original block size
           among other stats.
    
     todo: Error handling testing. Currently, unlikely
           indexeddb errors have not been tested
*/
```


Distributed under the MIT license. See ``LICENSE`` for more information.

