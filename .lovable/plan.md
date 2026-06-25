# v0.3.17 Plan

## 1. Incoming call "accept" button fix
Make the green accept button take the same path as the orange rejoin button — currently it opens the call UI but doesn't actually join the peer. Reuse the rejoin flow (join existing room + attach tracks) instead of the separate accept handler.

## 2. Screenshare start/end SFX heard by all peers
Right now the SFX plays locally only. Broadcast a `screenshare_started` / `screenshare_ended` event over the existing call signaling channel; on receive, all remote peers play the same SFX.

## 3. Rename "Petite" badge → "Cute"
- Shop UI + badge registry: label becomes **Cute**, with a new fitting bio (e.g. "Small, soft, and undeniably cute.").
- Exception: user `@fawnsly` (Aria) keeps the original "Petite" name and bio displayed for her account only (hardcoded override by user id / username).

## 4. New Setting: Hardware Acceleration (functional)
Add a toggle under Settings → Appearance/Advanced.
- Web: toggles GPU-accelerated CSS paths (`will-change`, `transform: translateZ(0)`, `backface-visibility`) on heavy surfaces (chat list, video, overlays) + respects `prefers-reduced-motion`.
- Desktop (Electron wrapper): writes a flag read by the Electron main process on next launch to enable/disable Chromium GPU (`app.disableHardwareAcceleration()` when off). Persisted in localStorage + synced to profile.
- Shows "Restart required" notice for desktop changes.

## 5. Slim down Cubbly (700MB → target ~150MB)
Auditing and trimming without breaking quality:
- Tree-shake & code-split heavy routes (Settings, Shop, Calls) via `React.lazy`.
- Drop unused deps (run `depcheck`), dedupe via `npm dedupe`.
- Replace large libs where possible (e.g. moment → date-fns if present, full lodash → per-method).
- Electron: prune `node_modules` to production only, enable `asar`, exclude source maps + locales (`electron-builder` `files`/`extraResources` filters, `electronLanguages: ["en"]`).
- Compress bundled assets (convert oversized PNGs to webp, strip unused fonts).
- Vite build: `build.minify: 'esbuild'`, drop console in prod, manual chunks.

## 6. Gaming Mode — make it "godly"
Inspect current implementation, then upgrade to a true gamer feature set:
- Auto-detect running game (via existing activity detection) and enter Gaming Mode automatically.
- Push-to-talk priority + ultra-low-latency audio mode (Opus 48k mono, smaller jitter buffer).
- Notification suppression (banner + sound) while in-game, with a single subtle in-app indicator.
- Overlay HUD (web: floating mini-panel; desktop: always-on-top mini window) showing current call peers, mute, deafen, mic level, and incoming DMs.
- "Do not disturb to non-friends" + auto-status "In game — {title}".
- Performance mode: pauses chat animations, lowers background video FPS, disables sparkle/space backgrounds while active.
- Quick hotkeys: mute, deafen, PTT, toggle overlay (configurable).
- Per-game profile memory (last used input/output device, volume).

## 7. Bigger profile modal
Increase `ProfilePopup` width/height (e.g. from ~340px → ~440px, taller banner, larger avatar, larger badges row, larger bio text). Keep layout proportions, ensure it still fits viewport on small screens.

## 8. Right-click menu for GIFs in chat
Mirror the image context menu (copy, save, copy link, open in new tab, report) for GIFs. Wire to the GIF render path in chat messages.

## 9. Hover highlight scoped to single message
Currently hover highlight spans the whole grouped batch from one author. Move the hover background from the group container to the individual message row so only the hovered message highlights.

## 10. Reaction picker "+" → full emoji menu
Add a `+` button at the far right of the quick-reaction row. On click, open the full emoji picker (reuse the existing emoji picker component) to react with any emoji.

## 11. `@` mention autocomplete in message input
- DM/group chat: suggest the conversation participants.
- Server channel: suggest the last 1–10 distinct users who have sent messages in that channel (query recent messages, dedupe by author, cap 10).
- Standard popup: arrow keys + enter to select, click to insert, inserts `@displayname` linked to user id; render as a mention chip in the sent message.

## Technical notes
- Files likely touched: `VoiceCallOverlay.tsx`, `GroupCallPanel.tsx`, `useVoice` hook, `SidebarGroupCallCard.tsx` (calls + SFX), `ShopView.tsx` + `UserBadges.tsx` (badge rename), `SettingsModal.tsx` (hardware accel + gaming mode), `ProfilePopup.tsx` (size), `ChatView.tsx` / `chat/*` (hover scope, reaction +, gif menu, @ mentions), `vite.config.ts` + `package.json` (slim down), Electron config if present.
- Changelog: short user-facing bullets only, no internals, no version bump beyond 0.3.17 as instructed.
- DB: may add `last_channel_authors` query (no schema change needed) and a `hardware_acceleration` boolean on `profiles` (optional — localStorage may suffice).

Confirm and I'll implement all 11 in v0.3.17.