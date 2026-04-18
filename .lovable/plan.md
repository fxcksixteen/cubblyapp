
I re-audited the current code, and the previous “fixes” are only partial. The UI gating fix is already present, so the remaining failures are deeper runtime bugs.

What’s actually still wrong
- 1-on-1 volume controls are still wired to the wrong runtime state: `VoiceContext` attaches peer gain using `activeCall?.peerId` inside callbacks that don’t track the latest call state, so the gain pipeline often never binds to the remote peer at all.
- 1-on-1 camera still has a real media-handling bug: the remote side assumes `event.streams[0]` exists for camera video, but the current transceiver + `replaceTrack()` path can deliver a track without a usable stream object. That means frames can arrive while `remoteVideoStream` stays empty.
- `peerGain.ts` still has a broken fallback: if the `AudioContext` stays suspended, audio can keep playing through the raw element, but the slider/mute only update the gain node, so controls still seem dead.
- Electron window/tab audio is still too opaque to debug in the shipped app: no DevTools shortcut, weak source/HWND parsing, no visible failure reporting, and the Electron “tab” option is still really just browser windows.

Implementation plan
1. Fix 1-on-1 peer binding
- Add a stable `peerIdRef` in `VoiceContext` and set it on call start/accept/end.
- Replace stale `activeCall?.peerId` reads in mic/screen audio attach paths with the ref.
- Ensure fullscreen screen-share audio controls also use that same stable peer identity.

2. Fix remote camera rendering at the media layer
- In 1-on-1 `pc.ontrack`, create/reuse a `MediaStream` from `event.track` when `event.streams[0]` is missing.
- Keep that stream in state until `ended`; refresh it on `unmute`.
- In `VoiceCallOverlay`, explicitly call `video.play()` after assigning `srcObject` for local and remote camera tiles.

3. Make per-peer volume controls always affect real playback
- Extend `peerGain.ts` to track attached media elements per peer/stream.
- If the gain graph is running, keep source elements muted and route through WebAudio.
- If the graph is suspended/unavailable, apply volume + mute directly to the fallback `<audio>/<video>` element so the right-click controls still work.
- Use the same logic for mic audio and screen-share audio in both 1-on-1 and group.

4. Harden Electron window/browser-window audio
- Add a packaged-app DevTools toggle in `electron/main.cjs` for `Ctrl/Cmd+Shift+I` and `F12`.
- Add explicit runtime diagnostics in main/preload/renderer for:
  - selected source id
  - parsed window handle
  - resolved PID
  - addon loaded yes/no
  - capture start success/failure
  - PCM frames received
  - outgoing audio track attached yes/no
- Surface failures to the UI instead of silent video-only fallback.
- Widen source-id/HWND parsing so Electron source format differences don’t silently fail.
- In Electron, stop pretending “tab” is real tab capture: either relabel it to browser window or hide it until true tab capture exists.

5. Verify only in packaged Electron, then release
- Re-test 1-on-1:
  - join call
  - toggle camera after connection
  - right-click peer and change volume/mute
  - share full screen with audio
  - share a window/browser window with audio
- Re-test group:
  - peer volume/mute
  - remote screen-share audio slider
  - PiP in fullscreen viewer
- Check packaged runtime diagnostics before any version bump.

Files to update
- `src/contexts/VoiceContext.tsx`
- `src/lib/peerGain.ts`
- `src/components/app/VoiceCallOverlay.tsx`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/lib/nativeWindowAudio.ts`
- `src/components/app/ScreenSharePicker.tsx`

Release rule
- No workflow changes unless the new packaged logs prove the native addon still isn’t loading.
- No version bump until the packaged desktop build passes the exact camera + volume + screen-audio checks above.
