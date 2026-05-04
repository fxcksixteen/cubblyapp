
# Fix calls cross-platform + Not-in-call indicator

## What's actually broken

### Issue 1 — iOS-initiated call never rings the peer; pill flickers and disappears

Root cause is in `ios-native/Sources/Cubbly/Core/Services/CallStore.swift::startCall`:

1. We call `await signaling.joinCallChannel(conversationId:)` and **immediately** call `signaling.ringUser(...)`. But `ringUser` builds a **brand-new** `voice-global:{peerId}` channel, calls `await channel.subscribe()`, fires the `incoming-call` broadcast, then schedules removal 5s later. With supabase-swift 2.24, `subscribe()` returns before the channel is actually JOINED — the broadcast is sent into a half-open channel and dropped on the floor for the peer. That is why "her app showed ringing but mine never rang."
2. Right after that, we call `signaling.broadcast("peer-leave"/"hangup"...)` indirectly: when the peer never picks up and the user taps end, our `endCall` broadcasts `peer-leave`. But the bigger flicker bug is that `currentCallEventId` gets inserted, the realtime INSERT fires the `Ongoing call` pill on her end, then the iOS endCall path runs the cleanup that updates `state=ended` because `live.isEmpty` (the peer never joined → no other participant rows → call ended). On rapid hang-ups that whole sequence happens in <1s, which is exactly the "appeared for a split second then immediately removed" symptom.
3. Also: the global ring channel uses a fresh channel per ring instead of reusing one we know is JOINED. The signaling channel (`voice-call:{conv}`) is joined first with `await channel.subscribe()`, but the same race applies on supabase-swift — broadcasts before the JOIN ack are dropped silently.

### Issue 2 — Web "Not in call" indicator stuck when peer leaves

`useCallParticipants` listens to `postgres_changes` on `call_participants` filtered by `call_event_id=eq.X`. That works fine for the **leaver's** UPDATE (their `left_at` flips non-null), but the realtime row payload only includes the changed row. The peer's `useCallParticipants` runs `fetchParticipants()` which re-queries `.is("left_at", null)` — so the leaver should disappear. The actual gap is in `VoiceContext.tsx::handlePeerLeave` (lines 1131–1165): when the **remaining** peer receives `peer-leave`, it tears down the PC and clears `peerInstantState`, but it does **not** re-fetch `call_participants`. The DM `VoiceCallOverlay` uses `peerState` from `useCallParticipants(currentCallEventId)` which won't update until the leaver's UPDATE is broadcast — and the leaver only writes `left_at` *after* the `peer-leave` broadcast. There's a 200–800ms gap where the remaining peer's overlay shows the old peer state, and if the realtime UPDATE drops, it never recovers.

The fix: when receiving `peer-leave`/`hangup`, immediately re-call `useCallParticipants.refetch()` (and add a 1s safety retry). Also flip the local overlay to "Not in call" by introducing a `peerLeftAt` timestamp on `activeCall` so the overlay does not depend solely on `useCallParticipants` for that label.

---

## Plan

### A. iOS `v0.1.5` — calls actually work

1. **`CallSignaling.swift`**
   - In `subscribeToIncomingCalls()`, `joinCallChannel()`, and `ringUser()`, add a **JOINED-status wait** helper that polls `channel.status` (or uses `RealtimeChannelV2.status` callback) and only resolves once `status == .subscribed`. supabase-swift 2.24 exposes `channel.statusChange` async sequence — await it.
   - Helper signature: `private func awaitJoined(_ channel: RealtimeChannelV2, timeoutMs: Int = 5000) async`.
   - Use it in `ringUser` BEFORE the `broadcast(event: "incoming-call", ...)` call so the ring is never dropped. Keep the channel alive 8s (not 5s) to receive any ack.
   - Also use it in `joinCallChannel` so the very first `broadcast(...)` after join (the `ready-for-offer` from the callee, the offer from the caller) actually lands. This also fixes the "split-second pill" symptom — the call_event INSERT was happening before our presence on the per-call channel, so any peer-side reaction was racing.

