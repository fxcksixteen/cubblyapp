

## v0.2.4 — Fix plan

### 1. Window/taskbar icon not showing (Electron)

The icon string path inside asar isn't reliably resolved by Windows for window/taskbar/notification icons. Fix:

- Add `asarUnpack: ["electron/icon.ico"]` to `package.json` build config so the file exists on disk at runtime.
- In `electron/main.cjs`, build the icon with `nativeImage.createFromPath(...)` (resolving via `app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked/electron/icon.ico") : path.join(__dirname, "icon.ico")`) and pass the `nativeImage` to `BrowserWindow({ icon })` and to `Notification({ icon })` fallback.

### 2. 1-on-1 video call button + remote not seeing camera + fullscreen view

- **Desktop header video button** (`AppLayout.tsx` ~line 508-516) currently has no `onClick`. Wire it to call `toggleVideo()` from `useVoice()` (and start the call first if not in one, mirroring the voice button).
- **Mobile header video button**: pass an `onVideo` prop to `MobileChatHeader` that does the same.
- **Peer can't see camera**: in `VoiceContext.toggleVideo`, the DB sync uses `.update()` — if no `call_participants` row exists yet (user never muted/deafened) the update is a no-op, so peer's `useCallParticipants` never sees `is_video_on=true`. Change both `toggleVideo` branches to use the same upsert pattern as `syncCallParticipantState` (select → insert if missing → update). Also call `syncCallParticipantState` once when ICE reaches "connected" so the row always exists for both sides from the moment the call connects.
- **Fullscreen-able video tile**: in `VoiceCallOverlay.CallPanel`, wrap the local + remote camera `<video>` tiles with a fullscreen toggle button (same pattern already used for the screenshare viewer). Default tiles get larger when no screenshare is active and a click expands to full-window via `requestFullscreen()`.

### 3. CRITICAL — Screen-share-window leaks system audio

In Electron, `chromeMediaSource: "desktop"` audio capture is system-wide loopback regardless of which window/screen ID you pass — Chromium does not support per-window audio capture. Fix in `VoiceContext.startScreenShare` (Electron branch): only request audio when sharing the **entire screen** (sourceId starts with `screen:`), force-disable audio for any `window:` source, and as a hard guard strip any audio tracks the OS still hands back.

### 4. Mute/deafen indicator not visible to other participants

Same root cause as #2 — `syncCallParticipantState` runs only when the user toggles. Fix: call `syncCallParticipantState({ is_muted: false, is_deafened: false })` once as soon as the call's PeerConnection reaches `iceConnectionState === "connected"` (both caller and callee paths). After that, every mute/deafen update will be on an existing row and the realtime subscription on the peer's side will fire properly.

### 5. Reply preview disappears for a split second after sending

In `useMessages`, the realtime INSERT handler replaces the optimistic message with the row from postgres but never re-derives `reply_to`. Fix: when the new payload has `reply_to_id`, either (a) fetch it once and attach `reply_to`, or (b) preserve the optimistic message's `reply_to` if its id matches. Also do the same for the "no optimistic match" path.

### 6. iOS Home Screen PWA grey-screens on launch

Cause: `vite.config.ts` uses `base: './'` so the built `index.html` references assets with relative paths like `./assets/index-xxx.js`. When iOS launches the PWA at `start_url: "/@me/online"`, the browser resolves `./assets/...` against that path → requests `/@me/assets/...` → 404 → blank screen. Two-part fix:

- In `public/manifest.webmanifest`, change `start_url` to `"/"` (and `scope` stays `"/"`). The app already redirects `/` to `/@me/online` after auth.
- Keep `base: './'` only for Electron's `file://` loading, but also add a `<base href="/">` tag at runtime when not running under `file://` so absolute resolution works in PWA mode. Simpler alternative: switch `vite.config.ts` to `base: process.env.BUILD_TARGET === 'electron' ? './' : '/'` and update the electron build script to set that env var. We'll use the env-var split so web builds get `/` and electron builds keep `./`.

### 7. Mobile voice calling fully broken

Three iOS-Safari-specific blockers:

- The remote `<audio>` element is created in JS and appended without `playsinline`/`autoplay` honoring iOS rules — set `audioEl.setAttribute("playsinline", "true")`, `audioEl.muted = false`, and call `.play()` from inside the user-gesture handler that accepted the call (chain it off the accept click).
- `AudioContext` for the level monitor is created without resuming — on iOS it starts suspended. After creating it, call `await ctx.resume()` (still inside the accept gesture).
- `getUserMedia` constraints: drop `sampleRate: 48000`, `sampleSize: 24`, `channelCount: 2` from the audio constraints on mobile — Safari rejects the whole request when it can't satisfy them, leaving the user with no mic. Use looser defaults (`{ echoCancellation, noiseSuppression, autoGainControl }`) when running on mobile.

We'll add a small `isMobile`/`isIOS` UA check inside `VoiceContext` and apply these three fixes conditionally so desktop stereo quality is unchanged.

---

### Files to touch
- `electron/main.cjs` — icon via nativeImage (#1)
- `package.json` — `asarUnpack` + bump to `0.2.4` (#1)
- `src/pages/AppLayout.tsx` — wire header video button (#2)
- `src/components/app/mobile/MobileChatHeader.tsx` — pass `onVideo` (#2)
- `src/components/app/VoiceCallOverlay.tsx` — fullscreen-able camera tile (#2)
- `src/contexts/VoiceContext.tsx` — upsert participant row on connect, fix toggleVideo upsert, screen-share audio guard, iOS gesture/audio fixes (#2/#3/#4/#7)
- `src/hooks/useMessages.ts` — preserve/fetch `reply_to` on realtime INSERT (#5)
- `public/manifest.webmanifest` — `start_url: "/"` (#6)
- `vite.config.ts` + `scripts/build-electron.cjs` — env-driven `base` (#6)

After: deploy commands stay the same — bump to 0.2.4, build, publish, mark pre-release on GitHub.

