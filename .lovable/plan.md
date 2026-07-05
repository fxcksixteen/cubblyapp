# v0.4.5 patch — 3 more server/group call fixes

## Problems

### 1. DM sidebar mute doesn't reflect / control server or group call
The DM sidebar (`DMSidebar.tsx`) has its **own** inlined bottom user panel (not the shared `UserPanel.tsx`). That inlined panel only checks `VoiceContext.activeCall` for the DM 1‑on‑1 call. It has no awareness of `GroupCallContext.activeCall`. Effect: while in a server voice channel, if I click mute in the DM sidebar it toggles a local dummy state (`localMuted`) instead of muting the server call, and the icon shows unmuted even though the server call is muted. The equivalent `UserPanel.tsx` was already fixed in the previous batch — `DMSidebar.tsx` was missed because it duplicates the panel inline.

### 2. Group calls give the caller no "ringing" feedback
When you start a group DM call, `startCall` pings every member via `ringMemberWithRetry`, but `GroupCallPanel` only renders `peers` (people whose `RTCPeerConnection` is established). Until a friend accepts, they appear nowhere in the UI. The caller sees an empty room and can't tell whether their friends are being rung, whether the ring failed, or whether they're already declining. Discord shows a "Calling…" tile per invited-but-not-joined member — we have nothing.

### 3. Peers can't see each other after (re)joining server/group calls
Symptom: A joins first, B joins → B sees A but A doesn't see B, or vice versa. Repeatedly leaving/rejoining eventually works.

Root cause is in the DB reconcile loop in `GroupCallContext.tsx` (~line 1521). When it detects a live peer we have no `RTCPeerConnection` for, it only **re-broadcasts `peer-join` with `fromUserId: self`**. But the `peer-join` handler only makes an offer when `user.id > payload.fromUserId` (higher-id side offers, to avoid glare):

- If **I am the higher id** and the lower-id peer is missing: I re-broadcast `peer-join` with my id → the lower-id peer sees it, computes `theirId > myId` = false → nobody offers. Stuck.
- The loop also `break`s after one missing peer per 5-second tick, so 2+ missing peers take multiple ticks each.
- The initial `peer-join` broadcast fires immediately when `SUBSCRIBED` resolves; existing peers on a Realtime channel that momentarily hiccuped miss it and there's no per-peer retry beyond the general reconcile.

## Fix

### 1. `src/components/app/DMSidebar.tsx` — wire the sidebar mute/deafen to group calls

Mirror the exact logic already in `UserPanel.tsx`:

- Import `useGroupCall` and destructure `activeCall: groupCall, toggleMute: toggleGroupMute, toggleDeafen: toggleGroupDeafen`.
- Compute derived state:
  ```
  const muted = activeCall ? activeCall.isMuted : groupCall ? groupCall.isMuted : localMuted;
  const deafened = activeCall ? activeCall.isDeafened : groupCall ? groupCall.isDeafened : localDeafened;
  ```
- Mute button `onClick`: `if (activeCall) toggleMute(); else if (groupCall) toggleGroupMute(); else { setLocalMuted…; playSound… }`. Deafen mirrors it.
- Replace all inline `(activeCall ? activeCall.isMuted : localMuted)` ternaries with the new `muted`/`deafened` variables so the icon, background, and title all reflect the group-call state.

### 2. Ringing indicator for group calls

Extend `GroupCallContext` to expose invited-but-not-joined members, and render them as "Calling…" tiles in `GroupCallPanel`.

- `GroupCallContext.tsx`:
  - New interface field on the context: `ringingMembers: { userId: string; displayName: string; avatarUrl: string | null }[]`.
  - New state `ringingMembers` populated in `startCall` from the `memberIds` argument (skip `user.id`; hydrate names/avatars via existing `loadProfile`). Only populated when `options?.isServerChannel` is falsy (server voice channels don't "ring" anyone).
  - When a `peer-join` arrives from a member, or when `ensurePeerEntry` promotes them to a real `GroupPeer`, remove them from `ringingMembers`.
  - Clear `ringingMembers` on `leaveCall` and when the call ends.
  - New effect: 30 seconds after `startCall`, drop any still-ringing member (they didn't pick up) and, if `peers.length === 0` and `ringingMembers.length === 0`, treat as unanswered (existing leaveCall path is fine — no auto-hang-up in this patch, just stop showing "Calling…" forever).
- `GroupCallPanel.tsx`:
  - Read `ringingMembers` from the context.
  - Render a tile per ringing member alongside the peer tiles: greyed-out avatar, pulsing ring, subtitle "Calling…". Reuse the existing `PeerTile` styling but pass `isMuted={false}`, `audioLevel={0}`, and add a small "Ringing" badge overlay.
- No changes to `ServerVoicePanel.tsx` — server voice channels don't ring users.

### 3. Reliable peer discovery in `GroupCallContext.tsx`

Rewrite the reconcile tick (~line 1521) so it does real recovery instead of only re-broadcasting `peer-join`:

- Remove the `break` — iterate every missing live peer per tick.
- For each missing peer `r`:
  - `await ensurePeerEntry(r.user_id)` so the tile appears immediately.
  - If `user.id > r.user_id` (we're the offering side): call `ensurePc(r.user_id)`, `createOffer`, `mungeGroupCallOpusSdp`, `setLocalDescription`, and send a directed `offer` payload with `toUserId: r.user_id` — same code path as the `peer-join` handler.
  - Else (we're the lower-id side): send a **directed** `peer-join` with `toUserId: r.user_id` so it's not filtered by anyone else and the higher-id peer definitely re-offers. If we already offered them within the last 5s (track a small `Map<userId, number>` of last-attempt timestamps), skip to avoid glare storms.
- Keep the 2s seed tick and 5s interval.
- Also, on `SUBSCRIBED`, in addition to the current broadcast `peer-join`, immediately kick a reconcile tick so a rejoiner picks up existing peers within ~500 ms instead of waiting for the 2s seed.

## Files touched

- `src/components/app/DMSidebar.tsx` — hook up group-call mute/deafen in the inlined bottom panel.
- `src/contexts/GroupCallContext.tsx` — add `ringingMembers` state + context field; rewrite reconcile loop to actively offer to missing lower-id peers and iterate all misses; kick a reconcile tick on `SUBSCRIBED`.
- `src/components/app/GroupCallPanel.tsx` — render "Calling…" tiles for `ringingMembers`.
- `src/lib/changelog.ts` — three one-line v0.4.5 bullets (no version bump):
  - "DM sidebar mute/deafen now controls the active server or group call."
  - "Group calls now show a 'Calling…' tile for friends who are being rung."
  - "Fixed peers not seeing each other after joining a server or group call."

## Out of scope

- No version bump.
- No changes to 1-on-1 DM call code.
- No changes to the ring-out sound or the incoming-call modal.
- No auto-hang-up when nobody answers a group ring (just hide the stale tiles after 30s).
