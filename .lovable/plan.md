## Plan for v0.3.15 call fix

1. **Stop accept from dismissing the caller’s own active call**
   - Remove the cross-device `incoming-call-dismiss` broadcast from the Accept path.
   - Keep that broadcast only for explicit Decline/Dismiss, because Accept currently sends a dismiss event to the caller’s `voice-global` channel and the caller treats it as matching an active, not-yet-connected call. That matches the symptom: receiver clicks green Accept, caller flips from `calling` to `not in call`.

2. **Make reciprocal call clicks join the existing ring instead of creating weird double-ringing/self-ringing states**
   - Add a dedicated “answer/join existing incoming call for this DM” path in `startCall`.
   - If the user clicks voice/video while there is an incoming call for the same conversation, it should run the same logic as Accept, not start a new outgoing call.
   - If there is already an ongoing call event for the DM and the current user is not in it, starting voice/video should join that event and request/answer an offer, not ring the other user again as a separate call.

3. **Fix Rejoin so it does not get stuck in `Ringing...`**
   - In the existing-call/rejoin path, mark the local UI as “joining/calling” and request an SDP offer from the peer, but don’t show an incoming ring fallback back to the peer unless the peer is actually not live.
   - Ensure the rejoiner and the staying peer both use the same `callEventId`, and clear stale `lastAnsweredOfferRef`, pending offer, and ICE queues before each new join negotiation.

4. **Harden the active-call dismissal listener**
   - Update `incoming-call-dismiss` handling so it only clears incoming popups/ringtones on sibling devices, and never mutates an active outgoing/in-progress call into a phantom `Not in call` state.

5. **Ship metadata**
   - Bump `package.json` to `0.3.15`.
   - Add a `0.3.15` changelog entry explaining the accept/rejoin and reciprocal-call fixes.

6. **Validate**
   - Inspect the latest kaszy/geassbound call rows again after the code change if needed.
   - Run the focused test/build check available for the project after implementation.