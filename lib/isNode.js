import has from "lodash-es/has.js";

function isNode() {
    return has(globalThis, "process.versions.node");
}

export {isNode};