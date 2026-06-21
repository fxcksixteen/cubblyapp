## v0.3.14 — Two bug fixes

### Bug 1 — Calls silently dead between two specific users (kaszy ↔ geassbound)

**Root cause (high confidence).** In `src/contexts/VoiceContext.tsx` `startCall` (around lines 1686–1740), before initiating a fresh call we look up any `call_events` row with `state='ongoing'` in that conversation. If a participant row exists for the *other* user with `left_at IS NULL` and is considered "fresh", we silently switch into rejoin mode (`isJoiningExisting = true`) — and that path **never sends the `incoming-call` broadcast** (the broadcast only fires in the `!isJoiningExisting` branch at line 1842). So the peer never rings, never sees an incoming call, and the caller just sits in "calling…".

The freshness check is:

```ts
r.left_at === null &&
(!r.last_seen_at || now - new Date(r.last_seen_at).getTime() < FRESH_MS)
```

The `!r.last_seen_at` clause treats a NULL `last_seen_at` as fresh forever. Any old participant row that was inserted but never received its first heartbeat (crash, force-quit, network drop before the heartbeat interval, an older app version that didn't write `last_seen_at`) will permanently poison that single conversation. Every future call attempt between those two users is hijacked into a silent "rejoin" against a ghost — which matches the reported symptom exactly: works for everyone, broken *only* in that one DM.

**Fix.**

1. In `startCall`, change the freshness predicate so NULL `last_seen_at` is *not* automatically fresh — fall back to `joined_at` (which is `NOT NULL DEFAULT now()`):

   ```ts
   const baseline = r.last_seen_at ?? r.joined_at;
   const isFresh = baseline && now - new Date(baseline).getTime() < FRESH_MS;
   const otherActive = r.user_id !== user.id && r.left_at === null && isFresh;
   ```

   Include `joined_at` in the `select`.

2. Defensive cleanup: when `existing` is found but no peer is genuinely live, in addition to `end_call_event_if_stale`, soft-close stale participant rows so the row state matches reality (UPDATE `call_participants` SET `left_at = now()` WHERE `call_event_id = existing.id` AND `left_at IS NULL` AND (`last_seen_at` IS NULL OR `now() - last_seen_at >= 30s`)).

3. Belt-and-suspenders: even on the `isJoiningExisting` rejoin path, still fire one `incoming-call` broadcast to the peer. If they're truly in the call it's a no-op (the receiver already short-circuits on `activeNow || sameCallAlreadyOpen` at line 2758). If they're not, they get the ring instead of nothing.

4. Add a brief `console.log` in the rejoin branch identifying which row was treated as live, so if a similar ghost appears again it's diagnosable from logs.

No schema migration is required — `joined_at` already exists.

### Bug 2 — Profile modal clipped to DM sidebar in Space theme

**Root cause.** In Space theme `.sidebar-tertiary` gets `backdrop-filter: blur(8px)` (`src/index.css` line 176). `backdrop-filter` establishes a containing block for `position: fixed` descendants, so the full-profile modal rendered by `UserProfileCard` (`fixed inset-0 z-[70]`) — which lives inside the DM sidebar tree via `DMSidebar.tsx` line 440 — gets confined to the sidebar's bounding box instead of the viewport. That's exactly what the screenshot shows: a 440px-wide centered modal squeezed into the ~230px sidebar column.

**Fix.** Render `UserProfileCard` through a React portal to `document.body` so it escapes any filtered/transformed ancestor. The card has two render paths — both `showFullProfile` (centered modal) and the mini card (`position: fixed` at click coords) need to escape — so wrap the returned JSX in `createPortal(..., document.body)` once at the bottom of the component.

This is a one-file, ~3-line change in `src/components/app/chat/UserProfileCard.tsx`. No theme-CSS surgery needed (and no risk of breaking the deliberate blur on the sidebar itself).

### Version + changelog

- Bump `package.json` and `CURRENT_VERSION` in `src/lib/changelog.ts` to `0.3.14`.
- Prepend a `0.3.14` entry to the changelog with two bullets:
  - **Voice calls fixed between specific friend pairs** — a stale "ghost" participant row in one DM could silently divert every new call attempt into a rejoin against nobody, so the peer never rang. The freshness check now ignores rows with no heartbeat, cleans them up, and always rings the peer as a fallback.
  - **Profile modal no longer clipped on Space theme** — the Space sidebar's backdrop-blur was confining `position: fixed` children to the sidebar; the profile modal is now portaled to `document.body` so it always covers the full viewport.
- Keep `0.3.13` and `0.3.12` entries intact.

### Files touched

- `src/contexts/VoiceContext.tsx` — freshness predicate, stale-participant cleanup, fallback `incoming-call` broadcast on rejoin, log line.
- `src/components/app/chat/UserProfileCard.tsx` — portal the rendered card to `document.body`.
- `src/lib/changelog.ts` — new 0.3.14 entry, bump `CURRENT_VERSION`.
- `package.json` — version bump.
