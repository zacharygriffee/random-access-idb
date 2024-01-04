export function getIdb() {
    return globalThis.indexedDB || globalThis.mozIndexedDB || globalThis.webkitIndexedDB || globalThis.msIndexedDB
}
