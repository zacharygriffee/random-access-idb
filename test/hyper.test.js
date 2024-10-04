import {solo, test} from 'brittle';
import b4a from 'b4a';
import 'fake-indexeddb/auto';
import defaultMaker from '../index.js';
import Hypercore from "hypercore";
import Corestore from "corestore";
import Hyperdrive from "hyperdrive";
import {random} from "./utils/random.js";

test("basic hypercore with a lot of writes", {timeout: 600000}, async t => {
    const files = [];
    const addFile = (file) => {
        files.push(file);
        return file
    };
    const core = new Hypercore(file => addFile(defaultMaker(file)));
    await core.ready().catch(e => {
        console.log(e);
    })
    const count = 100;
    const audit1 = random(count);
    const audit2 = random(count);

    for (let i = 0; i < count; i++) {
        await core.append(b4a.from("hello world " + i))
    }

    t.is(b4a.toString(await core.get(audit1)), "hello world " + audit1)
    t.is(b4a.toString(await core.get(audit2)), "hello world " + audit2)
    t.teardown(() => {
        for (const f of files) {
            f.purge();
        }
    });
});


test("Corestore", async t => {
    const files = [];
    const addFile = (file) => {
        files.push(file);
        return file
    };
    const store = new Corestore(file => addFile(defaultMaker(file)));

    const core = store.get({name: "debugCore"});
    await core.ready();
    await core.append(b4a.from("hello world"));
    const entry = await core.get(0);
    t.is(b4a.toString(entry), "hello world");
    await core.append(b4a.from("hello world2"));
    const entry2 = await core.get(1);
    t.is(b4a.toString(entry2), "hello world2");

    t.teardown(() => {
        for (const f of files) {
            f.purge();
        }
    });
});

test("Hyperdrive", async t => {
    const files = [];
    const addFile = (file) => {
        files.push(file);
        return file
    };

    const store = new Corestore(file => addFile(defaultMaker(file, {directory: "/somedir"})));
    const hyperdrive = new Hyperdrive(store);
    const iDrive = hyperdrive;
    await iDrive.put("hello.txt", b4a.from("helloWorld"));
    const result = await iDrive.get("hello.txt");
    t.is(b4a.toString(result), "helloWorld");
    await iDrive.put("hello2.txt", b4a.from("helloWorld2"));
    const result2 = await iDrive.get("hello2.txt");
    t.is(b4a.toString(result2), "helloWorld2");

    t.teardown(() => {
        for (const f of files) {
            f.purge();
        }
    });
});
