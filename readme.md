# random-access-idb

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

### [Test it in your browser](https://rawcdn.githack.com/zacharygriffee/random-access-idb/b56419d7300f0982c6337bf90ad24ea681fe295c/test.html)

---

## Installation

```sh
npm install @zacharygriffee/random-access-idb --save
```

## Import

``` ecmascript 6
import rai from "@zacharygriffee/random-access-idb";
```
---

## Improvements

- Uses [b4a](https://github.com/holepunchto/b4a) for buffer operations
- Implements `del` and `truncate`, and removes empty chunks from database with these operations
- Extends with `purge` to delete a file from the database
- Metadata that holds the chunkSize. IF you `reopen` a file that had a declared chunk size, it will open
the file in that chunk size despite the configuration.
- New blocking handlers for multiple tab support. If a file is open in one place, and another place tries to open the same file,
use the blocking handlers to specify how to handle the conflict
- Close now has a necessary reason to exist.

> !!! NEW BEHAVIOR !!! 
> 
> If you plan on using this cross-tab... It is now important to `close` the IDB file when you're done so that
> other tabs in the same origin can open the file.

## Example

``` ecmascript 6
    import rai from "@zacharygriffee/random-access-idb";
    
    const file = rai("hello.txt");
    file.write(0, b4a.from("hello world"), (e) => {
        file.read(0, 5, (e, buffer) => {
            b4a.toString(buffer); // hello
        })
    });
```

---

## Todo

- [x] Add a metadata for stats. Block/Chunk size. 
- [ ] Error handling and testing of errors
- [x] Multiple browser tab support (needs testing)

--- 

Distributed under the MIT license. See ``LICENSE`` for more information.

