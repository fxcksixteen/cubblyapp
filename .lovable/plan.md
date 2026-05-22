
# Cubbly v0.3.3 — Web & Desktop Fix Pack

Bump version to **v0.3.3** (web changelog + Electron package + iOS metadata stays at 0.1.5 since this is web/desktop only). Add a changelog entry summarizing the fixes below.

---

## 1. Calls

**A. "Rejoin" button doesn't actually start a call**
- In `ChatView.tsx` / `VoiceCallOverlay.tsx`, the rejoin CTA currently calls a different code path than the header phone button.
- Fix: route the Rejoin button through the exact same handler as the top-right Start Call button (`startCall(conversationId, { video: false })` from `VoiceContext` / `GroupCallContext` depending on DM vs group), instead of trying to "re-attach" to a missed-call session.
- Clear any stale "incoming"/"ringing" state for that conversation before initiating so it doesn't short-circuit.

**B. Call pill shows wrong time / `00:00` duration**
- Pill is being written on call start with `started_at = now` but on the hang-up path the duration update sometimes never fires (cleanup runs before the final `UPDATE` to `call_events`).
- Fix: in `VoiceContext.endCall` and `GroupCallContext.leaveCall`, compute duration locally (`Date.now() - startedAtMs`) and `await` the supabase update before tearing down peer connections / clearing state. Also stamp `ended_at` so realtime subscribers re-render the pill with the correct duration.

**C. Game-launch-during-call freezes Cubbly**
- This is the Windows native audio capture (`native/win-audio-capture`) attaching to the game process and blocking the renderer.
- Fix:
  - Move all `process_loopback_capture` calls off the renderer/main thread into a Node worker so a stuck capture cannot freeze the UI/WebRTC.
  - Add a 2s init timeout + try/catch around attach; on failure, silently disable activity-audio mixing for that session instead of crashing the call.
  - Stop tearing down and re-creating the WebRTC PeerConnection when a new game is detected — only swap the local outbound track via `sender.replaceTrack(...)`.

---

## 2. Message delete doesn't sync in realtime

- `useMessages` is subscribed to `INSERT` but the `DELETE` handler either filters by `new.id` (which is null on deletes) or the table isn't in `supabase_realtime` for DELETE events.
- Fix:
  - Migration: ensure `messages` table has `REPLICA IDENTITY FULL` and is in `supabase_realtime` publication for `DELETE`.
  - In `useMessages`, add an `on('postgres_changes', { event: 'DELETE', ... })` handler keyed on `old.id` that removes the message from local state immediately for both participants.
  - Optimistic removal on the deleter's side stays.

---

## 3. App size is 700+ MB

Audit + slim the Electron build:
- Drop `node_modules` dev deps from packaged app — currently shipping the entire install. Switch `electron-builder` `files` allowlist to only `dist/**`, `electron/**.cjs`, `package.json`, and runtime-required native modules.
- Exclude source maps, ICU data we don't need (`--disable-features=...`), and unused locales (keep `en-US` + a small set; electron-builder `electronLanguages`).
- Strip `prebuilds/` for non-target architectures from `native/win-audio-capture` at pack time.
- Enable `asar` + `compression: maximum`.
- Target: < 200 MB installed. Will report final size after the change.

---

## 4. Personal Notes

- Add horizontal scroll: wrap the note content in a container with `overflow-x: auto` and `min-w-0`; only render scrollbar when content overflows (default browser behavior with `overflow-x: auto`). Also allow `white-space: pre` for code-like blocks.
- Restore proper selection by removing the `user-select` constraints / parent `overflow: hidden` clipping selection drag.
- Add hover states (`hover:bg-[var(--app-hover)]`, cursor-pointer, subtle border) to all interactive controls in the Notes tab to match the rest of the app.

---

## 5. Appearance theme bugs

