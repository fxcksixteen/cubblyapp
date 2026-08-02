#!/usr/bin/env node
/**
 * Safely prune old local installer builds from electron-release/.
 *
 * WHY THIS IS A SCRIPT AND NOT A SHELL ONE-LINER:
 * The ad-hoc shell version of this deleted EVERY build folder including the one
 * it was supposed to keep. The mechanism was mundane and worth recording:
 *
 *     cd electron-release && NEWEST=$(ls | tail -1); for d in $(ls | grep -v "^$NEWEST$"); do rm -rf "$d"; done
 *
 * The shell was already inside electron-release, so `cd` failed, `&&`
 * short-circuited, and NEWEST was never assigned. The pattern then degraded to
 * `grep -v "^$"` — which excludes nothing — and the loop deleted everything.
 *
 * Guards here, in order of how much they matter:
 *   1. No `cd` at all. Every path is resolved absolutely from __dirname.
 *   2. The keep target is resolved BEFORE anything is deleted, and the script
 *      aborts if it cannot be resolved. There is no code path where an
 *      unset/empty value reaches a delete.
 *   3. Only directories matching the release-folder pattern are ever
 *      considered, so stray files (latest-win32.txt) can't be caught.
 *   4. The keep target is filtered out explicitly AND re-asserted immediately
 *      before each delete.
 *   5. Dry run by default. Deleting requires --yes.
 *
 * Usage:
 *   node scripts/clean-releases.cjs            # show what would be deleted
 *   node scripts/clean-releases.cjs --yes      # actually delete
 *   node scripts/clean-releases.cjs --keep 3 --yes
 */
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const releaseRoot = path.join(rootDir, "electron-release");
const latestPointer = path.join(releaseRoot, "latest-win32.txt");

// v<semver>-<ISO timestamp with . and : replaced by ->
const RELEASE_DIR_RE = /^v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}T[\d-]+Z$/;

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const keepIdx = args.indexOf("--keep");
const keepCount = keepIdx >= 0 ? Number(args[keepIdx + 1]) : 1;

function fail(msg) {
  console.error(`[clean:releases] ABORT — ${msg}`);
  process.exit(1);
}

if (!Number.isInteger(keepCount) || keepCount < 1) fail(`--keep must be a positive integer (got ${keepCount})`);
if (!fs.existsSync(releaseRoot)) {
  console.log("[clean:releases] nothing to do — electron-release/ does not exist");
  process.exit(0);
}

// --- Resolve the keep set FIRST. Nothing is deleted until this succeeds. ---
const candidates = fs
  .readdirSync(releaseRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && RELEASE_DIR_RE.test(e.name))
  .map((e) => e.name)
  .sort(); // ISO timestamps sort chronologically

if (candidates.length === 0) {
  console.log("[clean:releases] nothing to do — no release folders found");
  process.exit(0);
}

const keep = new Set(candidates.slice(-keepCount));
if (keep.size === 0) fail("resolved an empty keep set — refusing to delete anything");
for (const k of keep) {
  if (typeof k !== "string" || k.length === 0) fail("keep set contains an empty entry — refusing to delete anything");
}

// Cross-check against the pointer the build script writes, so a surprise here
// stops the run rather than silently deleting the build someone is shipping.
let pointerName = null;
try {
  pointerName = path.basename(fs.readFileSync(latestPointer, "utf8").trim());
} catch { /* pointer is optional */ }
if (pointerName && !keep.has(pointerName)) {
  fail(
    `latest-win32.txt points at "${pointerName}" which is not in the keep set ` +
    `(${[...keep].join(", ")}). Refusing to run — pass --keep N to widen the window.`
  );
}

const doomed = candidates.filter((name) => !keep.has(name));

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else { try { total += fs.statSync(p).size; } catch {} }
    }
  }
  return total;
}
const mb = (b) => `${(b / (1024 * 1024)).toFixed(0)} MB`;

console.log(`[clean:releases] keeping ${keep.size}: ${[...keep].join(", ")}`);
if (doomed.length === 0) {
  console.log("[clean:releases] nothing to delete");
  process.exit(0);
}

let freed = 0;
for (const name of doomed) {
  const size = dirSize(path.join(releaseRoot, name));
  freed += size;
  console.log(`  ${confirmed ? "delete" : "would delete"}  ${mb(size).padStart(8)}  ${name}`);
}

if (!confirmed) {
  console.log(`[clean:releases] DRY RUN — ${doomed.length} folders, ${mb(freed)}. Re-run with --yes to delete.`);
  process.exit(0);
}

let deleted = 0;
for (const name of doomed) {
  // Re-assert per iteration: a name must be non-empty, must match the release
  // pattern, must not be in the keep set, and must resolve inside releaseRoot.
  if (!name || !RELEASE_DIR_RE.test(name) || keep.has(name)) fail(`refusing to delete unexpected entry "${name}"`);
  const target = path.resolve(releaseRoot, name);
  if (path.dirname(target) !== releaseRoot) fail(`refusing to delete outside electron-release: ${target}`);
  fs.rmSync(target, { recursive: true, force: true });
  deleted++;
}
console.log(`[clean:releases] deleted ${deleted} folders, reclaimed ${mb(freed)}`);
