/**
 * Steam library scanner (v0.4.30).
 *
 * Builds an index of EVERY installed Steam game so activity detection can
 * name and illustrate any of them without a curated entry:
 *
 *   1. Locate the Steam install (registry on Windows, well-known paths
 *      elsewhere) and read `steamapps/libraryfolders.vdf`.
 *   2. For each library folder, parse `appmanifest_<appid>.acf` for the
 *      app id, display name and install directory.
 *   3. Shallow-scan the install directory for .exe names so we can map a
 *      running process back to its Steam app id.
 *
 * Result is cached — a full scan touches the disk, so it runs at most once
 * every 10 minutes (and never blocks the audio/render path for long).
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = { ts: 0, entries: [] };

/** Very small .vdf/.acf reader — these files are simple `"key" "value"` pairs. */
function parseKeyValues(text) {
  const out = {};
  const re = /"([^"]+)"\s+"([^"]*)"/g;
  let m;
  while ((m = re.exec(text))) out[m[1].toLowerCase()] = m[2];
  return out;
}

function windowsSteamPathFromRegistry() {
  return new Promise((resolve) => {
    exec(
      'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
      { timeout: 4000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const m = String(stdout).match(/SteamPath\s+REG_SZ\s+(.+)/i);
        resolve(m ? m[1].trim().replace(/\//g, path.sep) : null);
      },
    );
  });
}

async function findSteamRoot() {
  const candidates = [];
  if (process.platform === "win32") {
    const fromReg = await windowsSteamPathFromRegistry();
    if (fromReg) candidates.push(fromReg);
    candidates.push(
      "C:\\Program Files (x86)\\Steam",
      "C:\\Program Files\\Steam",
      path.join(process.env.LOCALAPPDATA || "", "Steam"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(path.join(os.homedir(), "Library", "Application Support", "Steam"));
  } else {
    candidates.push(
      path.join(os.homedir(), ".steam", "steam"),
      path.join(os.homedir(), ".local", "share", "Steam"),
      path.join(os.homedir(), ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
    );
  }
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (fs.existsSync(path.join(dir, "steamapps"))) return dir;
    } catch {}
  }
  return null;
}

/** All `steamapps` folders across every configured Steam library. */
function libraryFolders(steamRoot) {
  const roots = new Set([path.join(steamRoot, "steamapps")]);
  const vdf = path.join(steamRoot, "steamapps", "libraryfolders.vdf");
  try {
    const text = fs.readFileSync(vdf, "utf8");
    const re = /"path"\s+"([^"]+)"/g;
    let m;
    while ((m = re.exec(text))) {
      const p = m[1].replace(/\\\\/g, path.sep === "\\" ? "\\" : "/");
      roots.add(path.join(p, "steamapps"));
    }
  } catch {}
  return Array.from(roots).filter((dir) => {
    try { return fs.existsSync(dir); } catch { return false; }
  });
}

/** Shallow (2 level) .exe scan so we can map processes to app ids. */
function collectExeNames(dir, depth = 0, out = new Set()) {
  if (depth > 2 || out.size > 60) return out;
  let items = [];
  try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const item of items) {
    if (out.size > 60) break;
    if (item.isFile()) {
      const lower = item.name.toLowerCase();
      if (lower.endsWith(".exe")) out.add(lower.replace(/\.exe$/, ""));
    } else if (item.isDirectory() && depth < 2) {
      const skip = /^(redist|_?commonredist|directx|vcredist|support|installers?|docs?)$/i;
      if (!skip.test(item.name)) collectExeNames(path.join(dir, item.name), depth + 1, out);
    }
  }
  return out;
}

/** Returns [{ appId, name, installDir, exeNames[] }] for installed games. */
async function scanSteamLibrary() {
  if (Date.now() - cache.ts < CACHE_TTL_MS && cache.entries.length) return cache.entries;

  const steamRoot = await findSteamRoot();
  if (!steamRoot) {
    cache = { ts: Date.now(), entries: [] };
    return [];
  }

  const entries = [];
  const seen = new Set();
  for (const steamapps of libraryFolders(steamRoot)) {
    let files = [];
    try { files = fs.readdirSync(steamapps); } catch { continue; }
    for (const file of files) {
      if (!/^appmanifest_\d+\.acf$/i.test(file)) continue;
      let kv;
      try { kv = parseKeyValues(fs.readFileSync(path.join(steamapps, file), "utf8")); }
      catch { continue; }
      const appId = Number(kv.appid);
      const name = kv.name || "";
      if (!Number.isFinite(appId) || !name || seen.has(appId)) continue;
      // Skip Steam's own runtimes / redistributables — they're never "games".
      if (/^(steamworks|proton|steam linux runtime|steamvr)/i.test(name)) continue;
      seen.add(appId);

      const installDir = kv.installdir
        ? path.join(steamapps, "common", kv.installdir)
        : "";
      const exeNames = installDir ? Array.from(collectExeNames(installDir)) : [];
      entries.push({ appId, name, installDir, exeNames });
    }
  }

  cache = { ts: Date.now(), entries };
  return entries;
}

module.exports = { scanSteamLibrary };
