## v0.4.5 — Group calls, server calls, wishlist live updates

Four connected fixes. Everything else (single DM calls, chat, activity) stays untouched.

### 1. Group DM calls — third friend can't see "Join Call" button

**Root cause:** In `src/components/app/ChatView.tsx`, the call-event pill's Join button is gated with `!conversation?.is_group`. So in any 3+ person group chat, the pill renders but the Join action is stripped — the third friend who missed the ring has no way in.

**Fix:** Remove the `!is_group` gate. For group DMs, wire the Join action to `groupCall.startCall(conversation.id, group_name, all_member_ids)` (same call the sidebar uses to join an already-live group call — it correctly reuses the existing `call_event` when one is ongoing). For 1:1 DMs keep the existing `handleRejoin` path.

### 2. Group DM calls — ring reliability

**Root cause:** `startCall` in `GroupCallContext.tsx` creates a fresh `voice-global:{mid}` broadcast channel per member and fires the ring inside the `SUBSCRIBED` callback, then tears the channel down 3s later. In practice this races against Realtime reconnects (visible in the console logs already) and the ring is dropped on the floor for one or more members. There's also no server-side backup, so a missed broadcast = missed call forever.

**Fix (two layers so a miss never means "no way to join"):**
- Wait for JOIN ack before send with a small retry (mirror the iOS `awaitJoined` pattern already used in `CallSignaling.swift`); retry the broadcast once if the first send fails or the channel errors within 500ms.
- Insert one row per invited member into a new lightweight `call_invites` table (or reuse `call_events` + participants) so the recipient's existing "ongoing call in this conversation" query (already realtime-subscribed) shows the pill even if the broadcast was lost. Combined with fix #1, this guarantees Join is always reachable.

### 3. Server voice channels — never ring, always one shared call

**Root cause:** Server voice channels reuse the exact same `groupCall.startCall(...)` path as group DMs (`ServerView.tsx` lines 168 and 420). That path:
  a) Broadcasts `group-incoming-call` to every member id passed in — for a server this rings the entire server roster. Wrong.
  b) Reuses an existing ongoing `call_event` only when another participant has a fresh (<30s) heartbeat AND `left_at IS NULL`. For a server channel that should behave as a persistent room, this is too strict — a brief network hiccup or an all-left-then-someone-returns pattern spawns a second parallel `call_event` and splits people across two "calls" in the same channel.

**Fix:**
- Add an `isServerChannel: boolean` option to `startCall`. When true:
  - Skip the ring broadcast loop entirely.
  - Always reuse an ongoing `call_event` for that conversation regardless of participant freshness. Only insert a new event when there is literally no `ongoing` row. This makes a server voice channel behave as one persistent room.
- Also add a server-channel-scoped stale sweeper: when the last participant leaves, mark the event `ended` immediately (rpc already exists) so the next joiner starts a clean event instead of resurrecting a ghost. This is what causes the "join / leave / rejoin multiple times" workaround to eventually succeed.
- Pass `isServerChannel: true` from both call sites in `ServerView.tsx`.

### 4. Wishlist doesn't update live on other users' profile cards

**Root cause:** `UserProfileCard.tsx` fetches `wishlist_items` and `profiles.public_wishlist` once on open with no realtime subscription. Additionally, `wishlist_items` isn't in the `supabase_realtime` publication.

**Fix:**
- Migration: `ALTER PUBLICATION supabase_realtime ADD TABLE public.wishlist_items;` (idempotent guard).
- In `UserProfileCard.tsx`, add a scoped realtime channel that listens for `wishlist_items` changes filtered to `user_id=eq.{userId}` and for `profiles` changes on the same user (already published), and re-runs the fetch effect. Teardown on unmount.

### 5. Speaking rings not lighting up reliably in group calls

Diagnostic pass, then fix if reproducible: verify the per-peer WebAudio `AnalyserNode` in `GroupCallContext.tsx` (`startPeerMonitor`) is re-attached when a peer's mic MediaStream is replaced via renegotiation (currently attached once in `ontrack`; a track-replace won't rewire it). If confirmed, rebind the analyser on every new inbound audio track and reset the level to 0 between binds. Independent of hardware acceleration.

### Changelog + version

- Bump to `v0.4.5` in `package.json`.
- Short one-line bullets in `src/lib/changelog.ts` (no internals): "Group call Join button now works for everyone in the chat", "Group call rings are more reliable", "Server voice channels no longer ring members and always share one call", "Wishlists update live on profiles".

### Files touched

- `src/components/app/ChatView.tsx` — remove `!is_group` gate on Join, wire group-DM join.
- `src/contexts/GroupCallContext.tsx` — `awaitJoined` + retry for ring; `isServerChannel` option (skip ring, always-reuse); analyser rebind on renegotiation.
- `src/components/app/ServerView.tsx` — pass `isServerChannel: true` in both call sites.
- `src/components/app/chat/UserProfileCard.tsx` — realtime subscription for wishlist + public_wishlist.
- New migration — add `wishlist_items` to `supabase_realtime` publication.
- `package.json`, `src/lib/changelog.ts`.
