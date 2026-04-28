
# v0.2.26 — Web/Desktop Voice + Call Lifecycle Hardening

## 1. Bump version
`src/lib/changelog.ts` → add `0.2.26` entry. Update any `APP_VERSION` constant referenced by the Settings → About row. Confirm Electron `package.json` version is bumped if it's read in-app.

## 2. Live Mic Test reflection (web/desktop)
File: `src/components/app/settings/VoiceVideoSettings.tsx` — `VoiceTab.toggleMicTest` / effects.

Today the mic-test stream is acquired ONCE; only `echoCancellation` / `noiseSuppression` / `autoGainControl` are re-applied via `applyConstraints` while testing. We will extend this so EVERY relevant control updates live without stopping/restarting the test:

- **Input device change** → if `settings.inputDeviceId` changes mid-test, gracefully tear down the old `MediaStream` (audio track only) and `getUserMedia` a new one with the same constraint surface, then reconnect it to the existing `AudioContext` source/analyser and to the playback `<audio>` element. No flicker — keep the audio element and AudioContext alive.
- **Output device change** → call `audioEl.setSinkId(settings.outputDeviceId)` in a `useEffect` that watches `settings.outputDeviceId`.
- **Input volume slider** → insert a `GainNode` between the `MediaStreamSource` and the analyser/playback path; set `gainNode.gain.value = settings.inputVolume / 100`. Update in an effect that watches `inputVolume`. The level meter then reflects the gained signal exactly like a real call.
- **Sensitivity threshold** (`autoSensitivity` off + `sensitivityThreshold`) → draw a vertical marker on the level bar at the threshold % AND visually grey-out level segments below it so the user can see in real time whether their voice is "passing the gate". Update on every slider tick.
- **Echo cancel / noise suppression / AGC** → already live; keep.

Audio playback keeps using the existing hidden `<audio>` element so users hear themselves; gating the playback through the `GainNode` means they hear the sensitivity/volume changes immediately.

## 3. Call lifecycle: never auto-disconnect connected calls
File: `src/contexts/VoiceContext.tsx`.

### 3a. 30s ring timeout — stop ringing only, don't end the call
Current behavior (lines ~2293–2305): after 30s of `calling`/`ringing`, we call `endCallRef.current()` which tears down everything and broadcasts `hangup`. This is wrong.

New behavior:
- After 30s of unanswered `calling` state on the **caller** side: stop `outgoingRing` sound, transition `activeCall.state` to a new `"connected-waiting"` (or simply leave it as `calling` but mute the ringtone and surface "Waiting for them to join…"). Do NOT call `endCall`. Do NOT broadcast `hangup`. The call_event row stays `ongoing` so the call pill remains joinable for the callee.
- After 30s on the **callee** (incoming `ringing`) side: stop `incomingCall` ringtone (already partly done at line 2309) AND auto-dismiss the full-screen incoming overlay, but keep the call pill visible in the chat thread so they can still tap "Join". Do NOT decline / end.
- The original caller can still hang up manually — that path goes through `endCall` and properly tears down.

### 3b. One-sided hang-up should NOT kill the call for the other party
Current behavior: `endCall` broadcasts `{type: "hangup"}` whenever the local user ends, and the remote handler at line 1092 calls `endCallRef.current()` — instantly killing the call for the peer.

New behavior: when a user hangs up:
- Mark only their own `call_participants` row as `left_at` (already done).
- Do NOT mark the `call_event` as `ended`. Only mark `call_event.ended = true` when the LAST remaining participant leaves (i.e., the count of participants with `left_at IS NULL` after our own update is zero). Do this in a small follow-up query inside `endCall`.
- Broadcast a new `peer-leave` signaling message instead of `hangup`. The remote handler:
  - Closes its `RTCPeerConnection` to the leaver, stops their inbound media, drops their entry from peer state.
  - Keeps `activeCall` alive locally, transitions its UI to "alone in call" (mic still hot, call pill in chat still shows ongoing). The user is still in the call and can be re-joined by anyone in the conversation.
