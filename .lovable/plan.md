# v0.4.23 game screenshare hotfix

## Goal
Make game sharing protect call responsiveness while preserving watchable motion quality, and make stream audio recover automatically after a network or renderer stall instead of remaining delayed.

## Confirmed problems
- DM microphone audio and screenshare use separate peer connections. The current voice-priority helper runs only on the screenshare connection, so it cannot protect the microphone connection when the upload queue is saturated.
- Screen video is initially allowed to transmit at the full preset ceiling for an 8-second warm-up. The controller also keeps a 60% bitrate floor and reacts only after sustained loss/bandwidth pressure, allowing substantial queue buildup and call-ping spikes before backing off.
- The video sender and stream-audio sender are both assigned high network priority. This weakens the intended preference for live conversation audio.
- Native window audio schedules every PCM chunk by continually advancing `nextStartTime`. If delivery stalls and queued chunks arrive late, they are all still scheduled; there is no maximum buffered lead, timestamp discontinuity handling, or stale-chunk drop, so stream audio can remain seconds behind permanently.
- Group/server calls send a separate encoded screenshare to every mesh peer. The current per-sender bitrate target does not account for peer count, so total upload can multiply as participants increase.

## Implementation

### 1. Add a call-aware upload controller
- Replace the current screenshare-only bitrate loop with a shared controller that can inspect both the screen connection and the active voice connection.
- Track transport `availableOutgoingBitrate`, screen send bitrate, packet loss, call RTT, screen RTT, and encoder limitation state using deltas rather than absolute counters.
- Start from a conservative sustainable rate, probe upward only while call RTT and loss remain healthy, and immediately back off when call RTT rises above its pre-share baseline.
- Reserve explicit upload headroom for microphone audio and control traffic instead of driving the link to its estimated maximum.
- Remove the high 60% bitrate floor; preserve motion by reducing resolution before frame rate, with bounded quality tiers so recovery does not oscillate.
- Add hysteresis: fast backoff, slower recovery, a hold period after congestion, and no unconditional full-bitrate warm-up.

### 2. Apply correct packet priority
- Keep microphone audio at high priority on the voice connection.
- Set screenshare audio to medium priority and screen video to low priority; do not allow the generic bitrate helper to restore video to high priority.
- Reapply priorities whenever tracks are added or renegotiated in DM, group, and server calls.
- For DM calls, pass the primary call peer connection into the screenshare controller so call RTT—not only screen RTT—drives protection.

### 3. Budget mesh upload in group/server calls
- Divide the available screenshare upload budget across active peer senders rather than giving every peer the full preset ceiling.
- Recalculate sender budgets when participants join or leave while preserving multiple simultaneous sharers.
- Keep each sender independently adaptive, but enforce a shared aggregate ceiling so adding viewers cannot multiply upload beyond the connection budget.

### 4. Make native stream audio self-resynchronizing
- Add bounded PCM buffering in the renderer: maintain only a short target lead and drop stale queued audio after stalls.
- Detect when scheduled audio is too far ahead of the audio clock, cancel/reset queued buffer sources, and resume from the newest PCM chunk with a short fade to avoid a pop.
- Add main-to-renderer audio backpressure and sequence/timestamp metadata so stale IPC audio frames are discarded before they build a permanent queue.
- Preserve the existing stereo 48 kHz, DSP-free game-audio path and keep microphone audio completely separate.
- Mirror cleanup and recovery behavior across DM, group, and server shares.

### 5. Improve diagnostics and verification
- Add development diagnostics for call RTT baseline/current RTT, estimated available upload, actual screen bitrate, selected quality tier, congestion reason, audio buffered lead, dropped stale PCM chunks, and resync count.
- Add unit tests for fast congestion backoff, gradual recovery, call-RTT protection, aggregate group budgets, bounded audio buffering, and audio resync after a simulated stall.
- Exercise DM, group, and server paths with screen audio on/off, multiple viewers, and multiple simultaneous sharers.
- Verify the desktop production package includes the updated preload/main-process wiring and native modules.

### 6. Prepare the patch
- Bump the desktop version to `0.4.23` only after the fixes are implemented.
- Add short, user-facing changelog bullets covering stable game-share performance, protected call ping, and stream-audio recovery.
- Run the relevant tests and production validation without publishing the web app.

## Expected behavior
- Starting a game share no longer causes sustained call-ping spikes; quality adapts before the upload queue becomes bloated.
- Motion stays smooth by stepping resolution/bitrate within safe bounds rather than repeatedly collapsing and recovering.
- If the machine or network stalls, stream audio drops stale buffered content and returns near live playback automatically.
- Group/server upload remains bounded as viewers join, while concurrent screenshares continue to function.