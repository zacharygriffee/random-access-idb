import RandomAccess from "random-access-storage";
import {isFunction, isObject, once} from "./lib/dash.js";
import b4a from "b4a";
import {blocks} from "./lib/blocks.js";
import {isNode} from "./lib/isNode.js";
import {getIdb} from "./lib/getIdb.js";

const DELIM = '\0';

export function RandomAccessIndexedDB(dbname, xopts = {}) {
    if (isNode()) {
        throw new Error("Must be ran in browser");
    }

    const {
        idb = window.indexedDB || getIdb()
    } = xopts;

    if (!idb) throw new Error('Browser does not support indexedDB.')

    let db = null;
    let dbqueue = [];

    if (isFunction(idb.open)) {
        const req = idb.open(dbname);
        req.addEventListener('upgradeneeded', () => {
            db = req.result
            db.createObjectStore('data')
        })
        req.addEventListener('success', () => {
            db = req.result
            dbqueue.forEach(cb => { cb(db) })
            dbqueue = null
        })
    } else {
        db = idb
    }

    return (name, opts) => {
        if (isObject(name)) {
            opts = name
            name = opts.name
        }

        if (!opts) opts = {}
        opts.name = name

        return new Store(Object.assign({ db: getdb }, xopts, opts))
    }

    function getdb (cb) {
        if (db) setTimeout(() => cb(db))
        else dbqueue.push(cb)
    }
}

class Store extends RandomAccess {
    constructor(opts = {}) {
        const {
            size = 4096,
            name,
            length = 0,
            db
        } = opts;

        super();

        this.size = size;
        this.name = name;
        this.length = length;
        this._getdb = db;
    }

    _blocks(i, j) {
        return blocks(this.size, i, j)
    }

    _read(req) {
        const self = this;
        const buffers = [];
        self._store('readonly', (err, store) => {
            if ((self.length || 0) < req.offset + req.size) {
                return req.callback(new Error('Could not satisfy length'), null)
            }
            if (err) return req.callback(err)
            const offsets = self._blocks(req.offset, req.offset + req.size);
            let pending = offsets.length + 1;
            const firstBlock = offsets.length > 0 ? offsets[0].block : 0;
            for (let i = 0; i < offsets.length; i++) (o => {
                const key = self.name + DELIM + o.block;
                backify(store.get(key), (err, ev) => {
                    if (err) return req.callback(err)
                    buffers[o.block - firstBlock] = ev.target.result
                        ? b4a.from(ev.target.result.subarray(o.start, o.end))
                        : b4a.alloc(o.end - o.start)
                    if (--pending === 0) req.callback(null, b4a.concat(buffers))
                })
            })(offsets[i])
            if (--pending === 0) req.callback(null, b4a.concat(buffers))
        })
    }

    _write(req) {
        const self = this;

        if (!b4a.isBuffer(req.data))
            req.data = b4a.from(req.data);

        self._store('readwrite', (err, store) => {
            if (err) return req.callback(err)
            const offsets = self._blocks(req.offset, req.offset + req.data.length);
            let pending = 1;
            const buffers = {};
            for (let i = 0; i < offsets.length; i++) ((o, i) => {
                if (o.end - o.start === self.size) return
                pending++
                const key = self.name + DELIM + o.block;
                backify(store.get(key), (err, ev) => {
                    if (err) return req.callback(err)
                    buffers[i] = b4a.from(ev.target.result || b4a.alloc(self.size))
                    if (--pending === 0) write(store, offsets, buffers)
                })
            })(offsets[i], i)
            if (--pending === 0) write(store, offsets, buffers)
        })

        function write (store, offsets, buffers) {
            let block;
            let i = 0, j = 0;
            for (; i < offsets.length; i++) {
                const o = offsets[i];
                const len = o.end - o.start;
                if (len === self.size) {
                    block = b4a.from(req.data.slice(j, j + len))
                } else {
                    block = buffers[i]
                    b4a.copy(req.data, block, o.start, j, j + len);
                }
                store.put(block, self.name + DELIM + o.block)
                j += len
            }

            const length = Math.max(self.length || 0, req.offset + req.data.length);
            store.put(length, self.name + DELIM + 'length')
            store.transaction.addEventListener('complete', () => {
                self.length = length
                req.callback(null)
            })
            store.transaction.addEventListener('error', err => {
                req.callback(err)
            })
        }
    }

    _del(req) {
        req.callback();
    }

    _store(mode, cb) {
        cb = once(cb)
        const self = this;
        self._getdb(db => {
            const tx = db.transaction(['data'], mode);
            const store = tx.objectStore('data');
            tx.addEventListener('error', cb)
            cb(null, store)
        })
    }

    _open(req) {
        const self = this;
        this._getdb(db => {
            self._store('readonly', (err, store) => {
                if (err) return req.callback(err)
                backify(store.get(self.name + DELIM + 'length'), (err, ev) => {
                    if (err) return req.callback(err)
                    self.length = ev.target.result || 0
                    req.callback(null)
                })
            })
        })
    }

    _close(req) {
        this._getdb(db => {
            //db.close() // TODO: reopen gracefully. Close breaks with corestore, as innercorestore closes the db
            req.callback()
        })
    }

    _stat(req) {
        const self = this;
        setTimeout(
            () => req.callback(null, { size: self.length })
        );
    }
}

function backify (r, cb) {
    r.addEventListener('success', ev => { cb(null, ev) })
    r.addEventListener('error', cb)
}

// Convenience
export {RandomAccessIndexedDB as RAI, RandomAccessIndexedDB as default, b4a};
