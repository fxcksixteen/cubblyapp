## The crash

After updating to v0.3.4, the desktop app dies on launch with:

```
Cannot find module 'builder-util-runtime'
Require stack: ...app.asar\node_modules\...\AppUpdater.js
```

## Root cause

In `package.json` under `build.files`, this exclusion glob is too greedy:

```
"!**/node_modules/builder-util*/**/*"
```

The trailing `*` matches **both** packages:

- `builder-util` — internal to `electron-builder`, build-time only, fine to exclude
- `builder-util-runtime` — a **runtime** dependency of `electron-updater`, required when the packaged app boots

So v0.3.4's installer shipped without `builder-util-runtime`, and the very first thing `electron-updater` does on startup is `require('builder-util-runtime')` → unhandled exception → the error dialog you saw. The app never gets to render.

This wasn't caught earlier because previous builds either didn't import `electron-updater` at startup or shipped before that exclusion line was tightened.

## Fix (v0.3.5)

Two tiny changes:

1. **`package.json`** — replace the greedy glob with one that keeps `builder-util-runtime` while still pruning the build-only packages:
   ```diff
   - "!**/node_modules/builder-util*/**/*",
   + "!**/node_modules/builder-util/**/*",
   + "!**/node_modules/builder-util-runtime/out/**/*.map",
   ```
   (We only exclude `builder-util` exactly, and keep all of `builder-util-runtime`. The second line is just a tiny size trim of its sourcemaps — optional.)

2. **`package.json`** — bump `version` from `0.3.4` → `0.3.5`.

3. **`src/lib/changelog.ts`** — add a v0.3.5 entry: "Fixed a desktop startup crash caused by a missing updater dependency in the v0.3.4 installer."

## Verification before shipping

- Re-read the `build.files` array and confirm no remaining glob matches `builder-util-runtime`.
- Confirm `CURRENT_VERSION` in `src/lib/changelog.ts` matches `0.3.5` so the renderer/installer version check stays consistent.
- No other code changes — the bug is purely in the packaging filter.

Once approved I'll make the edits and the next desktop installer (`Cubbly Setup 0.3.5.exe`) will boot cleanly.