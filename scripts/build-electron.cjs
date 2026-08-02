const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = pkg.version || "0.0.0";
const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
const releaseRoot = path.join(rootDir, "electron-release", `v${version}-${timestamp}`);
const latestBuildFile = path.join(rootDir, "electron-release", "latest-win32.txt");
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const npxCmd = isWin ? "npx.cmd" : "npx";
const dryRun = process.argv.includes("--dry-run");
const builderConfigPath = path.join(rootDir, "electron-release", `_builder-config-${timestamp}.json`);

function rmrf(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {}
}

console.log(`[build:electron] Building Cubbly desktop installer v${version}`);
console.log(`[build:electron] Fresh output folder: ${path.relative(rootDir, releaseRoot)}`);

if (dryRun) {
  console.log(`[build:electron] Dry run.`);
  process.exit(0);
}

console.log(`[build:electron] Step 1/3: running vite build (BUILD_TARGET=electron)...`);
const buildResult = spawnSync(npmCmd, ["run", "build"], {
  cwd: rootDir,
  stdio: "inherit",
  shell: true,
  env: { ...process.env, BUILD_TARGET: "electron" },
});
if (buildResult.status !== 0) {
  console.error(`[build:electron] vite build failed (status ${buildResult.status})`);
  process.exit(buildResult.status ?? 1);
}

console.log(`[build:electron] Step 2/3: preparing installer output...`);
rmrf(releaseRoot);
fs.mkdirSync(releaseRoot, { recursive: true });
fs.mkdirSync(path.dirname(builderConfigPath), { recursive: true });

/**
 * Renderer dependencies are ALREADY bundled into dist/ by Vite — the packaged
 * app loads dist/index.html, which references nothing outside dist/assets. But
 * electron-builder copies the entire production dependency tree into app.asar
 * regardless, because for node_modules it only honours the NEGATED entries of
 * `build.files` (see app-builder-lib/out/fileMatcher.js: getNodeModuleFileMatcher
 * skips every non-"!" pattern and prepends "**\/*"). That is why the positive
 * `node_modules/...` entries in package.json are inert and why ~60 MB of React,
 * date-fns, lucide-react, recharts, etc. shipped a second time inside the asar.
 *
 * So: derive the set the MAIN process actually requires at runtime, and emit a
 * "!" pattern for every other production package. Computed rather than
 * hand-listed so it can never go stale as dependencies change.
 *
 * Failure mode is deliberately safe — any error here falls back to shipping
 * everything, i.e. today's behaviour.
 */
const MAIN_PROCESS_MODULES = ["electron-log", "electron-updater", "electron-store"];

function readModulePkg(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir, "node_modules", name, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Transitive dependency closure of the given package names. */
function dependencyClosure(roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length) {
    const name = stack.pop();
    if (seen.has(name)) continue;
    const meta = readModulePkg(name);
    if (!meta) continue;
    seen.add(name);
    for (const dep of Object.keys(meta.dependencies || {})) stack.push(dep);
  }
  return seen;
}

function computeNodeModuleExclusions() {
  const prodRoots = Object.keys(pkg.dependencies || {});
  if (prodRoots.length === 0) return [];
  const allProd = dependencyClosure(prodRoots);
  const keep = dependencyClosure(MAIN_PROCESS_MODULES);
  // Sanity: if the closure of the main-process modules came back empty, our
  // resolution is broken — ship everything rather than risk a broken app.
  if (keep.size === 0) {
    console.warn(`[build:electron] could not resolve main-process modules — skipping node_modules pruning`);
    return [];
  }
  // Belt and braces: never exclude anything the hand-written allowlist in
  // package.json mentions, even if the closure disagrees.
  const allowlisted = new Set();
  for (const pattern of pkg.build?.files || []) {
    if (typeof pattern !== "string" || pattern.startsWith("!")) continue;
    const m = pattern.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (m) allowlisted.add(m[1]);
  }
  return [...allProd]
    .filter((name) => !keep.has(name) && !allowlisted.has(name))
    .sort()
    .map((name) => `!node_modules/${name}/**/*`);
}

