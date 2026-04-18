// Loader for the prebuilt native addon. Uses `node-gyp-build` so that an
// installed prebuild (under `prebuilds/<platform>-<arch>/`) is preferred and
// we only fall back to `node-gyp rebuild` output when none exists.
//
// Exposes:
//   start(pid: number, onPcm: (buf: Buffer) => void): handle
//   stop(handle): void
//   isAvailable(): boolean   // false on non-Windows / missing binary
//   getFormat(): { sampleRate, channels, bitsPerSample } | null

let nativeBinding = null;
let loadError = null;

try {
  // Only attempt to load on Windows
  if (process.platform === "win32") {
    nativeBinding = require("node-gyp-build")(__dirname);
  }
} catch (e) {
  loadError = e;
  nativeBinding = null;
}

function isAvailable() {
  return !!nativeBinding && typeof nativeBinding.startCapture === "function";
}

function start(pid, onPcm) {
  if (!isAvailable()) {
    throw new Error(
      "win-audio-capture native addon unavailable: " +
      (loadError ? loadError.message : "non-Windows platform or missing prebuild")
    );
  }
  if (typeof pid !== "number" || pid <= 0) {
    throw new Error("start(pid, onPcm): pid must be a positive number");
  }
  if (typeof onPcm !== "function") {
    throw new Error("start(pid, onPcm): onPcm must be a function");
  }
  return nativeBinding.startCapture(pid, onPcm);
}

function stop(handle) {
  if (!isAvailable() || handle == null) return;
  try {
    nativeBinding.stopCapture(handle);
  } catch (_) { /* ignore */ }
}

function getFormat() {
  if (!isAvailable() || typeof nativeBinding.getFormat !== "function") return null;
  try { return nativeBinding.getFormat(); } catch (_) { return null; }
}

module.exports = { start, stop, isAvailable, getFormat, _loadError: loadError };
