// Loader for the prebuilt native addon. Scans prebuilds/<platform>-<arch>/
// for any `.node` file before falling back to `node-gyp rebuild` output or
// node-gyp-build, since our CI's output filename doesn't match node-gyp-build's
// strict `electron.napi.node` / `node.napi.node` expectations (see
// win-audio-capture/index.js for the incident that taught us this).
//
// Exposes:
//   isSupported(): boolean   // false on non-Windows, missing binary, or unsupported OS build

let nativeBinding = null;
let loadError = null;

function tryLoad(filePath) {
  try {
    const mod = require(filePath);
    if (mod && typeof mod.isSupported === "function") {
      return mod;
    }
  } catch (e) {
    loadError = e;
  }
  return null;
}

try {
  if (process.platform === "win32") {
    const path = require("path");
    const fs = require("fs");
    const candidates = [];

    const prebuildDir = path.join(__dirname, "prebuilds", `${process.platform}-${process.arch}`);
    try {
      if (fs.existsSync(prebuildDir)) {
        for (const f of fs.readdirSync(prebuildDir)) {
          if (f.endsWith(".node")) candidates.push(path.join(prebuildDir, f));
        }
      }
    } catch (_) {}

    candidates.push(path.join(__dirname, "build", "Release", "win_dxgi_capture.node"));
    candidates.push(path.join(__dirname, "build", "Release", "win-dxgi-capture.node"));

    let gypResolved = null;
    try { gypResolved = require("node-gyp-build").path(__dirname); } catch (_) {}
    if (gypResolved) candidates.push(gypResolved);

    for (const cand of candidates) {
      const mod = tryLoad(cand);
      if (mod) {
        nativeBinding = mod;
        try { console.log("[win-dxgi-capture] loaded native binding from", cand); } catch (_) {}
        break;
      }
    }
    if (!nativeBinding) {
      try { console.warn("[win-dxgi-capture] no native binding found in", candidates); } catch (_) {}
    }
  }
} catch (e) {
  loadError = e;
  nativeBinding = null;
}

function isSupported() {
  if (!nativeBinding || typeof nativeBinding.isSupported !== "function") return false;
  try {
    return nativeBinding.isSupported();
  } catch (_) {
    return false;
  }
}

module.exports = { isSupported, _loadError: loadError };