let nodeModuleExclusions = [];
try {
  nodeModuleExclusions = computeNodeModuleExclusions();
} catch (e) {
  console.warn(`[build:electron] node_modules pruning skipped: ${e?.message || e}`);
  nodeModuleExclusions = [];
}
if (nodeModuleExclusions.length) {
  console.log(`[build:electron] pruning ${nodeModuleExclusions.length} renderer-only packages from app.asar (bundled into dist/ already)`);
}

const buildConfig = {
  ...pkg.build,
  files: [...(pkg.build?.files || []), ...nodeModuleExclusions],
  directories: {
    ...(pkg.build?.directories || {}),
    output: releaseRoot,
  },
};
fs.writeFileSync(builderConfigPath, JSON.stringify(buildConfig, null, 2), "utf8");

console.log(`[build:electron] Step 3/3: running electron-builder for Windows NSIS installer...`);
const builderArgs = [
  "electron-builder",
  "--win",
  "nsis",
  "--x64",
  "--publish",
  "never",
  "--config",
  builderConfigPath,
];
console.log(`[build:electron] Command: ${npxCmd} ${builderArgs.join(" ")}`);
const builderResult = spawnSync(npxCmd, builderArgs, {
  cwd: rootDir,
  stdio: "inherit",
  shell: true,
});
rmrf(builderConfigPath);
if (builderResult.status !== 0) {
  console.error(`[build:electron] electron-builder exited with status ${builderResult.status}`);
  process.exit(builderResult.status ?? 1);
}

const expectedFiles = [
  path.join(releaseRoot, `Cubbly Setup ${version}.exe`),
  path.join(releaseRoot, `Cubbly Setup ${version}.exe.blockmap`),
  path.join(releaseRoot, "latest.yml"),
];
const missing = expectedFiles.filter((filePath) => !fs.existsSync(filePath));
if (missing.length) {
  console.error(`[build:electron] FATAL: installer build is missing required files:`);
  for (const missingFile of missing) {
    console.error(`  - ${path.relative(releaseRoot, missingFile)}`);
  }
  process.exit(1);
}

fs.mkdirSync(path.dirname(latestBuildFile), { recursive: true });
fs.writeFileSync(latestBuildFile, `${releaseRoot}\n`, "utf8");

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

const installerPath = path.join(releaseRoot, `Cubbly Setup ${version}.exe`);
let installerSize = 0;
try { installerSize = fs.statSync(installerPath).size; } catch {}

// The number that actually matters to users is the INSTALLED footprint
// (what Windows "Installed apps" shows), not the .exe download size.
const unpackedDir = path.join(releaseRoot, "win-unpacked");
const unpackedSize = fs.existsSync(unpackedDir) ? dirSize(unpackedDir) : 0;

console.log(`[build:electron] ✓ Installer build complete`);
console.log(`[build:electron] Installer (download):  ${fmtMB(installerSize)} (target ≤ 150 MB)`);
console.log(`[build:electron] Installed (on disk):   ${fmtMB(unpackedSize)} (target ≤ 350 MB)`);
if (installerSize > 150 * 1024 * 1024) {
  console.warn(`[build:electron] ⚠ Installer exceeds 150 MB target.`);
}
if (unpackedSize > 350 * 1024 * 1024) {
  console.warn(`[build:electron] ⚠ Installed footprint exceeds 350 MB — investigate runtime bloat.`);
}
console.log(`[build:electron] Upload these files from: ${releaseRoot}`);
console.log(`[build:electron]   - Cubbly Setup ${version}.exe`);
console.log(`[build:electron]   - Cubbly Setup ${version}.exe.blockmap`);
console.log(`[build:electron]   - latest.yml`);
