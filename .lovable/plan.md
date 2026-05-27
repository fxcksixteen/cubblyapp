## Goal
Ship a narrow v0.3.8 hotfix for web + desktop so joining/accepting a 1:1 call no longer immediately kicks either person out.

## Plan
1. **Make ICE disconnect handling non-destructive**
   - In `src/contexts/VoiceContext.tsx`, remove the path that directly does `setActiveCall(null)` / clears `currentCallEventId` from `pc.oniceconnectionstatechange` when ICE reports `disconnected` or `failed`.
   - Instead, treat early `disconnected` as transient and keep the user in the call while WebRTC attempts recovery.
   - Only close the peer connection after a longer confirmed failure, without clearing the call UI or participant row.

2. **Prevent stale peer-leave/hangup broadcasts from affecting the wrong call**
   - Add `callEventId` to outgoing `peer-leave` broadcasts.
   - When receiving `peer-leave` / legacy `hangup`, ignore it if the payload’s `callEventId` does not match the currently active call event.
   - This protects against delayed broadcasts from a previous attempt immediately resetting the new call.

3. **Make answer/offer failure safer**
   - Replace the current `endCallRef.current()` fallback inside signaling errors during `ready-for-offer`, accepted offer handling, and rejoin auto-accept with a soft connection reset.
   - A failed SDP step should not mark the user as left or kick them out unless they explicitly hit hang up.

4. **Keep participant liveness alive during join**
   - Ensure `heartbeat_call_participant` runs as soon as the local call state is created and continues during the join/ringing phase, so the database does not consider the user stale while the peer is accepting.

5. **Update v0.3.8 changelog only**
   - Add a v0.3.8 entry in `src/lib/changelog.ts` for this hotfix.
   - Do not bump beyond `0.3.8`.