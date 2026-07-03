# v0.4.3 — Call reliability & performance hotfix

Three separate call bugs. Each fix is isolated so one regression can't take down the others.

## 1. Pickup stuck on "Ringing" until hang-up + Rejoin

**Symptom:** Callee accepts; caller stays on "Ringing…" indefinitely. Only after the caller hangs up and clicks "Rejoin" does audio flow.

**What we already have:** `sendAnswerWithRetry` (resend answer at +1.2s/+2.8s) and `heartbeatWithRetry` on the callee side. That covers the callee → server hop, but not the caller's own PC being stuck (e.g. the caller processed the *first* answer into a PC that was already discarded, or the answer arrived while the caller's signaling channel was mid-resubscribe).

**Fix (caller side only):**
- After we send an offer, poll `pc.iceConnectionState` at +2s / +4s / +7s. If still not `connected|completed` **AND** the callee's participant row shows a recent heartbeat (proof they think they're in the call), tear down the caller PC and run the existing "renegotiate — send fresh offer" path automatically, exactly once per callEvent. This is the same recovery the user does manually with hangup + Rejoin, just automated.
- Also: when the caller finally receives an `answer` broadcast but its own PC is `closed`/`failed`, log + auto-renegotiate instead of silently dropping it.
- Kill the "Queuing incoming ICE candidate (no remote desc yet)" flood we see in console (dozens per second before answer arrives): cap the queue at 50 and drop the oldest — unbounded growth is both a memory issue and a symptom that the remote desc never got set for that PC generation.

## 2. Game launch causes call lag that never recovers until full app restart

**Symptom:** Voice becomes choppy the moment a game starts, and stays choppy even after the game is minimized/closed. Restarting Cubbly fixes it.

**Root causes we're targeting:**
- The mic `AnalyserNode` + RAF audio-level meter keeps running at 60 Hz even when the app is hidden / the game has focus, competing with the game for CPU on the same thread as the WebRTC audio worker.
- `GamingModeContext` fires window focus/blur listeners that trigger realtime pings/reconnects; on a game alt-tab loop this can burst dozens of channel resubscribes, which permanently degrades the signaling channel throughput.

**Fix:**
- Throttle the audio-level RAF loop to ~10 Hz (100 ms interval) instead of RAF, and pause it entirely when `document.hidden` is true. Resume on visibilitychange. Same for the remote audio-level meter.
- In `GamingModeContext`, debounce the "wake" reconnect ping to at most once per 10 s and skip it entirely while gaming mode is active (game itself is a stable window — no need to keep poking realtime).
- On the outgoing voice PC, set `degradationPreference = "maintain-framerate"` is N/A for audio, but we should mark the audio sender with `networkPriority: "high"` / `priority: "high"` so Chromium prioritizes voice RTP over any screenshare traffic when CPU/bandwidth get tight.

## 3. Screenshare is unwatchably laggy even on the lowest quality setting

**Symptom:** Even after the user picks the lowest quality preset, the stream is a slideshow for the viewer.

**Root causes:**
- Electron's `desktopCapturer` ignores `getDisplayMedia` size constraints. We do call `applyConstraints` post-capture, but Chromium's screen-capture track frequently ignores that too — so a "480p" pick actually encodes 1440p/4K frames and the encoder collapses framerate to compensate.
- The "low quality" preset doesn't lower the sender's `scaleResolutionDownBy`, so the encoder keeps trying to send native resolution.
- Default FPS stays at 30 even for the lowest preset, which is what you want *only* if the encoder can actually keep up — it can't on a 4K desktop capture.

**Fix (in `applyScreenBitrate` + the surrounding startScreenShare block):**
- Read the *actual* captured track resolution via `getSettings()` after capture, and compute `scaleResolutionDownBy = capturedHeight / targetHeight` on the sender's encoding. This forces WebRTC to downscale on the encoder side, which is the only reliable path on Electron.
- Lower per-preset FPS defaults: 480p → 15 fps, 720p → 24 fps, 1080p+ keeps the user's chosen fps. Motion-optimized keeps the user's chosen fps regardless.
- Lower the per-preset bitrate ceilings so slow uplinks don't oversubscribe:
  480p 600 kbps, 720p 1.2 Mbps, 1080p 2.2 Mbps, 1440p 3 Mbps (hard cap unchanged at 4 Mbps).
- Keep `degradationPreference = "maintain-framerate"` so bandwidth drops cost resolution, not FPS.

## Version + changelog

- `package.json` → `0.4.3`
- `src/lib/changelog.ts` → new 0.4.3 entry with three short bullets:
  - Fixed calls sometimes stuck on "Ringing" after the other person picked up
  - Voice no longer stays laggy after launching a game mid-call
  - Screen sharing on the lowest quality is actually low-bandwidth now

## Files touched

- `src/contexts/VoiceContext.tsx` (all three fixes)
- `src/contexts/GamingModeContext.tsx` (wake-ping debounce)
- `src/lib/realtimeReconnect.ts` (if that's where the wake-ping lives — verified during build)
- `package.json`
- `src/lib/changelog.ts`

No DB / RLS / edge-function changes. No UI layout changes.
