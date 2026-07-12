## Plan: v0.4.8 call-system repair

Fix both call systems as one patch, and prep the desktop changelog/version only. No web publish/deploy.

## What I’ll change

1. **Stop DM calls from splitting into separate call events**
   - Make 1:1 DM calls reuse one canonical ongoing `call_event` per conversation.
   - When Accept/Rejoin sees a different live event, adopt the canonical event instead of creating or staying on a separate one.
   - Prevent the caller and callee from ending up with different `callEventId`s after stale participant cleanup.

2. **Replace the brittle DM pickup handshake with a deterministic one**
   - Caller/staying peer is the offerer; callee/rejoiner is the answerer.
   - Accept will never become an offerer because of crossed `ready-for-offer` retries.
   - Remove the caller-side auto-renegotiate behavior that keeps rebuilding offers after the peer already accepted and causes stuck/fake states.
   - Make `peer-accepted` immediately move the caller out of Ringing while waiting for the answer/ICE.

3. **Fix DM Rejoin when the other side says “Not in call”**
   - When one user leaves and rejoins, keep the staying user as the offerer and force a clean offer for the same event.
   - If the staying user is listening but has no PC/pending offer, rebuild exactly once instead of ignoring the joiner forever.
   - Ensure heartbeats clear `left_at` and refresh before signaling so the call pill/UI sees both users in the same call.

4. **Fix server voice-channel joins for everyone**
   - Rework server/group call channel subscription so stale channels are removed before joining a new room.
   - Broadcast `peer-join` reliably with short retries after subscription, because a single dropped join broadcast currently leaves existing peers unaware of the joiner.
   - When a server-channel join receives no offers, retry `peer-join` so the joiner can still connect without leaving/reclicking.
   - Keep one active server voice call event per channel and make participant heartbeat revive old rows correctly.

5. **Harden group/server WebRTC negotiation**
   - Await/retry critical `group-signal` sends (`peer-join`, `offer`, `answer`, ICE) enough to avoid silent broadcast drops.
   - Make offer collision handling recover instead of permanently ignoring a peer.
   - Preserve existing camera/screen-share behavior while fixing initial join reliability.

6. **v0.4.8 desktop patch prep**
   - Bump app/desktop version from `0.4.7` to `0.4.8`.
   - Add a short changelog entry with user-facing bullets only.
   - Do not publish or deploy the web version.

## Technical notes

- Primary files: `src/contexts/VoiceContext.tsx`, `src/contexts/GroupCallContext.tsx`, `src/lib/changelog.ts`, `package.json`.
- Likely no backend schema migration unless existing RPC behavior is missing a required stale-event/heartbeat guarantee.
- The logs point to two root causes:
  - DM calls still drift across multiple ongoing `call_event`s and retry loops keep rebuilding/rebroadcasting offers without a clean answer.
  - Server calls depend on a single best-effort `peer-join` broadcast; if that is dropped, the joiner enters the call locally but existing peers never connect to them.