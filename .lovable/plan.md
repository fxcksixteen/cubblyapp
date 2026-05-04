
## Goal

Two related v0.3.0 stability bugs:

1. **Rejoin call** sometimes lands the rejoiner in a "connected" UI but with no real WebRTC stream (the staying peer never (re)negotiates).
2. **Online dot** flickers offline → online for users who are clearly online, especially when the other person is on iOS native + web at the same time.

## Findings

### Rejoin handshake
`src/contexts/VoiceContext.tsx`

- Rejoiner side (`startCall` w/ `isJoiningExisting=true`, lines 1521‑1593) sets `state: "connected"` immediately and sends a single `ready-for-offer` broadcast — never retried.
- Staying peer side (`setupSignaling` `ready-for-offer` handler, lines 992‑1005) calls `initializeOutgoingConnection`, which **bails silently** if `pcRef.current || pendingOfferRef.current` is truthy (lines 904‑906). After `peer-leave` we close `pcRef` and null it, but **do not clear** `pendingOfferRef`, `outgoingCandidateBuffer`, `incomingCandidateQueue`, `remoteDescriptionSet`, or `acceptedIncomingCallRef`. If the previous call left a stale `pendingOfferRef`, the new `ready-for-offer` is dropped and the rejoiner sits forever in fake "connected".
- We also leave `localStreamRef` running on the staying peer; `initializeOutgoingConnection` then calls `getUserMedia()` again and stacks a second mic stream / audio-level monitor — this is what produces the "voice volume is messed up" symptom after a mute/deafen toggle racing with rejoin.
- `ready-for-offer` is fired exactly once and uses broadcast (best-effort). If the staying peer's `voice-call:<conversationId>` channel hasn't resubscribed yet (post tab-wake), it's lost. There is no retry.
- Rejoiner sets `state: "connected"` before ICE actually connects → if handshake fails, UI lies. Should be `"calling"` until `oniceconnectionstatechange` flips it (line 718‑727 already handles the real flip).

### Presence flicker
`src/contexts/AuthContext.tsx` (lines 119‑183)

- Per-connection presence key + union of `user_id` payload + key prefix is correct.
- Two separate `on("presence", { event: "sync" }, …)` handlers are registered (lines 167 and 172). The second one re-`track()`s on every sync; that's fine, but the iOS native client emits its own bursty join/leave during background/foreground transitions and momentarily drops to an empty `presenceState`. `setOnlineUserIds(ids)` then publishes an empty set for one render before the next sync repopulates → green dot blinks.
- We never debounce the "offline" transition. Going *online* should be instant; going *offline* should require ~10s of continuous absence. The web client already does this in spirit (each device has its own key), but a momentary realtime reconnect drops every key at once.

## Plan

### A. Fix rejoin handshake

In `src/contexts/VoiceContext.tsx`:

1. **Hard reset signaling refs on `peer-leave`/`hangup`** (around lines 1210‑1255):
   - Null out `pendingOfferRef.current`, `acceptedIncomingCallRef.current`, `outgoingCallMetaRef.current` (will be re-derived from `activeCall`+`currentCallEventId`).
   - Clear `outgoingCandidateBuffer.current`, `incomingCandidateQueue.current`, `remoteDescriptionSet.current = false`.
   - Stop and null `localStreamRef.current` + tracks, call `stopAudioLevelMonitor()`, clear `originalMicTrackRef.current`. (We're alone in the call — no need to keep mic hot. It will be re-acquired when we (re)negotiate with the rejoiner.)
   - This is the root fix for the "mic/deafen breaks the whole call after rejoin" report.

2. **Rejoin retry on the rejoiner** (`startCall` `isJoiningExisting` branch, lines 1580‑1593):
   - Send `ready-for-offer` immediately, then schedule up to 4 retries at 800ms / 1.6s / 3s / 5s, cancelled as soon as `pcRef.current` exists OR `activeCall.state === "connected"` via `oniceconnectionstatechange`.
   - Also set `state: "calling"` (not `"connected"`) so the UI is honest until ICE actually completes; the existing ICE handler already promotes to `"connected"`.

3. **Resilient `initializeOutgoingConnection` guard** (lines 902‑907): if `pendingOfferRef.current` exists but `pcRef.current` is null, treat the pending offer as stale, clear it, and proceed.

4. **`peer-leave` heartbeat already present** (line 1247) — keep, since that's what makes the rejoiner's pre-join freshness check pick the existing event.

### B. Eliminate presence flicker

In `src/contexts/AuthContext.tsx`:

1. Collapse the two `on("presence", { event: "sync" }, …)` handlers into one (call `track()` and `syncPresence()` together) — removes a class of double-fire races.
2. **Asymmetric apply**:
   - Compute `nextIds` from presenceState as today.
   - For every uid in `nextIds` not in current state → add immediately.
   - For every uid in current state not in `nextIds` → mark "pending offline" with timestamp; only actually remove after 8s of continuous absence. A subsequent sync that re-includes the uid cancels its pending-offline timer.
3. Persist `pendingOffline` map across renders via `useRef` so it survives the rapid sync churn during reconnects.
4. On `cubbly:realtime-wake` (already dispatched by `realtimeReconnect.ts`), force a full re-`track()` and clear all pending-offline timers — anyone who's still actually online will reappear in the next sync.

### C. Smoke-test path

After the changes, manual checklist:
- A and B in a 1‑1 call. B clicks Hang Up → A sees "Not in call" (peer-leave path). B clicks Rejoin in the chat pill → both arrive at "connected" with working bidirectional audio. Repeat 3×.
- Mid-call on the staying side, toggle mute/deafen during the rejoin window. Audio must continue working both ways after rejoin completes.
- A on web, A on iOS native, B on web. B should see A as online. Background iOS app for 60s, foreground it. A's dot on B's side must never flicker offline.
- Network blip (DevTools → Offline for 5s → Online). Presence dots reappear within ~3s and never blank in between.

## Out of scope

- Group call (`GroupCallContext`) rejoin — separate code path; this plan only touches the 1‑1 voice path.
- iOS native presence client itself (we adapt to its behavior on the web side).

