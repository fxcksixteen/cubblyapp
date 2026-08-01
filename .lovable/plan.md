# v0.4.24 — Screenshare hang, ghost window list, ghost call state

Three separate problems from the same session: sharing a Valorant window hard-locked the whole app, the window picker lists things that aren't real windows, and after force-quitting mid-call the rejoin shows the other person as "not in call".

## 1. Sharing a protected game window freezes the app

What happens today: native window capture starts on the main process and pushes every captured frame straight into a callback that copies a full-size BGRA buffer and sends it over IPC. There is a frame-rate pacer and a 2-frame backpressure cap, but no protection for the two cases Valorant hits: the capture start call itself blocking, and giant full-resolution frames arriving faster than they can be serialized. When that stalls the main process, the whole window stops responding and Windows offers to force-close it.

Fix:
- Wrap capture start in a watchdog. If native capture doesn't produce its first frame within a few seconds, stop it, log the reason, and fall back to the normal Electron screen-capture path so the share still starts.
- Downscale in native capture before the frame ever crosses to JavaScript, so a 1440p/4K game window never ships a full-size buffer per frame.
- Tighten backpressure: drop to a single in-flight frame and add a hard byte budget, so a stall drops frames instead of queueing them.
- Treat any native capture error or protected-content result as a soft failure that switches to the fallback path instead of leaving the call in a half-started share state.
- Guarantee cleanup: if the renderer goes away or the share ends abnormally, stop native capture and release the handle.

## 2. Window picker shows apps that have no visible window

Razer overlays, tray helpers and similar background processes appear as pickable windows.

Fix: filter the source list before it reaches the picker — drop zero-size and cloaked/hidden windows, drop sources with an empty thumbnail, and drop known invisible-overlay/host window classes. Keep all real, visible windows and all screens.

## 3. Force-quit mid-call leaves a ghost, and rejoin shows the other user as "not in call"

Leaving is only recorded on a clean exit. A killed app never marks itself as left, so the old participant row stays open; on rejoin the call state is reconciled against stale rows and the other participant is rendered as not present even though she is connected.

Fix:
- Treat participant rows as live only when their heartbeat is recent, and expire anything older on read, so a killed session stops counting.
- On join, clear the user's own stale rows for that conversation before acquiring the session, so rejoin lands in the same live call rather than a revived ghost.
- Re-run the participant reconcile right after a successful join (not only on the periodic timer) so the other person appears immediately instead of after the next sweep.
- Make presence-based "in call" state agree with the database view so one stale source can't override the other.

## Technical notes

- `electron/main.cjs`: watchdog + fallback around `start-window-capture`, stricter `pendingFrameIds` budget, filtering in `get-desktop-sources`.
- `native/win-dxgi-capture`: downscale before emitting frames; report protected-content failures as errors rather than stalling.
- `src/lib/nativeWindowVideo.ts`: handle soft failure by falling back to `getDisplayMedia`.
- `src/contexts/VoiceContext.tsx` / `src/contexts/GroupCallContext.tsx` / `src/hooks/useCallParticipants.ts`: heartbeat-based liveness filter, self-ghost cleanup before `acquire_call_session`, immediate post-join reconcile.
- Version bump to 0.4.24 and short user-facing changelog entries.
