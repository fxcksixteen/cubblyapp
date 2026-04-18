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

// Manual loader. We previously relied on `node-gyp-build`, but it only matches
// strict prebuild filenames like `electron.napi.node` / `node.napi.node`. Our
// CI emits `win-audio-capture.node`, so node-gyp-build silently failed to find
// the binary in production — which is why per-window audio was always disabled
// in shipped Electron builds. This loader scans the prebuilds dir for ANY
// `.node` file and tries each in turn, so the addon actually loads regardless
// of what naming convention the build pipeline used.
function tryLoad(filePath) {
  try {
    const mod = require(filePath);
    if (mod && (typeof mod.startCapture === "function" || typeof mod.start === "function")) {
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

    // 1) Prebuilds for this platform/arch — accept ANY .node file inside.
    const prebuildDir = path.join(__dirname, "prebuilds", `${process.platform}-${process.arch}`);
    try {
      if (fs.existsSync(prebuildDir)) {
        for (const f of fs.readdirSync(prebuildDir)) {
          if (f.endsWith(".node")) candidates.push(path.join(prebuildDir, f));
        }
      }
    } catch (_) {}

    // 2) `node-gyp rebuild` output (dev fallback).
    candidates.push(path.join(__dirname, "build", "Release", "win_audio_capture.node"));
    candidates.push(path.join(__dirname, "build", "Release", "win-audio-capture.node"));

    // 3) Last resort: let node-gyp-build try.
    let gypResolved = null;
    try { gypResolved = require("node-gyp-build").path(__dirname); } catch (_) {}
    if (gypResolved) candidates.push(gypResolved);

    for (const cand of candidates) {
      const mod = tryLoad(cand);
      if (mod) {
        nativeBinding = mod;
        try { console.log("[win-audio-capture] loaded native binding from", cand); } catch (_) {}
        break;
      }
    }
    if (!nativeBinding) {
      try { console.warn("[win-audio-capture] no native binding found in", candidates); } catch (_) {}
    }
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
