## v0.4.11 — Screenshare lag/choppy hotfix

Screenshare is stuck in a "software encoder overrun + wrong degradation policy + hostile codec pick" combo. Every preset, every source type (screen/window/tab), every content type (game or plain browser) is choppy and delayed. Root causes below, all in the shared helpers in `src/contexts/VoiceContext.tsx` — DM, group and server calls all go through them, so one fix covers everything.

### What's actually wrong

1. **Codec preference puts AV1 first.** AV1 software encode is extremely CPU-heavy, and even when the local encoder is hardware, most peers can only decode AV1 in software → the *viewer* stutters. With hardware acceleration disabled (user's current setting) it's catastrophic on both ends. Discord defaults to VP9 for a reason.
2. **`degradationPreference` is wrong for screenshare.** Ultra uses `balanced` and Clarity uses `maintain-resolution`, so under any encoder or network pressure the pipeline drops *frames* instead of resolution → the exact "laggy, delayed, choppy" symptom, at every resolution, on every content type. Screenshare should be `maintain-framerate` by default (what Discord ships).
3. **Ultra bitrate ladder is unrealistic.** 10–16 Mbps @1080p/1440p60 exceeds typical home upload and swamps the software encoder → queuing delay + dropped frames. The +30%-over-Discord ladder is what's making Ultra feel *worse* than lower presets.
4. **VP9 `L1T3` temporal scalability on Ultra** adds another ~20–30% encoder cost with software encoding — piling onto (3).
5. **No low-power clamp.** When `cubbly-low-power` is active (HW accel off), we still let the user negotiate 1080p60 at multi-Mbps VP9/AV1 → software encoder can't keep up, output is a slideshow.
6. **Adaptive loop reacts too slowly** (2 lossy samples × 3s = 6s before first cut, 8% loss threshold). By the time it reacts the viewer has already been choppy for 6+ seconds.

### Fix

All in `src/contexts/VoiceContext.tsx` (shared by DM/group/server via imports):

- **`preferScreenShareCodec`**: reorder to **VP9 → VP8 → H.264 → AV1 (last)**. VP9 is Discord's proven default; AV1 stays available only if no other codec matches.
- **`applyScreenBitrate`**: set `degradationPreference = "maintain-framerate"` for **all** presets. Motion behaviour is unchanged; Ultra/Clarity now stop dropping frames first.
- **Remove `scalabilityMode: "L1T3"`** from the Ultra branch (was adding encoder cost with no viewer-side gain when peer decodes in software).
- **Rebalance the Ultra ladder** back to Discord-parity (drop the +30%): `720p30 2.5M / 720p60 3M / 1080p30 4.5M / 1080p60 6M / 1440p30 6M / 1440p60 8M`. Non-Ultra ladder unchanged.
- **Low-power clamp** in the screenshare start path: if `document.documentElement.classList.contains("cubbly-low-power")` **or** `electronAPI.getHardwareAcceleration?.()` returns false, hard-cap negotiated resolution to 1080p, fps to 30, and bitrate to `min(chosen, 2_500_000)` — and log why. Applies to both DM (`VoiceContext.startScreenShare`) and group/server (`GroupCallContext.toggleScreenShare`, which computes the same `maxBitrate`/`encodingOpts` locals).
- **Adaptive loop**: react at `fractionLost > 0.05` after **1** lossy sample (was 0.08 after 2), and shrink the stats interval from 3s to 2s so the first cut lands within ~2s instead of ~6s. Recovery unchanged.

### Not doing

- No changes to audio path (mic constraints, Opus SDP patch, per-window WASAPI capture) — user reported no audio-quality regression this turn.
- No changes to signaling / rejoin / ringing paths.
- No version bump / publish / web deploy in the same step — I'll bump `package.json` + `CURRENT_VERSION` + add the changelog line after the code is in and typecheck is clean, matching the flow you use for every desktop patch.

### Files touched

- `src/contexts/VoiceContext.tsx` — codec order, degradation, ladder, L1T3 removal, low-power clamp, adaptive thresholds.
- `src/contexts/GroupCallContext.tsx` — mirror the low-power clamp on the local `maxBitrate`/`encodingOpts` computation (helpers themselves are shared).
- `src/lib/changelog.ts` — one short v0.4.11 entry.
- `package.json` — version bump to 0.4.11.