- Theme apply is racing because `ThemeContext` writes CSS vars in an effect that depends on the previous theme's vars (closure capture).
- Fix: make theme application idempotent — set every variable on `:root` from a single source-of-truth map every time, not a diff. Persist immediately via `localStorage.setItem`, then dispatch a `storage` event so other windows update too.
- Add a unit-ish sanity check: after `setTheme(x)`, read back `--app-bg-primary` and confirm it matches; if not, retry once.

---

## 6. Gamer badge — replace with attached headphones image

- Delete `src/assets/badges/gamer.svg`.
- Copy uploaded white-bear-headphones PNG → `src/assets/badges/gamer.png`.
- Update `UserBadgesContext` / badge registry to point at the new PNG (and ensure `<img>` size containers fit a raster instead of an SVG).

---

## 7. Notifications tab

- "Send Test Notification" silently no-ops in the browser when permission is `denied`. Fix:
  - Detect web (non-Electron) + permission state. If `default`, request permission first. If `denied`, show a toast explaining the browser blocked it. If Electron, route through `electronAPI.notify(...)`.
  - Disable the button (with tooltip "Only available in the desktop app" or "Notifications blocked in this browser") when it cannot work, instead of pretending to send.
- Make every Call Sound (outgoing ring, incoming call, leave call, mute, unmute, deafen, undeafen, message) testable from the list — wire each row to `playSound(key, { force: true })`.

---

## 8. Settings toggle UI consistency

The **Chat** settings tab is the source of truth. All other tabs must use the exact same toggle component, row layout, spacing, and section header style.
- Extract the Chat tab's toggle row into `_shared.tsx` as `<SettingsRow>` + reuse the existing `<SettingsToggle>`.
- Refactor `NotificationSettings`, `DataPrivacySettings`, `ContentSocialSettings`, `AccessibilitySettings`, `ActivityPrivacySettings`, `GamingModeSettings`, `AdvancedSettings`, `LanguageTimeSettings` to render rows through `SettingsRow` so they all match the screenshots' "Chat" style (full-width pill rows, consistent icon container, identical toggle track size/colors, identical typography).

---

## 9. Servers

**A. DM sidebar still visible on a server route**
- `AppLayout` always mounts the DM list. Fix: when the route matches `/@me/server/:serverId/...`, render the server channel sidebar (text + voice channels grouped by category, using `useServerChannels`) instead of the DM list. The server rail on the far left stays.

**B. "Select a channel" placeholder shows even though a channel is selected**
- The server channel route reads `channelId` from the URL but the chat panel is keyed off `conversationId` from `ServersContext`/route state which isn't being resolved. Fix: resolve `server_channels.conversation_id` for the URL `channelId` and pass that conversation into `ChatView`. Show the actual channel name in the header.

**C. Voice channels don't function**
- Wire voice channels: clicking a voice channel calls `groupCall.joinCall(channel.conversation_id)`; show the participant list under the channel in the sidebar (live via realtime presence).

**D. Invite error `gen_random_bytes(integer) does not exist`**
- The `create_server_invite` (or equivalent) SQL function uses `gen_random_bytes`, but `pgcrypto` isn't enabled in this project (only `pgsodium`/`gen_random_uuid` from `pgcrypto` extension may be missing in the right schema).
- Migration: `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;` and rewrite the invite-code generator to use `encode(extensions.gen_random_bytes(6), 'base64')` (or switch to `substr(replace(gen_random_uuid()::text,'-',''),1,8)` which needs no extension — preferred, since it avoids the extension dependency entirely).

---

## Technical notes

- All DB changes go through `supabase--migration`. New extension and invite-RPC fix in one migration.
- Realtime DELETE for `messages` requires `REPLICA IDENTITY FULL` + publication membership.
- Electron size work is in `scripts/build-electron.cjs` + `package.json` `build` config; no runtime code impact.
- Version bump: `package.json` → `0.3.3`, add changelog entry in `src/lib/changelog.ts`.

## Out of scope
- iOS native (`ios-native/`) stays at v0.1.5.
- No design overhaul of settings — only consistency pass.
