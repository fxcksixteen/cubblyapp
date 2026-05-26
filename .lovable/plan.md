## v0.3.4 — Desktop & Web fixes + new features

### 1. Space theme — modal/popup breakage
The `cb-space-bg` fixed star-field is layering above Radix portals (Dialog/Popover/Sheet). Fix by lowering its `z-index` (e.g. `-1` with proper stacking context on `body`) and ensuring `pointer-events: none` is respected. Audit other animated theme backgrounds (Borealis, Synthwave, Lava) for the same regression.

### 2. Shooting stars look wrong
Current `.cb-shooting-star` animation runs too often and too fast — looks like falling icicles. In `index.css`:
- Slow streak duration to ~1.2s, with long random delays (15–40s) between cycles
- Add a soft tapered gradient tail (transparent → white → transparent), small head glow
- Reduce count to 2 streaks max, randomized diagonal angles
- Ensure they fade in/out instead of hard cuts

### 3. Personal Notes — Undo/Redo
Add undo/redo buttons to the note editor toolbar (web + desktop). Use the underlying TipTap/contenteditable history (`editor.chain().undo()` / `.redo()`), with disabled states based on `editor.can().undo()`. Keyboard shortcuts Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z.

### 4. Voice call timer should NOT reset when one user leaves
In `VoiceContext` / call-pill logic, the elapsed time is currently tied to the local user's join time. Change so the call's `started_at` lives on the call/session record and is only cleared when the last participant leaves. The pill and call UI both read from that shared `started_at`. Local rejoin keeps the same timestamp.

### 5. Game-detection ghost (free coins bug)
In `ActivityContext` / detector loop: when the detected process disappears, sometimes the "current activity" state isn't cleared. Fix:
- Require N consecutive misses (e.g. 2 polls) before clearing — but DO clear after that
- On clear, immediately call `setGamingActive(false)` via `CoinTrackingBridge`
- Add a hard watchdog: if no fresh detection event in >30s, force-clear

### 6. Desktop app size (744 MB → ~150 MB target)
Audit `electron-release/` and `package.json`:
- Move heavy deps to `devDependencies` so they're not packaged
- Add aggressive `--ignore` patterns to `@electron/packager` (test files, source maps, .md, .ts source, locales we don't use, `node_modules` of unused packages)
- Strip Electron locales except `en-US`
- Remove duplicated bundled native modules
- Run `asar` packing
Goal: trimmed installer under 200 MB.

### 7. Three new animated themes — Sky, Snowy, Hills
Following the `space` pattern:
- Add tokens in `index.css` (`[data-theme="sky"]`, `snowy`, `hills`)
- Add `ThemeName` entries in `ThemeContext`
- Build dedicated background components (`SkyBackground`, `SnowyBackground`, `HillsBackground`) under `src/components/app/`, mounted alongside `SpaceBackground`
- Sky: drifting clouds, soft day-to-dusk gradient
- Snowy: falling snowflakes, frosted blue tint
- Hills: nighttime moonlit silhouette of layered hills, stars, parallax
- Add corresponding Shop entries + iOS `AnimatedThemeGradient` previews

### 8. Server voice call presence
Two gaps:
- **Inside the server**: under the voice channel (e.g. "General"), render the list of connected participants (avatar + display name + mute/deafen icons), like Discord. Pull from existing voice presence channel.
- **Across the app**: when in a server voice call, the bottom-of-DM-sidebar "current call" pill should appear with the server + channel name as location, ping/connection indicator, and quick-leave button — same component used for DM calls.

### 9. Server owner crown icon
Replace the 👑 emoji in the server members list with a proper Lucide `Crown` icon (gold accent color), matching the app's icon style.

### 10. Hide message-requests inbox on server pages
In the top-right header, conditionally hide the message requests / inbox button when the current route matches `/server/*`.

### Technical notes
- All theme changes: HSL tokens in `index.css`, no hardcoded colors in components
- New backgrounds: respect `prefers-reduced-motion`
- Call timer source-of-truth migration may need a tiny schema/realtime tweak (track `started_at` on the call row, not per-participant)
- Crown icon: `<Crown className="w-4 h-4 text-yellow-400" />` (use semantic token)
- Files likely touched: `src/index.css`, `src/contexts/ThemeContext.tsx`, `src/components/app/SpaceBackground.tsx` (+ 3 new bg components), `src/contexts/VoiceContext.tsx`, `src/contexts/ActivityContext.tsx`, notes editor component, server sidebar + members list components, top header component, `scripts/build-electron.cjs` / packager config.
