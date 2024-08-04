/*
Copyright (c) 2015-2020, Matteo Collina <matteo.collina@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

var n=function(n){var e=new n,t=e;return{get:function(){var r=e;return r.next?e=r.next:(e=new n,t=e),r.next=null,r},release:function(n){t.next=n,t=n}}};
var e={exports:{}},r=n;function t(n,e,t){if("function"==typeof n&&(t=e,e=n,n=null),!(t>=1))throw new Error("fastqueue concurrency must be equal to or greater than 1");var a=r(l),o=null,i=null,c=0,s=null,f={push:function(r,l){var h=a.get();h.context=n,h.release=d,h.value=r,h.callback=l||u,h.errorHandler=s,c>=t||f.paused?i?(i.next=h,i=h):(o=h,i=h,f.saturated()):(c++,e.call(n,h.value,h.worked))},drain:u,saturated:u,pause:function(){f.paused=!0},paused:!1,get concurrency(){return t},set concurrency(n){if(!(n>=1))throw new Error("fastqueue concurrency must be equal to or greater than 1");if(t=n,!f.paused)for(;o&&c<t;)c++,d()},running:function(){return c},resume:function(){if(!f.paused)return;for(f.paused=!1;o&&c<t;)c++,d()},idle:function(){return 0===c&&0===f.length()},length:function(){var n=o,e=0;for(;n;)n=n.next,e++;return e},getQueue:function(){var n=o,e=[];for(;n;)e.push(n.value),n=n.next;return e},unshift:function(r,l){var h=a.get();h.context=n,h.release=d,h.value=r,h.callback=l||u,h.errorHandler=s,c>=t||f.paused?o?(h.next=o,o=h):(o=h,i=h,f.saturated()):(c++,e.call(n,h.value,h.worked))},empty:u,kill:function(){o=null,i=null,f.drain=u},killAndDrain:function(){o=null,i=null,f.drain(),f.drain=u},error:function(n){s=n}};return f;function d(r){r&&a.release(r);var u=o;u&&c<=t?f.paused?c--:(i===o&&(i=null),o=u.next,u.next=null,e.call(n,u.value,u.worked),null===i&&f.empty()):0==--c&&f.drain()}}function u(){}function l(){this.value=null,this.callback=u,this.next=null,this.release=u,this.context=null,this.errorHandler=null;var n=this;this.worked=function(e,r){var t=n.callback,l=n.errorHandler,a=n.value;n.value=null,n.callback=u,n.errorHandler&&l(e,a),t.call(n.context,e,r),n.release(n)}}e.exports=t;var a=e.exports.promise=function(n,e,r){"function"==typeof n&&(r=e,e=n,n=null);var l=t(n,(function(n,r){e.call(this,n).then((function(n){r(null,n)}),r)}),r),a=l.push,o=l.unshift;return l.push=function(n){var e=new Promise((function(e,r){a(n,(function(n,t){n?r(n):e(t)}))}));return e.catch(u),e},l.unshift=function(n){var e=new Promise((function(e,r){o(n,(function(n,t){n?r(n):e(t)}))}));return e.catch(u),e},l.drained=function(){if(l.idle())return new Promise((function(n){n()}));var n=l.drain;return new Promise((function(e){l.drain=function(){n(),e()}}))},l},o=e.exports;export{o as default,a as promise};