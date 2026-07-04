# v0.4.5 hotfix — Unified screenshare across DM, group, and server calls

## Problem

Server voice channel screenshare (and by extension group DM screenshare) uses a **separate, simplified** screenshare pipeline from 1‑on‑1 DM calls. Concretely, users see:

1. Picking a single window shares audio from other windows too ("I could hear myself").
2. Starting a screenshare in a server call auto-mutes the sharer, forcing them to leave and rejoin.
3. Video quality/bitrate/codec are worse than DM shares because the group path skips the DM path's VP9/AV1 codec preference, adaptive bitrate loop, Opus SDP patching, `screenShareSettings` (resolution/fps/audio/optimization preset), and audio-track cleanup.

Root cause: `GroupCallContext.toggleScreenShare` is a hand-rolled reimplementation of `VoiceContext.startScreenShare` / `stopScreenShare` that diverged over time. It hardcodes `wantAudio = true`, ignores the user's `screenShareSettings`, skips `selfBrowserSurface: "exclude"` / audio-track stripping on the browser path, and lacks the codec + adaptive-bitrate wiring the DM path added in v0.4.3/v0.4.4.

## Fix

Rewrite `GroupCallContext.toggleScreenShare` so its capture, audio-selection, encoding, codec, and stop-flow logic are **line-for-line the same** as `VoiceContext.startScreenShare` / `stopScreenShare`, only differing where multi-peer group topology genuinely requires it (adding the resulting track to every peer `RTCPeerConnection` instead of one, and broadcasting `peer-screen` on the group channel).

### Capture path (must match DM exactly)

- Read `screenShareSettings` (resolution, frameRate, audioShare, optimizeFor) instead of hardcoding.
- Accept `type?: "screen" | "window" | "tab"` + `options: { audio, fps, quality, sourceId }` — same signature as DM.
- Electron: same per-source audio strategy (Chromium loopback only for `screen:*`, native WASAPI window-audio addon for `window:*`, video-only fallback otherwise).
- Browser: same `getDisplayMedia` call with `displaySurface`, `surfaceSwitching: "include"`, `selfBrowserSurface: "exclude"`, and the same "strip audio tracks when `allowAudio` is false" cleanup.
- Same `screenAudioConstraints` (no echo/noise/AGC, stereo 48 kHz).

### Encoding path (must match DM exactly)

- Same `contentHint` selection (ultra=none, motion=motion, clarity=detail).
- Same Ultra vs Discord-parity bitrate ladder (up to 16 Mbps at 1440p, 10 Mbps at 1080p60 for Ultra).
- Same `applyScreenBitrate` + `applyScreenAudioBitrate` per sender.
- Same `preferScreenShareCodec` (VP9 / AV1 preference) on the video transceiver.
- Same `patchScreenShareOpusSdp` on generated offers.
- Same 3-second adaptive-bitrate loop watching outbound-rtp / remote-inbound-rtp.

### Group-specific differences (kept)

- Instead of one `screenPcOut`, iterate `pcsRef.current` and `addTrack` on every peer's PC — reuse the existing `screenSendersRef` map for later teardown.
- Continue broadcasting `{ type: "peer-screen", isScreenSharing: true/false }` on the `group-signal` channel.
- Continue using `localScreenTrackRef` + `localScreenStream` state.

### Auto-mute regression

The reported auto-mute-on-share is caused by the current group path re-negotiating with a fresh set of transceivers that don't preserve the mic sender's `enabled` state through the renegotiation offer. Fix by:

- Adding screenshare tracks to each PC **before** creating the offer inside `onnegotiationneeded` (the DM path already does this via the dedicated `screenPcOut`, so unifying resolves it).
- Explicitly re-asserting `micTrackRef.current.enabled = !activeCall.isMuted` after the screenshare tracks are attached and after the local description is set, so the user's mute state survives renegotiation.

### Stop-share path

Mirror `VoiceContext.stopScreenShare` — stop tracks, tear down native window-audio, `replaceTrack(null)` + `removeTrack` on every peer's screen sender, clear refs, broadcast `peer-screen: false`, play stop sound, and (new) re-assert mic `enabled` state.

## Files touched

- `src/contexts/GroupCallContext.tsx` — rewrite `toggleScreenShare` and its stop branch; import the same helpers `VoiceContext` uses (`applyScreenBitrate`, `applyScreenAudioBitrate`, `preferScreenShareCodec`, `patchScreenShareOpusSdp`, `startNativeWindowAudioStream`); pull `screenShareSettings` via the existing settings hook.
- `src/components/app/ServerVoicePanel.tsx` & `src/components/app/GroupCallPanel.tsx` — pass `type` from the `ScreenSharePicker` selection through to `toggleScreenShare(type, { sourceId, audio, fps, quality })` so the unified signature is honored (currently they only pass `sourceId`, `fps`, `quality`).
- `src/lib/changelog.ts` — one-line v0.4.5 bullet: "Group and server call screen sharing now uses the same high-quality pipeline as 1-on-1 calls (fixes wrong-window audio and auto-mute on share)."

## Out of scope

No version bump beyond the already-set 0.4.5. No changes to DM screenshare. No changes to 1‑on‑1 call logic.
