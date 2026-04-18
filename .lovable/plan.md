

## Audit results

### ✅ v0.2.9 audio/video fixes — all intact
- 1-on-1: `VoiceContext` imports `startNativeWindowAudioStream`, gates Chromium loopback only for screen picks, allows tab audio in browser.
- Group: `GroupCallContext` mirrors the same logic; `nativeWindowAudioStopRef` cleanup fires on share-stop and `leaveCall`.
- Camera `unmute` listener in place for group calls.

### ❌ Right-click user volume menu — only HALF wired
The menu UI works AND `VoiceContext` exposes `getUserVolume / setUserVolume / isUserMuted / setUserMuted` correctly. The `applyPeerGain` GainNode logic is correct. But the wiring breaks here:

- `attachPeerGain` is **only called from one place** (1-on-1 `ontrack`, line 680) and **only for the peer's MIC audio**.
- The peer's **screen-share audio** track arrives on a separate `<audio data-screen-peer>` element that is NEVER routed through a peer-keyed GainNode → so the volume slider does nothing for screen-share audio.
- `GroupCallContext` has **zero references** to `attachPeerGain / userVolumes / userMutes` → in any group call, the volume slider and "Mute (you only)" do nothing for ANYONE.

### ❌ FullscreenScreenShareViewer — PiP + volume broken
- `srcObject = stream` and `volume`/`muted` are set on the `<video>` element, BUT in 1-on-1 calls the inbound screen-share audio is on a SEPARATE `<audio>` element managed by `VoiceContext` (the video element only carries the video track). So changing `v.volume` mutes nothing — the audio keeps playing from the hidden `<audio>` tag.
- **PiP fails silently** because `disablePictureInPicture` attribute is set on the `<video>` (line ~131). You cannot `requestPictureInPicture()` on an element with that attribute. The handler catches the error and does nothing.

---

## Plan: ship v0.2.10 with proper functionality

### 1. Make `attachPeerGain` work for screen-share audio too
In `VoiceContext.tsx` `ontrack` handler:
- When receiving an `audio` track tagged as screen-share (the existing branch that creates `<audio data-screen-peer>`), also call `attachPeerGain(peerUserId, screenStream, screenAudioEl)` so the same GainNode controls both mic AND screen audio for that peer. Result: one slider per peer controls everything you hear from them.

### 2. Wire the menu into `GroupCallContext`
Port the per-peer pipeline into `GroupCallContext.tsx`:
- Add `userVolumesRef`, `userMutesRef`, `peerGainsRef`, `peerAudioCtxRef` (reuse the same localStorage keys so settings carry over from 1-on-1 to group).
- Add `getUserVolume / setUserVolume / isUserMuted / setUserMuted / applyPeerGain / attachPeerGain` (factor into `src/lib/peerGain.ts` so both contexts share one implementation — no drift).
- In every `ontrack` handler for both `audio` (mic) AND screen-share audio, call `attachPeerGain(peerUserId, stream, audioEl)`.
- Expose the four functions on the `GroupCallContext` value object.

### 3. Make `UserVolumeMenu` source-of-truth context-aware
The menu currently always reads from `useVoice()`. In `GroupCallPanel` it must read from `useGroupCall()` instead. Cleanest fix: add a `volumeApi` prop so the parent passes whichever context is active:
```ts
volumeApi: { getUserVolume; setUserVolume; isUserMuted; setUserMuted }
```
Update both `VoiceCallOverlay` and `GroupCallPanel` to pass the correct one.

### 4. Fix `FullscreenScreenShareViewer`
- Remove `disablePictureInPicture` and `noremoteplayback` from the video so `requestPictureInPicture()` actually resolves. (We keep `nodownload nofullscreen noplaybackrate` and `controls={false}` — viewer still can't pause/scrub/download via native UI.)
- Volume/mute slider must drive the **separate per-peer GainNode** for screen audio — not `<video>.volume`. New prop `audioPeerId?: string`; when present, the slider calls `setUserVolume(audioPeerId, …)` / `setUserMuted(...)` from the active context. The `<video>` stays muted (audio plays via the GainNode pipeline already attached in step 1/2). For local previews (`isLocal`) we keep the slider hidden as today.
- Pass `audioPeerId` from `VoiceCallOverlay` (peer's userId) and `GroupCallPanel` (the sharer's userId).

### 5. Ship
- Bump `package.json` → `0.2.10`.
- Add changelog entry: "Per-user volume + local mute now actually work in 1-on-1 and group calls (mic AND screen audio). Fullscreen screen-share viewer's volume slider + Picture-in-Picture button now functional."
- Build cmd unchanged: `git pull && set BUILD_TARGET=electron && npm run build:electron && npx electron-builder --win nsis --x64 --publish always`.

### Files to edit
- `src/lib/peerGain.ts` — new shared per-peer GainNode helper
- `src/contexts/VoiceContext.tsx` — use shared helper; also `attachPeerGain` for screen-audio el
- `src/contexts/GroupCallContext.tsx` — adopt helper; expose volume API; attach for mic + screen audio
- `src/components/app/UserVolumeMenu.tsx` — accept `volumeApi` prop instead of hard-coding `useVoice`
- `src/components/app/VoiceCallOverlay.tsx` — pass volumeApi + audioPeerId
- `src/components/app/GroupCallPanel.tsx` — pass volumeApi + audioPeerId
- `src/components/app/FullscreenScreenShareViewer.tsx` — remove `disablePictureInPicture`; route volume/mute through `audioPeerId` + volumeApi
- `package.json` + `src/lib/changelog.ts` — v0.2.10

