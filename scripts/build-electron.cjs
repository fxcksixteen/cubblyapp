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

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
}

console.log(`[build:electron] Building Cubbly desktop installer v${version}`);
console.log(`[build:electron] Fresh output folder: ${path.relative(rootDir, releaseRoot)}`);

if (dryRun) {
  console.log(`[build:electron] Dry run.`);
  process.exit(0);
}

console.log(`[build:electron] Step 1/3: running vite build...`);
const buildResult = spawnSync(npmCmd, ["run", "build"], { cwd: rootDir, stdio: "inherit", shell: true });
if (buildResult.status !== 0) {
  console.error(`[build:electron] vite build failed (status ${buildResult.status})`);
  process.exit(buildResult.status ?? 1);
}

console.log(`[build:electron] Step 2/3: cleaning output folder...`);
rmrf(releaseRoot);
fs.mkdirSync(releaseRoot, { recursive: true });

console.log(`[build:electron] Step 3/3: running electron-builder for Windows NSIS installer...`);
const builderArgs = [
  "electron-builder",
  "--win",
  "nsis",
  "--x64",
  "--publish",
  "never",
  "--config",
  `directories.output=${releaseRoot}`,
];
console.log(`[build:electron] Command: ${npxCmd} ${builderArgs.join(" ")}`);
const builderResult = spawnSync(npxCmd, builderArgs, { cwd: rootDir, stdio: "inherit", shell: true });
if (builderResult.status !== 0) {
  console.error(`[build:electron] electron-builder exited with status ${builderResult.status}`);
  process.exit(builderResult.status ?? 1);
}

const expectedFiles = [
  path.join(releaseRoot, `Cubbly Setup ${version}.exe`),
  path.join(releaseRoot, `Cubbly Setup ${version}.exe.blockmap`),
  path.join(releaseRoot, "latest.yml"),
];
const missing = expectedFiles.filter((p) => !fs.existsSync(p));
if (missing.length) {
  console.error(`[build:electron] FATAL: installer build is missing required files:`);
  for (const m of missing) console.error(`  - ${path.relative(releaseRoot, m)}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(latestBuildFile), { recursive: true });
fs.writeFileSync(latestBuildFile, `${releaseRoot}\n`, "utf8");

console.log(`[build:electron] ✓ Installer build complete`);
console.log(`[build:electron] Upload these files from: ${releaseRoot}`);
console.log(`[build:electron]   - Cubbly Setup ${version}.exe`);
console.log(`[build:electron]   - Cubbly Setup ${version}.exe.blockmap`);
console.log(`[build:electron]   - latest.yml`);

