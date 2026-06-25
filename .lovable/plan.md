Plan to fix the desktop size for v0.3.17:

1. Remove packaging bloat from production dependencies
   - Move `@electron/packager` out of runtime dependencies so it cannot be treated as something the installed app needs.
   - Keep only actual Electron runtime modules required by the desktop app.

2. Make the Electron build package only the real app runtime
   - Tighten the Electron Builder `files` rules so it cannot accidentally include the full dependency tree, source folders, caches, lockfiles, TypeScript build info, or build tooling.
   - Keep only: `dist`, `electron/main.cjs`, `electron/preload.cjs`, icon, the small Windows audio native addon, and the few Electron runtime modules the main process imports.

3. Add an installed-size guard, not just installer-size logging
   - Update `scripts/build-electron.cjs` to inspect the unpacked Windows app output after build.
   - Print both installer size and installed app folder size.
   - Fail/warn clearly if the installed footprint is still bloated, so a 725 MB build cannot silently ship again.

4. Add a post-pack cleanup step if needed
   - Delete Electron/runtime leftovers that are safe to remove from the packaged app: extra locales, maps, docs, tests, examples, source files, markdown/license clutter inside bundled runtime modules.
   - Preserve required Chromium/Electron binaries, WebRTC/audio support, updater support, notifications, and screen/audio capture.

5. Leave app behavior/version alone
   - No version bump unless you explicitly ask.
   - No changes to calls, chat, mentions, muting, or UI.