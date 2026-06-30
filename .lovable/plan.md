## Goal
Make v0.3.23 fix the broken 1:1 call join system so:
- Green pickup/accept reliably joins the caller’s exact call.
- Orange Join/Rejoin reliably puts both users into the same call without both sides leaving/rejoining.
- Stale/ghost call rows cannot trick either client into the wrong role.

## Plan
1. **Unify Accept + Join/Rejoin into one handshake path**
   - Replace the fragile direct-answer green-button path with the proven join-existing flow.
   - Accept will heartbeat into the existing call, join the same signaling channel, then request a fresh offer from the caller.
   - Keep the UI immediate, but don’t mark the user “connected” until ICE actually connects.

2. **Fix the caller-side role problem**
   - When the caller receives `ready-for-offer`, ensure they become the offerer even after ring timeout or peer-leave cleanup.
   - If a stale peer connection exists, close it and generate a fresh offer instead of bailing with “PC exists”.
   - Scope all offer/answer/ICE handling to the current `callEventId` so old attempts cannot hijack the new one.

3. **Make joining an existing call deterministic**
   - On Join/Rejoin, reuse the latest ongoing call event only when another participant has a fresh heartbeat.
   - Immediately revive the user’s participant row and start heartbeat before signaling so the other side sees them live.
   - Stop clearing/ending valid ongoing events during accept/join races.

4. **Harden signaling retries**
   - Send `ready-for-offer` with retries until either an offer arrives or a peer connection exists.
   - Send the new offer reliably and re-broadcast it if another `ready-for-offer` arrives.
   - Stop incoming/outgoing ringtone loops once a valid answer or join flow starts.

5. **Update v0.3.23 release metadata**
   - Bump the desktop/web app version to `0.3.23`.
   - Add a short changelog bullet about reliable green-pickup and Join/Rejoin call joining.

## Files expected to change
- `src/contexts/VoiceContext.tsx`
- `src/lib/changelog.ts`
- `package.json`

## Validation
- Typecheck/build through the normal harness.
- Manually verify the code paths for:
  - fresh call → callee clicks green pickup → both connect
  - missed/ring-timeout call → callee clicks Join/Rejoin → both connect
  - caller leaves/rejoins after callee joined → same call event reused
  - stale previous call event ignored/closed safely