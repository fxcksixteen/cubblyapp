const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const version = pkg.version || "0.0.0";
const appName = "Cubbly";
const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
const releaseRoot = path.join(rootDir, "electron-release", `v${version}-${timestamp}`);
const stageDir = path.join(rootDir, "electron-release", `_stage-${timestamp}`);
const packagedAppPath = path.join(releaseRoot, `${appName}-win32-x64`);
const latestBuildFile = path.join(rootDir, "electron-release", "latest-win32.txt");
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const npxCmd = isWin ? "npx.cmd" : "npx";
const dryRun = process.argv.includes("--dry-run");

// Runtime deps that MUST be present in the packaged app (everything else is bundled in dist/).
const RUNTIME_DEPS = [
  "electron-log",
  "electron-updater",
];

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else if (entry.isSymbolicLink()) {
      try { fs.symlinkSync(fs.readlinkSync(s), d); } catch { fs.copyFileSync(s, d); }
    } else fs.copyFileSync(s, d);
  }
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

console.log(`[build:electron] Building Cubbly desktop v${version}`);
console.log(`[build:electron] Fresh output folder: ${path.relative(rootDir, releaseRoot)}`);

if (dryRun) {
  console.log(`[build:electron] Dry run.`);
  process.exit(0);
}

// ---------- Step 1: vite build ----------
console.log(`[build:electron] Step 1/4: running vite build...`);
const buildResult = spawnSync(npmCmd, ["run", "build"], { cwd: rootDir, stdio: "inherit", shell: true });
if (buildResult.status !== 0) {
  console.error(`[build:electron] vite build failed (status ${buildResult.status})`);
  process.exit(buildResult.status ?? 1);
}

// ---------- Step 2: stage clean app dir ----------
console.log(`[build:electron] Step 2/4: staging clean app directory at ${path.relative(rootDir, stageDir)}`);
rmrf(stageDir);
fs.mkdirSync(stageDir, { recursive: true });

// dist/
const distSrc = path.join(rootDir, "dist");
if (!fs.existsSync(distSrc)) {
  console.error(`[build:electron] FATAL: dist/ missing after vite build`);
  process.exit(1);
}
copyDirSync(distSrc, path.join(stageDir, "dist"));

// electron/
const electronSrc = path.join(rootDir, "electron");
if (!fs.existsSync(path.join(electronSrc, "main.cjs"))) {
  console.error(`[build:electron] FATAL: electron/main.cjs missing in source tree`);
  process.exit(1);
}
copyDirSync(electronSrc, path.join(stageDir, "electron"));

// minimal package.json
const stagedPkg = {
  name: pkg.name,
  productName: appName,
  version: pkg.version,
  main: "electron/main.cjs",
  // NOTE: no "type": "module" — we want CommonJS resolution for .cjs entry
  dependencies: {},
};
for (const dep of RUNTIME_DEPS) {
  if (pkg.dependencies?.[dep]) stagedPkg.dependencies[dep] = pkg.dependencies[dep];
}
fs.writeFileSync(path.join(stageDir, "package.json"), JSON.stringify(stagedPkg, null, 2), "utf8");

// install runtime deps inside stage
console.log(`[build:electron] Installing runtime deps in stage: ${Object.keys(stagedPkg.dependencies).join(", ")}`);
const installResult = spawnSync(npmCmd, ["install", "--omit=dev", "--no-audit", "--no-fund", "--ignore-scripts"], {
  cwd: stageDir, stdio: "inherit", shell: true,
});
if (installResult.status !== 0) {
  console.error(`[build:electron] npm install in stage failed (status ${installResult.status})`);
  process.exit(installResult.status ?? 1);
}

// ---------- Step 3: package ----------
console.log(`[build:electron] Step 3/4: running @electron/packager on staged dir...`);
const packagerArgs = [
  "@electron/packager",
  stageDir,
  appName,
  "--platform=win32",
  "--arch=x64",
  `--out=${releaseRoot}`,
  "--overwrite",
  `--icon=${path.join(rootDir, "electron", "icon.ico")}`,
  "--prune=false",
];
console.log(`[build:electron] Command: ${npxCmd} ${packagerArgs.join(" ")}`);
const packagerResult = spawnSync(npxCmd, packagerArgs, { cwd: rootDir, stdio: "inherit", shell: true });
if (packagerResult.status !== 0) {
  console.error(`[build:electron] packager exited with status ${packagerResult.status}`);
  process.exit(packagerResult.status ?? 1);
}

// ---------- Step 4: validate packaged output ----------
console.log(`[build:electron] Step 4/4: validating packaged output...`);
const resourcesAppDir = path.join(packagedAppPath, "resources", "app");
const required = [
  path.join(resourcesAppDir, "package.json"),
  path.join(resourcesAppDir, "electron", "main.cjs"),
  path.join(resourcesAppDir, "electron", "preload.cjs"),
  path.join(resourcesAppDir, "dist", "index.html"),
];
const missing = required.filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error(`[build:electron] FATAL: packaged build is missing required files:`);
  for (const m of missing) console.error(`  - ${path.relative(packagedAppPath, m)}`);
  process.exit(1);
}
const packagedPkg = JSON.parse(fs.readFileSync(path.join(resourcesAppDir, "package.json"), "utf8"));
if (packagedPkg.main !== "electron/main.cjs") {
  console.error(`[build:electron] FATAL: packaged package.json main is "${packagedPkg.main}", expected "electron/main.cjs"`);
  process.exit(1);
}
if (packagedPkg.type === "module") {
  console.error(`[build:electron] FATAL: packaged package.json has "type": "module" — this breaks .cjs resolution`);
  process.exit(1);
}
console.log(`[build:electron] ✓ Validation passed`);

// cleanup stage
rmrf(stageDir);

fs.mkdirSync(path.dirname(latestBuildFile), { recursive: true });
fs.writeFileSync(latestBuildFile, `${packagedAppPath}\n`, "utf8");

console.log(`[build:electron] Done: ${packagedAppPath}`);
console.log(`[build:electron] Version: v${version}`);
