/* eslint-disable */
// electron-builder afterPack hook.
// Strips the parts of the bundled Electron runtime that Cubbly will never use,
// which is the real reason an "empty" Electron app weighs 600-700 MB installed:
//   - 50+ Chromium .pak locale files (~50 MB) we never load (electronLanguages
//     only filters mac/linux, not Windows — confirmed by electron-builder)
//   - LICENSES.chromium.html (~9 MB plaintext)
//   - swiftshader / d3dcompiler bits only used on machines without a GPU,
//     and a few debug symbol files that ship in release builds
// Everything stripped here is non-functional for our use case: hardware-accel
// Chromium on Win10/11 desktops with English UI.
const fs = require("fs");
const path = require("path");

const KEEP_LOCALES = new Set(["en-US.pak"]);

// Files we always delete from the packaged app (paths relative to appOutDir).
// All of these are non-functional for a Win10/11 desktop running Cubbly with
// hardware-accelerated Chromium and an English UI.
const ALWAYS_DELETE = [
  // License/notice docs shipped with prebuilt Electron — not legally required
  // to remain inside the installed app for an end-user runtime.
  "LICENSES.chromium.html",
  "LICENSE.electron.txt",
  "LICENSE",
  "LICENSE.txt",
  // Electron's built-in "default app" (the welcome window). We always load
  // our own app, so this is dead weight.
  "resources/default_app.asar",
  // Inspector / devtools front-end resources — dev-only, not needed at
  // runtime for end users.
  "resources/inspector",
  // NOTE: SwiftShader / Vulkan software-renderer DLLs are intentionally kept.
  // They're the safety-net fallback when a user toggles off hardware acceleration
  // in Settings → Advanced on a machine without working GPU drivers — without
  // them the window goes black. ~12 MB is worth the reliability.

  // Debug symbols that occasionally ship in release builds.
  "d3dcompiler_47.dll.pdb",
  "electron.exe.pdb",
];

// File suffixes to recursively strip from the packaged app.
const STRIP_SUFFIXES = [".pdb", ".map"];

function fmtMB(bytes) { return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

function dirSize(dir) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) total += dirSize(p);
        else total += fs.statSync(p).size;
      } catch {}
    }
  } catch {}
  return total;
}

function walkAndStrip(dir, freedRef) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndStrip(p, freedRef);
    } else {
      const lower = entry.name.toLowerCase();
      if (STRIP_SUFFIXES.some((s) => lower.endsWith(s))) {
        try {
          const sz = fs.statSync(p).size;
          fs.rmSync(p, { force: true });
          freedRef.bytes += sz;
        } catch {}
      }
    }
  }
}

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  if (!appOutDir || !fs.existsSync(appOutDir)) return;

  const before = dirSize(appOutDir);
  const freed = { bytes: 0 };

  // 1) Strip non-English Chromium locales.
  const localesDir = path.join(appOutDir, "locales");
  if (fs.existsSync(localesDir)) {
    for (const name of fs.readdirSync(localesDir)) {
      if (KEEP_LOCALES.has(name)) continue;
      const p = path.join(localesDir, name);
      try {
        const sz = fs.statSync(p).size;
        fs.rmSync(p, { force: true, recursive: true });
        freed.bytes += sz;
      } catch {}
    }
  }

  // 2) Delete always-unused files/dirs.
  for (const rel of ALWAYS_DELETE) {
    const p = path.join(appOutDir, rel);
    try {
      if (fs.existsSync(p)) {
        const sz = fs.statSync(p).isDirectory() ? dirSize(p) : fs.statSync(p).size;
        fs.rmSync(p, { force: true, recursive: true });
        freed.bytes += sz;
      }
    } catch {}
  }

  // 3) Recursively strip debug symbols / source maps that slipped through.
  walkAndStrip(appOutDir, freed);

  const after = dirSize(appOutDir);
  console.log(
    `[afterPack] stripped ${fmtMB(freed.bytes)} from Electron runtime ` +
    `(installed app: ${fmtMB(before)} → ${fmtMB(after)})`
  );
};

