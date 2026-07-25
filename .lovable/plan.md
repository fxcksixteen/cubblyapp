## v0.4.18 — Full "Discord-parity" game streaming (software path)

Native DXGI capture is deferred; this patch pushes every other lever to make game streams as clear and smooth as Discord using only the Chromium/WebRTC stack we already have.

Goal: at 1080p60 on a normal residential uplink, a fast-motion game (Valorant, Fortnite) should look sharp, hold framerate, and not spike your ping. Same for 1440p60 on a strong uplink.

---

### 1. Actually get the hardware H.264 encoder to run

Today `preferScreenShareCodec` puts H.264 first on desktop, but Chromium will silently fall back to software libx264 if any H.264 codec entry with an unsupported profile is listed first. Fix:

- Filter the H.264 codec list to entries whose `sdpFmtpLine` advertises **Baseline / Constrained Baseline** (`profile-level-id=42e01f` or `42001f`) with `packetization-mode=1`. These are the profiles NVENC / Intel QuickSync / AMD AMF / Media Foundation actually implement.
- Drop High-profile H.264 entries from the preference order — Chromium will otherwise pick them and route to libx264 in software.
- After `setLocalDescription`, read `pc.getStats()` and log `codecId` + `encoderImplementation`. If it comes back `"libvpx"` or `"OpenH264"` we know we're software; log a loud warning so we can diagnose without waiting for a user report.

### 2. Simulcast the screenshare

Right now we send one encoding. If any viewer degrades, the whole share drops with them. Add 3 simulcast layers on the screen video sender:

- `f` — full res, full bitrate ceiling (game-friendly numbers from v0.4.18 tick above)
- `h` — 1/2 res, ~40 % of full bitrate
- `q` — 1/4 res, ~15 % of full bitrate, half framerate

The automatic controller is updated to only tune the `f` layer; libwebrtc handles per-viewer layer selection.

### 3. Enable VP9 temporal scalability (SVC) on the browser/fallback path

When we do land on VP9 (browser or a machine without HW H.264), set `scalabilityMode: "L1T3"` on the base encoding. A dropped packet then only kills the enhancement layer, not the whole GOP — the exact reason Discord's VP9 fallback still looks smooth under packet loss.

### 4. Encoder low-latency knobs

- `degradationPreference = "maintain-framerate"` (already set — keep).
- Set `contentHint = "motion"` on the video track (already set — keep, and confirm it survives track replacement).
- Add `priority = "high"` and `networkPriority = "high"` on every layer (already set on encoding[0], extend to all simulcast layers).
- On the *sender's* PC, request an immediate keyframe on start (already there) and again on any renegotiation, so viewers never wait ~2 s for the first I-frame.

### 5. Receiver-side tuning

Already set: `playoutDelayHint = 0.05`, `jitterBufferTarget = 50` on screen receivers.
Add:
- Ensure the remote screen `<video>` element has no CSS `filter`, `backdrop-filter`, `transform` scale, or `border-radius` on the actual painting layer that forces the compositor into a slow path — audit `RemoteScreenViewer` / call UI and move rounded corners to a parent wrapper.
- Set `videoElement.playsInline = true`, `videoElement.disablePictureInPicture = false`, and confirm we're not gating playback behind `requestAnimationFrame` anywhere.

### 6. Electron GPU flags — verify, don't guess

`electron/main.cjs` already force-enables `MediaFoundationH264Encoding`, `MediaFoundationVP9Encoding`, `enable-gpu-rasterization`, `enable-accelerated-video-encode`. Two additions:

- `--disable-features=UseChromeOSDirectVideoDecoder` is not relevant on Windows — leave.
- Add `--enable-features=PlatformHEVCEncoderSupport,WebRTC-Vp9DependencyDescriptor` (the second lets the receiver do smarter SVC layer selection).
- On start, log `app.getGPUFeatureStatus()` so we can see in the console whether `video_encode` is `enabled` vs `software_only`.

### 7. Confirm v0.4.18's controller doesn't fight simulcast

The controller from the earlier turn tunes `encodings[0]`. With simulcast that IS the top layer, which is what we want — but I need to make sure it uses the `rid`-keyed lookup rather than index 0, so a Chromium reordering doesn't silently point us at the quarter-res layer.

---

### Technical section

**Files touched**

- `src/contexts/VoiceContext.tsx` — `preferScreenShareCodec` H.264 profile filter + encoder-implementation stats logger; simulcast encodings on the screen sender; VP9 `scalabilityMode: "L1T3"` when VP9 negotiated; keyframe on renegotiation.
- `src/contexts/GroupCallContext.tsx` — same simulcast + codec changes on the per-peer screen senders (each peer gets its own 3-layer sender).
- `src/lib/screenShareEncoding.ts` — target the `f` rid explicitly; per-layer priority/networkPriority; keep the v0.4.18 controller math.
- `electron/main.cjs` — add the `PlatformHEVCEncoderSupport,WebRTC-Vp9DependencyDescriptor` feature flags and a one-time `getGPUFeatureStatus` log.
- `src/components/call/RemoteScreenViewer.tsx` (or whichever component paints the remote screen video) — audit CSS on the `<video>` for compositor-slow properties, move them to a wrapper.
- `src/lib/changelog.ts`, `package.json` — v0.4.18 entry already exists; extend bullets to cover the parity work; version stays 0.4.18 (user hasn't shipped).

**Runtime verification (I run these before we call it done)**

1. Start a DM screenshare of a game window, open the receiver's console:
   - `pc.getStats()` shows `encoderImplementation: "ExternalEncoder"` (NVENC/MFT) — not `"libvpx"` or `"OpenH264"`.
   - `outbound-rtp` reports 3 SSRCs for the video (simulcast is actually up), and the `f` layer holds within 15 % of the target bitrate.
   - `remote-inbound-rtp` `roundTripTime` stays flat (no bufferbloat spike).
2. Same test in a 3-person group call.
3. On a machine with `cubbly-low-power` set, confirm we fall back to VP8 single-layer without stalling `createOffer`.

**What this will *not* fix**

- Anything caused by the Chromium desktop compositor path — some games (exclusive fullscreen DX12) will still capture at 30-40 fps regardless of what the encoder does. That's the case native DXGI capture is being kept in reserve for.
