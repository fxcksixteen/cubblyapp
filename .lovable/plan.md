## What we're fixing

Symptom (kaszy ↔ geassbound): tap the green pickup button → the call UI opens → but the caller still shows "Not in call" for the callee and no audio flows either direction. The call is technically "accepted" but the WebRTC handshake or the participant-liveness signal never actually completes.

I won't rewrite the call system — that path went through 6 rounds of fixes already and the loopback works. This is targeted hardening + a self-test.

## Root causes still in the accept path

Reading `src/contexts/VoiceContext.tsx` I found three remaining race windows that all produce exactly the "UI opens but stuck on Not in call" symptom:

1. **Fast path teardown race.** When Accept fires with a prefetched offer, we close `pcRef.current` and immediately build a new PC. If a *retry* offer from the caller arrives during the ~200 ms window between close and `setRemoteDescription`, the standard offer handler runs on a `null` pc, falls into the "no pc + no activeCall match" branch, and re-sets `incomingCall` — orphaning the fresh PC we just built.
2. **Answer never reaches the caller.** `sendSignalReliably` fires the answer, but if the caller's supabase realtime channel is mid-resubscribe (post tab-wake, laptop lid) the broadcast is dropped and there's no retry on the answer itself — only on `ready-for-offer` and `offer`. Callee thinks they're connected, caller stays in "ringing" forever, and the callee's row never gets flipped to live from the caller's side.
3. **Heartbeat lost.** The two `heartbeat_call_participant` RPCs fired after accept are wrapped in `try/catch` that swallows failures silently. If the very first heartbeat fails (network hiccup) the caller's participant reconciliation never sees a `last_seen_at` newer than the cutoff and keeps rendering "Not in call".

## Fix plan

### 1. `src/contexts/VoiceContext.tsx` — fast path teardown guard
- Introduce `acceptInFlightRef` set before we close the stale PC and cleared after we've sent the answer.
- In the `offer` handler, if `acceptInFlightRef.current === callEventId`, buffer the offer into `acceptedIncomingCallRef.pendingRetryOffer` instead of re-setting `incomingCall`. After Accept finishes, if a retry landed, we answer it against the fresh PC.

### 2. `src/contexts/VoiceContext.tsx` — retry the answer
- Wrap answer send in a new `sendAnswerReliably(channel, payload)` helper that resends up to 3 times (400 ms / 1200 ms / 2500 ms) unless we observe `pc.iceConnectionState === "connected"` OR receive a fresh ICE candidate from the peer for this callEventId (proof they got our answer).
- Applies in all three answer paths: fast-accept, accepted-offer, rejoin.

### 3. `src/contexts/VoiceContext.tsx` — heartbeat retry + failure surface
- Replace the fire-and-forget heartbeat calls with `heartbeatWithRetry(callEventId)` that:
  - runs `heartbeat_call_participant` immediately,
  - retries at 500 ms and 1500 ms if the previous call rejects,
  - logs `[acceptDiag] heartbeat failed` so it shows up in Call Diagnostics.
- Also emit an extra heartbeat *right after* `iceConnectionState` first becomes `connected`, so the caller's reconciliation flips us the moment audio actually starts.

### 4. Caller-side stale-PC safety net
- In `initializeOutgoingConnection`, when we detect an existing PC in `iceConnectionState === "disconnected" | "failed"`, force a full close + fresh offer (already partially there; tighten so it also runs when `connectionState === "new"` but `signalingState === "have-local-offer"` for > 8 s — the "PC exists but never gathered" limbo).

### 5. Diagnostics telemetry
- Extend the existing `[acceptDiag]` log tag with structured entries: `accept.start`, `accept.fastpath.answered`, `accept.slowpath.readySent`, `accept.answerAcked`, `accept.heartbeatOk`, `accept.iceConnected`, plus their failure counterparts. `CallDiagnosticsModal` already renders the console log tail — no UI change needed to see them.

### 6. `src/components/app/CallDiagnosticsModal.tsx` — "Test pickup" self-test
- New button **"Test pickup with CubblyBot"** that:
  1. If not already in a call, calls `startCall(CUBBLY_BOT_CONVERSATION_ID)`.
  2. Waits ~1 s for the local loopback echo path to prime.
  3. Programmatically fires `acceptCall()` (loopback pretends CubblyBot answered).
  4. Watches `[acceptDiag]` markers for 6 s, then reports PASS/FAIL with the specific stage that failed (`fastpath.answered` missing → SDP; `answerAcked` missing → broadcast; `heartbeatOk` missing → DB; `iceConnected` missing → NAT/TURN).
- Result is shown in the modal AND copyable so we can paste it in chat if it fails on a real device.

### 7. Changelog + version bump
- No version bump (per the "never bump unless asked" rule) — v0.4.0 stays intact.
- Add a bullet under the existing v0.4.0 changelog entry: `Voice: hardened accept-call handshake (answer retry, heartbeat retry, teardown guard) so pickup no longer leaves the peer stuck on "Not in call".`

## Files touched

- `src/contexts/VoiceContext.tsx` — items 1–5.
- `src/components/app/CallDiagnosticsModal.tsx` — item 6.
- `src/lib/changelog.ts` — item 7.

## Verification

- Build passes.
- Manual: open Call Diagnostics → **Test pickup with CubblyBot** → expect PASS with all 4 stages green.
- Then ask you to try a live call with geassbound and share the diagnostics output if it still fails so we get an exact stage rather than another round of guessing.
