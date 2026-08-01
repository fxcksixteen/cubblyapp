// Loader for the prebuilt native addon. Scans prebuilds/<platform>-<arch>/
// for any `.node` file before falling back to `node-gyp rebuild` output or
// node-gyp-build, since our CI's output filename doesn't match node-gyp-build's
// strict `electron.napi.node` / `node.napi.node` expectations (see
// win-audio-capture/index.js for the incident that taught us this).
//
// Exposes:
//   isSupported(): boolean
//   start(hwnd: number, onFrame: (frame: Frame) => void): handle
//   stop(handle): void
//
// Frame = { data: Buffer, width: number, height: number, captureTimeUs: number }
// `data` is NV12 (Y plane followed by interleaved UV, 4:2:0 subsampled).
// `captureTimeUs` is epoch microseconds stamped at WGC FrameArrived, on the
// same epoch as `performance.timeOrigin + performance.now()` so latency can be
// measured across the main/renderer process boundary.

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

function hasCapture() {
  return !!nativeBinding && typeof nativeBinding.startCapture === "function";
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

function start(hwnd, onFrame) {
  if (!hasCapture()) {
    throw new Error(
      "win-dxgi-capture native addon unavailable: " +
      (loadError ? loadError.message : "non-Windows platform or missing prebuild")
    );
  }
  if (typeof hwnd !== "number" || hwnd <= 0) {
    throw new Error("start(hwnd, onFrame): hwnd must be a positive number");
  }
  if (typeof onFrame !== "function") {
    throw new Error("start(hwnd, onFrame): onFrame must be a function");
  }
  return nativeBinding.startCapture(hwnd, onFrame);
}

function stop(handle) {
  if (!hasCapture() || handle == null) return;
  try {
    nativeBinding.stopCapture(handle);
  } catch (_) { /* ignore */ }
}

module.exports = { isSupported, start, stop, _loadError: loadError };
