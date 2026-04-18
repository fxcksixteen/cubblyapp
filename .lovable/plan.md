
Actual issue rephrased: the shipped Electron app still behaves like the fixes never landed at runtime. The three broken areas are:
1. remote camera tiles still don’t render for other users,
2. right-click/per-peer audio controls still don’t affect playback,
3. Electron window/tab share audio still isn’t reaching peers.

What I know from the code right now:
- Camera: there is still a UI-level bug in 1-on-1. `VoiceCallOverlay.tsx` only shows the remote camera tile when `peerState?.is_video_on && remoteVideoStream` is true. Even if the stream arrives, the tile stays hidden if signaling/DB state lags. That directly matches “I see myself, they don’t”.
- Volume controls: `src/lib/peerGain.ts` creates `AudioContext`s for per-peer gain, but never resumes them. That means the gain pipeline can exist while not actually driving audible playback, so sliders/mute appear wired but do nothing in practice.
- Window/tab audio: the Electron code path exists, but it still fails silently. Also, “tab” in Electron is not a real browser-tab capture — `ScreenSharePicker.tsx` maps it to browser windows only. So we need runtime validation in main/preload/renderer, not another blind patch.

Files most likely causing the real failures:
- `src/components/app/VoiceCallOverlay.tsx`
- `src/lib/peerGain.ts`
- `src/contexts/VoiceContext.tsx`
- `src/contexts/GroupCallContext.tsx`
- `src/components/app/ScreenSharePicker.tsx`
- `electron/main.cjs`
- `electron/preload.cjs`

Plan to fix this properly:
1. Camera rendering
- Remove the hard dependency on `peerState.is_video_on` for showing the remote 1-on-1 camera tile.
- Render the tile whenever `remoteVideoStream` exists; use signaling/DB only for badges/state, not visibility gating.
- Re-check the same pattern in group UI so no tile is hidden by stale boolean state.

2. Volume controls that actually work
- Update `src/lib/peerGain.ts` to explicitly `resume()` the `AudioContext` when creating/attaching a peer pipeline.
- Add a safe fallback: if the gain pipeline can’t run, do not leave the user with a muted source element and dead controls.
- Verify both mic audio and screen-share audio routes use the same peer gain path in 1-on-1 and group.

3. Window/tab audio that is debuggable instead of silent
- Add explicit logging/status in `electron/main.cjs` and renderer for:
  - selected source id,
  - whether native addon loaded,
  - resolved HWND/PID,
  - capture start success/failure,
  - whether PCM frames are actually received,
  - whether an audio track was added to the outgoing stream.
- Surface failures to the UI/toasts instead of silently falling back to video-only.
- Harden source-id parsing in main if Electron’s window source format differs from the current assumption.
- Fix the Electron picker copy/behavior: “tab” is currently just a browser window. Either make that explicit or temporarily remove the fake tab mode until it is real.

4. Re-verify both call paths
- Re-test 1-on-1 and group separately:
  - join call,
  - turn camera on after connection,
  - right-click peer avatar and change volume/mute,
  - share a window with audio,
  - share a browser window via current “tab” path,
  - fullscreen + PiP + slider for remote share audio.
- Check packaged Electron runtime logs, not just preview/web behavior.

5. Release discipline
- Only bump/release after the packaged app is verified end-to-end.
- No new workflow work unless runtime logs prove the native addon isn’t loading in packaged builds; the current blocker looks code/runtime-path related, not CI-only.

Technical notes
- `VoiceCallOverlay.tsx`: likely root cause of “camera only shows to self”.
- `peerGain.ts`: likely root cause of “volume controls exist but do nothing”.
- `ScreenSharePicker.tsx` + `electron/main.cjs`: current “tab” flow is misleading, and native capture failures are too silent to trust without instrumentation.
- The current console snapshot has no meaningful `[winaudio]` / peer-gain / remote-video diagnostics, which is why this has kept looping without a hard root-cause confirmation.

Implementation outcome I’m aiming for once approved:
- remote camera tiles appear whenever the actual media stream arrives,
- per-peer volume/local mute affects real playback in both 1-on-1 and group,
- Electron window audio either works with confirmed PCM flow or reports exactly why it failed,
- “tab” behavior is no longer pretending to be something it isn’t.
