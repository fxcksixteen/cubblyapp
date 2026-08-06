# v0.4.30 (desktop + web) and final v0.1.9 iOS item

## 1. iOS: personal note sharing (full parity)

The iOS app has notes (create/edit/vault crypto) but no sharing at all. Web/desktop sharing will be ported in full:

- Share sheet from the note list row menu and from inside the note editor.
- Multi-select recipient picker (DMs and groups), search, "share to N chats".
- All share modes that exist on web: normal shared note, live-sync note (your later edits update the shared copy), view-once/burn note, and the recipient one-time edit flow.
- Honey-gated advanced options respect the same entitlement check as web.
- Chat rendering of `[[cubbly:shared-note:v1]]` messages on iOS: preview card, open/expand, view-once burn on close, "Save to my notes", and the recipient-edit composer.
- Uses the same backend RPCs as web (`sync_shared_note`, `burn_view_once_note`, `apply_recipient_note_edit`), so no schema changes.

## 2. Settings icons in desktop/web settings menu

Your 14 SVGs get added to `src/assets/icons/` and rendered to the left of each tab title in the settings sidebar (and in each tab header, matching iOS):

Notifications, Voice & Video, Activity Privacy, Appearance, Chat, Content & Social, Data & Privacy, Devices, Gaming Mode, Keybinds, Language & Time, Advanced, Update Logs (What's New), My Account.

Missing icons — currently no SVG supplied:
- **Billing** — needs an icon (or I keep the existing one).
- **Accessibility** — you said keep it as-is, so unchanged.

## 3. Screenshare: honour the picked quality, Discord-level tuning

- The quality/FPS the user picks in the picker becomes a hard floor for the encoder, not a hint the adaptive loop can silently drop below. Picking 1080p60 means 1080p60 unless the network genuinely cannot carry it, and it climbs straight back when it can.
- Content-aware profiles: motion (games/video) prioritises framerate; text/detail (code, docs, browsing) prioritises resolution and sharpness, with the appropriate degradation preference and content hint per mode.
- Bitrate ceilings and simulcast layers rescaled per selected resolution so a 1080p pick actually gets 1080p-class bitrate rather than the generic ladder.
- Startup at full target quality (no blurry ramp-in), and recovery back to target after a congestion dip.

## 4. Activity detection: any Steam game, automatically

- Scan the local Steam install (`libraryfolders.vdf` + each library's `appmanifest_*.acf`) to build a map of installed appid to game name and install folder.
- Match a running process to its Steam appid via that map, so any installed Steam game is detected and named correctly without being in the curated list.
- Icon is pulled automatically from the Steam CDN for that appid (capsule/header art), replacing the letter-tile fallback.
- Curated icons still win when present; the .exe icon extraction stays as the last fallback for non-Steam games.

## 5. GTA V activity icon

The attached GTA V "FIVE" logo becomes the icon for Grand Theft Auto V, mapped across its names/processes (`gta5`, `gtav`, `grand theft auto v`, `playgtav`, `gta5_enhanced`, FiveM variants).

## 6. Desktop app icon

The circular Cubbly bear logo replaces the app icon everywhere: taskbar, Start/search, window, installer, and shortcuts. Generated at all required sizes into a multi-resolution `.ico` (16/24/32/48/64/128/256) plus `.icns`/`.png` for the other platforms, and wired into the build config and the runtime window/tray icon.

## 7. Version + changelog

Bump to `0.4.30` and add short one-line user-facing changelog entries.

---

### Technical notes

- Settings icons: new `SettingsTabIcon` helper reading from `src/assets/icons/settings-*.svg`, wired into the sidebar list and section headers in `SettingsModal.tsx`.
- Screenshare: `src/lib/screenShareEncoding.ts` gets a `targetProfile` derived from the picker selection (resolution, fps, content type) that clamps the adaptive floor; `VoiceContext` passes the picker choice through instead of only seeding it.
- Steam scan: new `electron/steamLibrary.cjs` reading `libraryfolders.vdf`/`appmanifest_*.acf`, exposed via IPC and consumed by `src/lib/activityIcons.ts` for appid to CDN image resolution.
- Icons: `electron/icon.ico` regenerated with ImageMagick from the uploaded PNG; `package.json` build config already points at that path.