- Reserve `hangup` for the legacy/explicit "end the entire room" path (which we no longer use in 1:1 calls).

### 3c. "Join" pill visibility — only show when there is a real ongoing call with ≥1 active participant
Files: `src/components/app/ChatView.tsx` and any call-pill component (`GlobalCallIndicator`, mobile chat header).

A call pill should render only when:
1. There is a `call_events` row with `state = "ongoing"` for the conversation, AND
2. There is at least one `call_participants` row with `left_at IS NULL` for that event.

Add a small `useOngoingCall(conversationId)` hook (or extend `useCallParticipants`) that joins these two and returns `{ event, activeParticipants }`. Pill renders only when `activeParticipants.length > 0`. If the count drops to zero (last person leaves), the pill auto-hides AND the same code marks the event as `ended` so it doesn't linger.

### 3d. Stop spurious auto-cleanup paths
Audit and remove any remaining wall-clock auto-end timers on `connected` calls (line ~2290 already removed the 5-min one — confirm no other `setTimeout` ends a connected call). Audit `pagehide`/`beforeunload` (line 2345) — already correct (only marks our row left). Confirm `peer-mute` / `screen-stop` / disconnect handlers never call `endCallRef.current` for a `connected` call.

## 4. iOS PWA mute belt-and-suspenders
The iOS native `CallStore.toggleMute` already disables the local audio track. The likely real-world bug is that the iOS PWA (running in mobile Safari, NOT the native app) uses `src/contexts/VoiceContext.tsx` and on some iOS Safari versions `track.enabled = false` keeps emitting comfort-noise frames at audible level due to the voiceChat audio unit.

Fix in `VoiceContext.tsx → toggleMute`:
- Disable `localStream` audio tracks (already done).
- Additionally, on the local `RTCRtpSender` for the audio track, call `sender.replaceTrack(null)` when muting and `sender.replaceTrack(originalTrack)` when un-muting. This guarantees zero RTP audio packets are sent. Keep the original track ref so we can restore it.
- Continue broadcasting `peer-mute` over the signaling channel (already done) so the remote UI still updates instantly.

Also add a defensive remote-side gate: on receiving `peer-mute` with `isMuted: true`, set the per-peer GainNode for that user's MIC stream to 0 (and back to the user-set value when `isMuted: false`). This guarantees the listener hears silence even if the muter's client misbehaves. Use the existing `usePeerGains` infrastructure — add an internal "forcedMute" multiplier that combines with the user-set volume.

Same defensive gate for `peer-deafen`: no remote-side action needed (deafen is local), but keep the icon UI in sync.

## 5. Edge case sweep
- Confirm `acceptCall` from a stale incoming overlay (after the 30s ring timeout already fired) still works: the call_event is still `ongoing`, so accepting just creates/updates our `call_participants` row and renegotiates SDP with the existing-in-call peer.
- Confirm rapid mute/unmute doesn't leak old tracks (because of `replaceTrack`).
- Confirm the new `peer-leave` event is ignored gracefully by older clients that only know `hangup` (they'll just keep the connection open until ICE failure, which is the desired outcome — they don't auto-disconnect).

## 6. Files touched
- `src/contexts/VoiceContext.tsx` (largest change: lifecycle, mute hardening, peer-leave)
- `src/components/app/settings/VoiceVideoSettings.tsx` (live mic test)
- `src/lib/peerGain.ts` (forcedMute multiplier)
- `src/components/app/ChatView.tsx` + call-pill components (visibility rule)
- `src/lib/changelog.ts` (v0.2.26 notes)
- Possibly a new `src/hooks/useOngoingCall.ts`

## 7. Out of scope (this round)
- iOS native app changes (already shipped in v0.1.3).
- Reactions, GIFs, or anything outside voice/calls.

After approval I'll implement the above and bump the build to v0.2.26.
