## What the logs prove

The important part is the caller receives `ready-for-offer` repeatedly and keeps re-broadcasting the same pending offer, but there is no `answer received` log afterward. So the callee is alive enough to send `ready-for-offer` / `peer-accepted`, but either:

1. the callee never actually answers the offer, or
2. the callee sends the answer tagged with a different `call_event_id`, and the caller ignores it as stale.

The DynamoDB `/ping` 404s are only the region latency probe; noisy, but not the direct call-breaker. The TURN fallback logs are also not the core issue here because signaling fails before WebRTC reaches a complete offer/answer exchange.

## Plan

### 1. Fix the DM answer race directly
- When a `peer-accepted` or `ready-for-offer` arrives with a different `call_event_id`, adopt that ID everywhere, not just in refs:
  - `currentCallEventIdRef`
  - React `currentCallEventId`
  - `outgoingCallMetaRef`
  - `pendingOfferRef`
  - active call timing/state
- Do not keep re-broadcasting an old pending offer after adoption; create a fresh offer tagged with the adopted ID.
- Accept answers for the active conversation when the ID drift was just adopted, instead of dropping them as stale.

### 2. Restore a real pickup watchdog
- The current code defines `tryAutoRenegotiate` but never schedules it.
- Re-enable it safely with bounded retries so if the caller sees the peer heartbeat but no answer/connection, it forces one clean fresh offer instead of looping forever on the same old pending offer.
- Add a log that clearly says whether the failure is `no-answer`, `stale-call-event`, or `no-live-peer`.

### 3. Harden the callee accept path
- On accept, clear stale `lastAnsweredOfferRef`, `lastAnswerRef`, `pendingOfferRef`, and candidate queues before answering.
- If the callee receives duplicate offers with the same SDP, resend the cached answer; if the SDP/call ID changed, rebuild/answer once cleanly.
- Keep the callee as answerer; do not let their repeated `ready-for-offer` flip them into offerer mode.

### 4. Fix server voice join reliability
- Port the DM heartbeat retry behavior into `GroupCallContext` so a single failed/slow backend heartbeat does not make Join silently fail.
- If `activeCall` exists but there are no peer connections, no local stream, and no valid channel, treat it as stale and clean it before allowing Join again.
- On server join, verify the participant row exists after heartbeat; if not, log diagnostics and show a user-visible failure instead of silently doing nothing.
- After channel recovery, rebroadcast `peer-join` so existing server participants can offer to the recovered/joining client.

### 5. Reduce misleading noise
- Stop the DynamoDB region probes from logging 404s by using safer timing endpoints or suppressing expected failures.
- Keep the TURN warning, but make it less spammy per session.

### 6. Version/changelog
- Keep this as v0.4.9 unless you explicitly ask for a version bump.
- Add only a short user-facing changelog bullet if needed, with no internal variable/file details.