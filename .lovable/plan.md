
Diagnosis

- Yes — I know the main issue.
- This is not primarily a TURN problem. TURN is configured and `get-turn-credentials` is returning relay servers successfully.
- The real break is in `src/contexts/VoiceContext.tsx`: early ICE candidates are being dropped before the callee has a peer connection, and candidates can also arrive before `remoteDescription` is set. The code catches those failures but never retries them.
- The caller re-sends the offer on `ready`, but does not re-send the already gathered ICE candidates. That can make the UI look connected while audio never actually flows.

Implementation plan

1. Rebuild the WebRTC signaling flow in `src/contexts/VoiceContext.tsx`
- Add an incoming ICE queue so candidates received before `pcRef.current` or before `pc.remoteDescription` are stored and flushed later.
- Add an outgoing ICE buffer so the caller can re-send early candidates after the callee signals `ready`.
- Flush queued candidates immediately after `setRemoteDescription()` on both caller and callee.
- Only mark the call as truly connected from actual peer connection state, not just from receiving an answer.

2. Make hangup instant and one-way
- Extract a shared teardown function for local cleanup.
- When a remote `hangup` arrives, tear down locally without broadcasting `hangup` back.
- End streams, audio elements, refs, and channel state synchronously so the call disappears immediately for both people.

3. Fix call avatar reliability
- Pass avatar URLs through call signaling state instead of relying on extra profile fetches alone.
- Use `incomingCall.callerAvatarUrl` directly in `src/components/app/VoiceCallOverlay.tsx`.
- Add fallback behavior so the in-call panel still shows avatars even if profile fetch timing is late.

4. Tighten typing indicator reliability
- In `src/components/app/ChatView.tsx`, make typing broadcast resilient to channel subscription timing.
- If the input already has text when the typing channel becomes ready, send a fresh typing event.
- Keep stop-typing cleanup on blur/send/conversation switch.

5. Verify the full web flow end to end
- Test: caller starts call -> callee receives overlay -> accepts -> offer/answer/candidates all settle -> both hear each other.
- Test: either side hangs up -> both UIs close immediately.
- Test: incoming call avatar and active call avatar render for both users.
- Test: typing indicator appears live in the same DM.

Files to change

- `src/contexts/VoiceContext.tsx`
- `src/components/app/VoiceCallOverlay.tsx`
- `src/components/app/ChatView.tsx`
- Possibly `src/pages/AppLayout.tsx` if I thread avatar data into `startCall(...)`

Technical details

- Root bug: `addIceCandidate()` should not be treated as fire-and-forget; it must wait until the peer connection exists and the remote description is ready.
- Current false-positive UI state: receiving an answer sets the call to connected too early.
- No backend schema change is required for the core audio fix.
- TURN is already present, so the next fix should be entirely in the client WebRTC signaling logic.

Expected result after implementation

- Web calls should finally carry audio both directions.
- Hanging up from either side should end the call immediately.
- Call avatars should show consistently.
- Typing indicator should be more dependable.
