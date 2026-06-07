I re-inspected the current v0.3.12 voice code and it is not safe to call this fully fixed yet. The DM sidebar fix can stay untouched, but voice still has race conditions that can make Accept/Rejoin open the UI without completing the real call.

Plan to fix only web/desktop 1:1 voice calls for v0.3.12:

1. Make Accept and Rejoin share the same join path
   - Add one internal helper in `VoiceContext.tsx` for the receiver/joiner side: get mic, create peer connection, attach tracks, set the offer as remote description, create/send answer, set `activeCall`, set `currentCallEventId`, and heartbeat `call_participants`.
   - Use this helper from both:
     - incoming call Accept button
     - Rejoin / Join Call button response to an offer
   - This restores the old behavior principle: accepting and rejoining both do the same offer-answer join, instead of two slightly different fragile paths.

2. Fix participant state so “Not in call” cannot hallucinate after a real join
   - Set `currentCallEventId` before SDP/ICE can connect, not after the accept flow finishes.
   - Replace the direct participant insert/update fallback in `upsertCurrentCallParticipantState` with the existing backend heartbeat RPC so stale `left_at` rows are revived instead of failing on the unique constraint.
   - Ensure Accept and Rejoin both immediately write/refresh the local `call_participants` row before waiting on background heartbeat timers.

3. Fix duplicate offer retries breaking accepted calls
   - Track the last answered offer per `callEventId`.
   - Ignore duplicate offer retry broadcasts after the same offer/call event has already been answered.
   - Keep legitimate mid-call renegotiation for camera/screenshare, but stop old retry offers from re-running `setRemoteDescription` against a stable answered peer connection.

4. Fix rejoin offer-send race on the staying peer
   - In the caller/staying-peer offer creation path, store `pendingOfferRef` immediately after `createOffer()` and before `setLocalDescription()` completes.
   - If a second `ready-for-offer` arrives while offer creation is in progress, wait for/reuse that in-flight offer instead of returning with “PC exists, no pending offer.”

5. Stabilize global incoming-call signaling
   - Keep the `voice-global:<userId>` listener mounted based only on the logged-in user.
   - Read `activeCall` and `incomingCall` through refs inside callbacks, instead of resubscribing every time call state changes.
   - This removes the teardown window during Accept where incoming-call dismiss/notifications can be missed.

6. Make ICE candidate signaling reliable enough for setup
   - Route main-call ICE sends through a small queued reliable sender instead of raw un-awaited `channel.send()` in Accept/Rejoin/outgoing paths.
   - Keep screen-share and mute/video sends separate unless needed, so this stays focused on call setup.

7. Validate the backend assumptions already checked
   - Confirmed `heartbeat_call_participant` exists, revives stale participant rows by clearing `left_at`, and `call_events`/`call_participants` are in realtime.
   - No backend schema migration is needed for this fix.

Validation after implementation:
- Check the code paths so Accept and Rejoin both call the same helper.
- Run focused tests/type validation through the normal harness.
- Leave v0.3.12 changelog focused on this single web/desktop voice-call fix.