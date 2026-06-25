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
const ALWAYS_DELETE = [
  "LICENSES.chromium.html",
  "LICENSE.electron.txt",
  // Debug PDBs occasionally slip into release builds of Electron.
  "d3dcompiler_47.dll.pdb",
];

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

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  if (!appOutDir || !fs.existsSync(appOutDir)) return;

  const before = dirSize(appOutDir);
  let freed = 0;

  // 1) Strip non-English Chromium locales.
  const localesDir = path.join(appOutDir, "locales");
  if (fs.existsSync(localesDir)) {
    for (const name of fs.readdirSync(localesDir)) {
      if (KEEP_LOCALES.has(name)) continue;
      const p = path.join(localesDir, name);
      try {
        const sz = fs.statSync(p).size;
        fs.rmSync(p, { force: true, recursive: true });
        freed += sz;
      } catch {}
    }
  }

  // 2) Delete always-unused top-level files.
  for (const rel of ALWAYS_DELETE) {
    const p = path.join(appOutDir, rel);
    try {
      if (fs.existsSync(p)) {
        const sz = fs.statSync(p).size;
        fs.rmSync(p, { force: true, recursive: true });
        freed += sz;
      }
    } catch {}
  }

  const after = dirSize(appOutDir);
  console.log(
    `[afterPack] stripped ${fmtMB(freed)} from Electron runtime ` +
    `(installed app: ${fmtMB(before)} → ${fmtMB(after)})`
  );
};