2. **`CallStore.swift::startCall`**
   - Reorder so we (a) `joinCallChannel` and `awaitJoined`, (b) insert `call_events` row, (c) `ensureOwnParticipantRow` + `startHeartbeat()`, (d) **then** `ringUser`. This guarantees that by the time the peer's `incoming-call` arrives, our participant row is live, so when she taps Accept her client's "is anyone in this event?" check sees us and joins the same event.
   - On `endCall` when the call_event was created but never had a peer join, **delete** the `call_events` row instead of marking it `state=ended` (or insert it with `state='missed'`). Today we mark `ended`, which still flashes a "Call ended" pill in chat. New behavior: if `live.isEmpty` AND `currentCallEventId` was just created within the last 35s AND nobody else ever joined, set `state='missed'` so chat shows the proper red "Missed call" pill instead of the flicker.

3. **`CallStore.swift::tryJoinExisting`** — already correct; no change.

4. **`CubblyConfig.swift`** — bump `appVersion` to `"0.1.5"`.

5. **`ios-native/project.yml`** — bump `MARKETING_VERSION` to `"0.1.5"`, `CURRENT_PROJECT_VERSION` +1.

### B. Web/Desktop `v0.2.31` — Not-in-call updates instantly + caller-side missed-call sweeping

1. **`src/contexts/VoiceContext.tsx`** (around lines 1131–1165, the `peer-leave`/`hangup` handler):
   - Add a `setActiveCall(prev => prev ? { ...prev, peerLeftAt: Date.now() } : prev)` so we have a deterministic local signal.
   - Fire a new custom event `window.dispatchEvent(new CustomEvent("cubbly:peer-left", { detail: { callEventId: currentCallEventId } }))` so any listening component refetches.

2. **`src/hooks/useCallParticipants.ts`**:
   - Listen to `window` `cubbly:peer-left` and call `fetchParticipants()`.
   - Add a 1.5s safety re-fetch after any postgres_changes event (covers dropped UPDATEs).

3. **`src/components/app/VoiceCallOverlay.tsx`** + **`src/components/app/mobile/MobileCallOverlay.tsx`**:
   - Treat `activeCall.peerLeftAt` as the same condition as `ringTimedOut` for showing "Not in call" under the peer's avatar. Clear it whenever `peerState` becomes defined again (peer rejoined) or when ICE reconnects.

4. **`src/contexts/VoiceContext.tsx`** types: add `peerLeftAt?: number` to `ActiveCall`.

5. **Bump version**:
   - `package.json` + `package-lock.json` → `0.2.31`
   - `src/lib/changelog.ts`: prepend `0.2.31` entry titled "Calls actually reach the other side":
     - "When iOS rings you, your phone now actually rings — fixed a race in the realtime channel that was dropping the call notification before it left the device."
     - "When the person you're in a call with leaves, their avatar in your call panel now updates to 'Not in call' the instant they hang up, even if their realtime update was missed."

### C. Native iOS zip
- After the iOS edits + version bump, rebuild the prebuilt zip via the existing `.github/workflows/prebuild-native.yml` flow (or local zip of `ios-native/`) and surface it in `/mnt/documents/`.

---

## Files touched

- `ios-native/Sources/Cubbly/Core/Services/CallSignaling.swift`
- `ios-native/Sources/Cubbly/Core/Services/CallStore.swift`
- `ios-native/Sources/Cubbly/App/CubblyConfig.swift`
- `ios-native/project.yml`
- `src/contexts/VoiceContext.tsx`
- `src/hooks/useCallParticipants.ts`
- `src/components/app/VoiceCallOverlay.tsx`
- `src/components/app/mobile/MobileCallOverlay.tsx`
- `src/lib/changelog.ts`
- `package.json`, `package-lock.json`
- New iOS zip in `/mnt/documents/cubbly-ios-native-v0.1.5.zip`
