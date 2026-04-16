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
const packagedAppPath = path.join(releaseRoot, `${appName}-win32-x64`);
const latestBuildFile = path.join(rootDir, "electron-release", "latest-win32.txt");
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const npxCmd = isWin ? "npx.cmd" : "npx";
const dryRun = process.argv.includes("--dry-run");

const packagerArgs = [
  "@electron/packager",
  ".",
  appName,
  "--platform=win32",
  "--arch=x64",
  `--out=${releaseRoot}`,
  "--overwrite",
  "--icon=electron/icon.ico",
  "--prune=true",
  "--ignore=^/src$",
  "--ignore=^/public$",
  "--ignore=^/electron-release$",
  "--ignore=^/supabase$",
  "--ignore=^/dev-server$",
];

console.log(`[build:electron] Building Cubbly desktop v${version}`);
console.log(`[build:electron] Fresh output folder: ${path.relative(rootDir, releaseRoot)}`);

if (dryRun) {
  console.log(`[build:electron] Dry run command: ${npxCmd} ${packagerArgs.join(" ")}`);
  process.exit(0);
}

console.log(`[build:electron] Step 1/2: running vite build...`);
const buildResult = spawnSync(npmCmd, ["run", "build"], {
  cwd: rootDir,
  stdio: "inherit",
});

if (buildResult.error) {
  console.error(`[build:electron] FAILED to spawn '${npmCmd} run build':`, buildResult.error.message);
  process.exit(1);
}
if (buildResult.status !== 0) {
  console.error(`[build:electron] vite build exited with status ${buildResult.status}`);
  process.exit(buildResult.status ?? 1);
}

console.log(`[build:electron] Step 2/2: running @electron/packager...`);
console.log(`[build:electron] Command: ${npxCmd} ${packagerArgs.join(" ")}`);
const packagerResult = spawnSync(npxCmd, packagerArgs, {
  cwd: rootDir,
  stdio: "inherit",
});

if (packagerResult.error) {
  console.error(`[build:electron] FAILED to spawn '${npxCmd}':`, packagerResult.error.message);
  process.exit(1);
}
if (packagerResult.status !== 0) {
  console.error(`[build:electron] packager exited with status ${packagerResult.status}`);
  process.exit(packagerResult.status ?? 1);
}

fs.mkdirSync(path.dirname(latestBuildFile), { recursive: true });
fs.writeFileSync(latestBuildFile, `${packagedAppPath}\n`, "utf8");

console.log(`[build:electron] Done: ${packagedAppPath}`);
console.log(`[build:electron] Version: v${version}`);