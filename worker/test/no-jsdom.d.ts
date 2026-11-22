// vitest's types import 'jsdom' whenever it is installed (the phone app's Jest brings it), and its
// types pull in the DOM lib, which clashes with the Workers types. The Worker never uses jsdom, so
// tsconfig.json maps it here.
export {}
