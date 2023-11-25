function getIdb() {
    return window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB
}