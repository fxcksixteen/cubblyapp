
# v0.4.6 fixes

Four separate issues. Answering the last one up-front so you're not guessing: **yes, that's the hardware acceleration.** Chromium routes CSS transforms, filters, canvas, and `<video>` compositing through the GPU. When you toggle HW accel off, Chromium falls back to a much slower CPU compositor that skips or heavily throttles animation frames on complex layers — animated shop themes (Space, Sky Dusk, Snowy Drift, Moonlit Hills, Aurora, Synthwave, Lava, Borealis), animated name-color gradients, animated badges, and video/GIF playback all get hit. It's a Chromium/Electron platform limitation, not something we can code around. I'll surface that directly in the toggle so you don't have to keep asking.

---

## 1. DM 1:1 call stuck on "Ringing" (Geassbound repro)

**Diagnosis.** In `VoiceContext.tsx`, the caller latches onto its own `outgoingCallMeta.callEventId` at the moment it inserts the `call_events` row and ignores any signaling payload whose `callEventId` doesn't match (see the "🛑 Ignoring ... for stale call" guards). If the callee races and creates/joins a different `call_event` for the same conversation (which can happen after a stale-ghost cleanup on either side, or after the caller's row got soft-closed by `end_call_event_if_stale`), the two sides sit on two different callEventIds forever:

- caller broadcasts offer tagged with callEventId **A**
- callee is on callEventId **B**, so its `offer` handler drops the offer as "stale"
- callee's `ready-for-offer` is tagged **B**, caller drops it as "stale"
- caller's pickup watchdog checks `peerLooksLiveInCall(A, peerId)` — peer is live on **B**, so it returns false and never renegotiates
- 30s later the ring timeout fires and the UI flips to "not in call"

Meanwhile the callee's UI shows "In call" because from *their* perspective they're happily in event B alone.

**Fix.** Make the caller reconcile against the DB — the callEventId in the DB is the source of truth, not the one we stashed at insert time.

1. In `initializeOutgoingConnection` (caller side), before each retry and inside the pickup watchdog, re-query `call_events` for the newest `state='ongoing'` row in this conversation.
   - If the DB row's id ≠ our `outgoingCallMeta.callEventId` AND there's a fresh non-self participant on the DB row, **adopt the DB callEventId**: update `outgoingCallMetaRef`, `currentCallEventIdRef`, `pendingOfferRef.callEventId`, and re-broadcast the offer under the adopted id.
2. In the `voice-signal` handler, relax the "stale call" guards for `offer` / `ready-for-offer` / `peer-accepted`: instead of dropping, if we're actively ringing on this conversation and the payload's callEventId matches a live DB event with a fresh peer, adopt it (same swap as above) and proceed.
3. `peerLooksLiveInCall` currently scopes to a single callEventId. Add an overload `peerLooksLiveInConversation(conversationId, excludeUserId)` that scans all ongoing events for the conversation. The pickup watchdog uses this so it renegotiates even when the caller is on the wrong callEventId.
4. On join, broadcast a `peer-joined` message tagged with the callee's actual callEventId so the caller can pivot immediately without waiting for the 3s watchdog.

## 2. Server voice-channel timer never resets when everyone leaves

**Diagnosis.** Server voice channels reuse a single `call_events` row and only mark it `ended` when someone explicitly hangs up through the UI. Refreshing, closing the tab, dropping connection, or Electron quitting all leave the row `ongoing` with the original `started_at`. The next person to click the channel joins the ghost event and the timer picks up from wherever the original started_at was (hours or days ago).

**Fix.** Two-part, both in a single migration + a small UI change:

1. **DB (migration):** add `sweep_stale_call_events()` — a security-definer function that:
   - finds ongoing `call_events` where every `call_participants` row has `left_at IS NOT NULL` OR `last_seen_at < now() - interval '45 seconds'`,
   - sets those events to `state='ended', ended_at=now()`,
   - soft-closes their leftover participant rows.
   Grant EXECUTE to `authenticated`.
2. **Client:** in `useChannelVoiceParticipants` (the hook that powers the server voice channel display), call `sweep_stale_call_events()` on mount and on the 15s poll before re-querying. In `VoiceContext.tsx` at the "check for existing ongoing event" step, also call the sweep RPC before the `SELECT` so a fresh click on a voice channel with only ghost rows starts a brand-new event with a fresh `started_at`.
3. Also fix the join-existing branch to require the *other* participant to be fresh (already checked via `FRESH_MS = 30_000`), but additionally require the event's own age vs. its newest heartbeat — if the newest heartbeat across all rows is older than 45s, treat the event as dead regardless of `left_at`, close it, and start fresh.

## 3. Wishlist not clearing when the item is purchased

**Diagnosis.** `purchase_shop_item(_item_id)` and `purchase_shop_item_gems(_item_id)` insert into `user_inventory` and debit coins/gems, but never touch `wishlist_items`. So the item stays on the wishlist forever until the user manually removes it.

**Fix.** Migration only, no client change needed:

- In both `purchase_shop_item` and `purchase_shop_item_gems`, after the successful `INSERT INTO user_inventory`, add:
  ```sql
  DELETE FROM public.wishlist_items
  WHERE user_id = auth.uid() AND item_id = _item_id;
  ```
- Also add the same delete to the "gift accepted" path if one exists (I'll check for it in build mode — if `honey_gifts` or `gift_transactions` has an RPC that inserts to `user_inventory`, it gets the same cleanup for the recipient).

Realtime is already on `wishlist_items` (`REPLICA IDENTITY FULL`), so the UI updates instantly with no client changes.

## 4. Hardware acceleration warning in Advanced Settings

Small UI-only change in `src/components/app/settings/AdvancedSettings.tsx`:

- When the HW-accel toggle is **off**, show a persistent amber note under the description: *"Animated shop themes, animated name colors, animated badges, and video/GIF playback rely on the GPU. Turning hardware acceleration off will make them stutter or freeze. Turn this back on if animations aren't playing."*
- Also mention it once in the toggle's help copy while it's on, so you don't have to hunt for the connection.

No behavioral change to the toggle itself.

---

## Changelog (v0.4.6)

Short bullets per Core rules:

- Fixed 1:1 DM calls sometimes staying stuck on "Ringing" for 30 seconds when the other person had already joined.
- Server voice-channel call timers now reset properly after everyone leaves instead of counting up forever.
- Items are now automatically removed from your wishlist when you buy them.
- Advanced Settings now warns that turning off hardware acceleration will break animated shop themes, name colors, and badges.

---

## Files touched

- `src/contexts/VoiceContext.tsx` — DM callEventId reconciliation, adopt-on-signal, extended pickup watchdog.
- `src/hooks/useChannelVoiceParticipants.ts` — call `sweep_stale_call_events` before fetches.
- `src/components/app/settings/AdvancedSettings.tsx` — HW-accel warning copy.
- `src/lib/changelog.ts` — v0.4.6 entry.
- New migration:
  - Rewrite `purchase_shop_item` + `purchase_shop_item_gems` to delete matching `wishlist_items` row.
  - Add `sweep_stale_call_events()` SECURITY DEFINER function + grant to authenticated.

No app-version bump.
