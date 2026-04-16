// Electron entrypoint shim. Must be CommonJS (.cjs) because package.json
// has "type": "module" which would otherwise make .js files ESM and break
// Electron's require()-based main process loader.
require("./electron/main.cjs");