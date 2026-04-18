
## v0.2.5 — Performance, call quality, and chat fixes

Big batch. Grouped by area.

### 1. Screenshare audio quality (muffled / glitchy)

Right now Electron requests `{ video: true, audio: true }` with no constraints, so we get the default low-quality WebRTC voice profile applied to a stereo music/game stream → muffled and crackly. Fixes:
- In `VoiceContext.tsx` and `GroupCallContext.tsx`, request audio with `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2, sampleRate: 48000 }`. These three "voice" filters are what destroy game/music audio.
- After `addTrack` for screenshare audio, set sender encoding `maxBitrate: 256_000`, `priority: "high"` so Opus runs at high stereo bitrate instead of the default ~32 kbps mono speech profile.
- Patch the screen-share PC's SDP to enable stereo Opus (`stereo=1; sprop-stereo=1; maxaveragebitrate=256000`) — same trick already used for voice, just applied to the screen PC.

### 2. Camera not visible to peers + slow mute/deafen indicator

Two related transceiver/signaling bugs:
- 1:1 `toggleVideo` (in `VoiceContext.tsx`) uses `replaceTrack` on the pre-created video transceiver. If transceiver direction is `recvonly` on the peer side (or transceiver wasn't symmetrically added on the offerer when callee is on an old build), the peer never sees video. Fix: force `direction = "sendrecv"` on enable, fall back to `addTrack` + renegotiate when transceiver is missing.
- Mute/deafen indicator delay comes from relying on the DB realtime round-trip (`call_participants` UPDATE → postgres_changes → refetch → setState). That's 2–3s.
  - Fix: also broadcast `peer-mute` / `peer-deafen` over the existing voice signaling channel (group calls already do this). 1:1 `VoiceCallOverlay` will read the broadcast for instant updates and keep the DB row purely as fallback / late-joiner sync.

### 3. Gaming Mode actively makes things worse

Two real issues:
- `affectCallsAndShare = false` is supposed to leave calls alone, but right now Gaming Mode polls process list every few seconds during a call (the `ActivityContext` poll runs unconditionally) and the process scan on Windows uses `tasklist` which is heavy. Fix: while in an active 1:1 or group call, throttle the poll interval to ~30s (or pause entirely if `isSuppressing && !affectCallsAndShare`, since the activity row will already be set).
- The "suppression" currently does very little useful — no animation downgrade, no realtime throttling — but it does add a polling loop. Net effect is "laggier". Fix:
  - When `isSuppressing` is on, bump the activity poll interval up massively (no need to re-detect a game every 5s).
  - Skip avatar/video animations and presence-channel chatter during suppression (CSS `prefers-reduced-motion`-style class on `<html>`).
- Bug: "Also affects calls" is OFF by default but suppression behavior was bleeding into calls. Audit `__cubblySuppressCalls` flow — callers should check `isSuppressingCalls` not `isSuppressing` when deciding to throttle call-related work. Fix any place that reads the wrong flag.

### 4. Calls go laggy / wifi-bound while gaming

Same root cause as above (constant `tasklist` polling + unconstrained webrtc bitrate competing with game traffic). On top of #3:
- During an active call, set RTCRtpSender encoding `networkPriority: "high"` on audio + camera tracks so the OS prioritizes WebRTC packets over background traffic.
- Cap camera bitrate when Gaming Mode is on (e.g. 500 kbps) so video doesn't saturate uplink.

### 5. Verify screenshare quality/FPS UI actually works

Audit `startScreenShare` in `VoiceContext.tsx`:
- Resolution/FPS constraints ARE being passed into `getDisplayMedia` ✅
- `optimizeFor`/bitrate IS applied via `applyScreenBitrate` ✅
- BUT in Electron path, after main grants the source via `setDisplayMediaRequestHandler`, Chromium may ignore the resolution constraints (capture is always source-native). Fix: after capture, call `videoTrack.applyConstraints({ width, height, frameRate })` to actually downscale/cap the FPS. Also force `contentHint` to match preset.
- Add `console.log` of actual track settings (`getSettings()`) post-capture so we can confirm in devtools that the chosen quality is in effect.

### 6. Screenshare appears low-quality to the OTHER user

This is the WebRTC encoder kicking in adaptive degradation. We send a 1080p stream but the encoder downgrades aggressively because:
- Default `degradationPreference` is `"balanced"` → at the first sign of CPU/bandwidth pressure it drops resolution hard.
- `maxBitrate` is set, but there's no `minBitrate` floor and no `scaleResolutionDownBy` lock.

Fix:
- Set `params.degradationPreference = "maintain-resolution"` for screenshare senders so it drops FPS instead of pixelating.
- Set `scaleResolutionDownBy = 1` on the encoding so it never downscales below picked resolution.
- Bump `maxBitrate` defaults: ultra → 12 Mbps, motion → 8 Mbps, clarity → 6 Mbps. (Current 8/5/4 is what Discord ships for free tier, not high enough for "ultra".)
- Add periodic `getStats()` log of outbound video bitrate/resolution so we can see if the encoder is actually delivering what we asked.

### 7. Chat: don't load entire history at mount + GIF reply preview

Current `useMessages` does `select("*").eq(conv).order asc` with no limit — every message ever in the DM loads at once. On a long DM that's what's letting an absurdly-long GIF URL push your call buttons off-screen on a vertical monitor.

Fix:
- `useMessages` loads **last 50 messages only** (descending then reversed). Render that, snap to bottom (the way it already does).
- Add `loadOlder()` that fetches the next 50 older messages when the user scrolls near the top, prepending them while preserving scroll position. (Discord style.)
- Realtime INSERT keeps appending to the bottom as before.

For the reply pill itself (`ChatView.tsx` reply preview render around line 502–516):
- When the replied-to message's content is a GIF URL (matches `^https?:\/\/.*\.(gif|giphy|tenor)`), render `<GifIcon /> GIF` instead of the URL.
- Also apply `min-w-0` + `truncate` properly so even if content is huge, the pill never widens its parent (defensive, prevents the layout overflow bug from ever recurring).

### 8. Layout safety

Add `min-w-0` to chat header / message row flex children so a long inline string can never push siblings (call buttons) out of frame on narrow / vertical viewports. This is a small but important hardening pass on `ChatView.tsx` and `MobileChatHeader.tsx`.

---

### Files to change

- `electron/main.cjs` — keep `audio: 'loopback'` but ensure no extra constraints downgrade it
- `src/contexts/VoiceContext.tsx` — high-quality screen audio, video transceiver fix, instant mute/deafen broadcast, screen encoder params, applyConstraints post-capture
- `src/contexts/GroupCallContext.tsx` — same screen audio quality + encoder fixes for group screenshare
- `src/contexts/ActivityContext.tsx` — throttle process polling during calls / when suppressing
- `src/contexts/GamingModeContext.tsx` — clarify `isSuppressingCalls` semantics, add a "reduce motion" body class
- `src/hooks/useMessages.ts` — paginate (last 50 + loadOlder)
- `src/components/app/ChatView.tsx` — GIF-aware reply pill, `loadOlder` scroll handler, `min-w-0` hardening, infinite-scroll-up
- `src/components/app/VoiceCallOverlay.tsx` — read mute/deafen from broadcast for instant indicator

### Version

Bump `package.json` to `0.2.5` so the auto-updater picks it up cleanly without manual reinstall.

### Rollout

After implementation: rebuild + republish via your existing command:
`git pull && npm install && npm run build:electron && BUILD_TARGET=electron npx electron-builder --win nsis --x64 --publish always`

Users on broken 0.2.4 will now auto-update to 0.2.5 (no manual reinstall needed this time).
