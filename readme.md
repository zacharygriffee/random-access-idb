# random-access-idb

[random-access-storage][1] compatible indexedDB storage layer

[1]: https://github.com/random-access-storage/random-access-storage

### This is a modification of the original [random-access-idb](https://www.npmjs.com/package/random-access-idb). 

Differences:

- Uses [`b4a`](https://www.npmjs.com/package/b4a) for buffer stuff.
- Does not close the db after use. If your application is ephemeral it not really worrisome.
- Modernize to ecmascript 6



# example

``` ecmascript 6
// Added reexport of b4a since this library uses it 
import {RAI, b4a} from "@zacharygriffee/random-access-idb";
// Or I've also added a default export.
import RandomAccessIdb, {b4a} from "@zacharygriffee/random-access-idb";
// Or import b4a.
import b4a from "b4a";

const random = RAI('dbname')
    const cool = random('cool.txt')
            cool.write(100, b4a.from('GREETINGS'), function (err) {
        if (err) return console.error(err)
            cool.read(104, 3, function (err, buf) {
        if (err) return console.error(err)
            console.log(b4a.toString(buf)) // TIN
    })
})
```

# api

``` ecmascript 6
import {RAI} from "@zacharygriffee/random-access-idb";
```

## const db = RAI(dbname, opts)

Open an indexedDB database at `dbname`.

    Any `opts` provided are forwarded to `db(name, opts)` as default options.

## const file = db(name, opts)

Create a handle `file` from `name` and `opts`:

* `opts.size` - internal chunk size to use (default 4096)

You must keep `opts.size` the same after you've written data.
If you change the size, bad things will happen.

## file.read(offset, length, cb)

Read `length` bytes at an `offset` from `file` as `cb(err, buf)`.

## file.write(offset, buf, cb)

Write `buf` to `file` at an `offset`.

# install

npm install @zacharygriffee/random-access-idb

# license

BSD
