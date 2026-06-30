
# v0.4.0 Closeout Plan

Excludes (per your call): Honey tab interior redesign, lucide icon sweep, version bump, changelog.

---

## 1. Share Note modal — redesign + recipient-edit

### A. Two-page modal with swipe transition

- Same modal shell, two pages stacked horizontally inside an `overflow-hidden` track that translates between `0` and `-100%`.
- **Page 1 (default — "Send")**: recipient multi-select, optional message, big primary `Send Note` button, and a single `More settings →` row that slides to page 2. None of the toggles are visible here anymore.
- **Page 2 ("More settings")**: header has a `← Back` chevron that slides back to page 1. Body holds the four toggles below. The Send button stays pinned at the bottom of both pages so the user never loses it.
- Transition: 220ms `cubic-bezier(.22,.61,.36,1)` translate on the track + matching opacity fade on the leaving page. Keyboard focus is moved to the back chevron / more-settings row after each slide so it's accessible.

### B. Honey-gating the toggles

All four toggles become Honey-only. For Free users each row renders disabled with a small honey-icon chip + "Honey" label and clicking it routes to `/honey`. (Enforced both in UI and in the underlying `sync_shared_note` / new `apply_recipient_note_edit` RPCs so a tampered client can't bypass.)

The four toggles on page 2, in order:

1. **View once** (existing) — burns on close.
2. **Allow recipient to save** (existing) — adds a Save copy button on the recipient card.
3. **Live edits from me** (existing — was "Live edits") — author's edits push to recipient.
4. **Let recipient edit this note** (NEW — see C).

### C. New "Let recipient edit" feature

Behavior:

- **Not view-once + edit on**: recipient sees an edit affordance on the shared-note card. Saves call new RPC `apply_recipient_note_edit(_message_id, _title, _body)`. The RPC:
  - Verifies the recipient is a participant of the conversation.
  - Verifies the message's shared-note payload has `recipientCanEdit: true` and isn't burnt.
  - Updates the author's underlying `notes` row (the one referenced by `messages.note_ref`) using SECURITY DEFINER.
  - Calls existing `sync_shared_note` so every live-mirrored copy in any chat updates too.
- **View-once + edit on**: same RPC, but the payload also tracks `recipientEditUsed: bool`. After the first successful edit the recipient card flips to read-only; closing still triggers the existing burn flow.
- Author sees changes live in their own Notes view (already realtime-subscribed) and in the message card (already realtime).
- Schema: extend the shared-note JSON payload with `recipientCanEdit: bool` and `recipientEditUsed: bool`. No new tables.

---

## 2. Honey perk enforcement (entitlement gates)

Wire `useEntitlements` to actually block/allow these:

- **Animated avatars / animated server icons**: on upload in profile + server icon flows, reject `image/gif` (and animated webp/apng) unless `ent.animatedAvatars`. Show "Honey" upsell.
- **Profile themes & banner**: gate the theme picker and banner upload in profile settings behind `ent.profileThemes`. Locked themes get a Honey badge overlay.
- **Upload size cap**: enforce `ent.maxUploadMB` in `MessageInput`/attachment handler before upload starts; show toast with "Upgrade to Honey for larger files".
- **Equipped badge slots**: read `ent.maxEquippedBadges` in the badge-equip UI; block the equip RPC call client-side when over cap (server already returns slot conflict, this just makes the UX explicit) and show the Honey upsell when a free user tries to equip a 4th.
- **Honey tier badge on profiles**: add a small honey-icon chip next to the display name in `ProfilePopup` and `UserProfileCard` whenever `user_subscription_tier(user_id)` returns `basic` or `premium`. Tooltip shows the tier name.

---

## 3. "Who can DM me" enforcement

Currently the selector saves to `dm_preferences` but `create_dm_conversation` ignores it. Plan:

- Modify `create_dm_conversation(other_user_id)`:
  - Look up `other_user_id`'s `dm_preferences.dm_policy` (`everyone` | `friends_only` | `nobody`).
  - **`everyone`**: behave as today.
  - **`friends_only`**: if the caller is not in `friendships` (accepted) with `other_user_id`, **do not** create the conversation. Instead insert a row into `message_requests` (sender = caller, recipient = other_user_id) and raise a structured `MESSAGE_REQUEST_SENT` notice that the client maps to a friendly toast.
  - **`nobody`**: same as friends_only but with a `DM_NOT_ALLOWED` notice and no message request created.
- Client side: catch the two error codes in the existing DM-open path and show clean toasts / route the sender's compose intent into the request flow.
- Recipient already has the Message Requests inbox built last phase, so accepting auto-creates the DM via existing `accept_message_request`.

---

## 4. Wishlist-aware gifting

When the Gift modal opens with a known recipient (from profile right-click, member row menu, or DM message bar):

- Add a top tab row inside `GiftItemModal`: `[ Their wishlist ] [ Full shop ]`, defaulting to wishlist when it has any items, otherwise to shop.
- Wishlist tab fetches `wishlist_items` for the recipient and joins to `shop_items` for price/name/preview.
- Items the recipient already owns are shown disabled with an "Owned" pill.
- Selecting an item flows through the existing `gift_shop_item` RPC; nothing changes on the server side.

---

## Technical notes

- **Migrations needed:**
  - `apply_recipient_note_edit(_message_id, _title, _body)` RPC.
  - `create_dm_conversation` rewritten to consult `dm_preferences` + auto-file a message request.
- **No new tables.** All four work-streams reuse existing schema (`notes`, `messages`, `dm_preferences`, `message_requests`, `wishlist_items`, `subscriptions`).
- **Files touched (frontend):**
  - `src/components/notes/ShareNoteModal.tsx` — full two-page rewrite + new toggle + gating.
  - `src/components/notes/SharedNoteMessage.tsx` — recipient edit affordance + view-once edit-once tracking.
  - `src/hooks/useEntitlements.ts` — surface `animatedAvatars`, `profileThemes`, `maxUploadMB` if missing.
  - Profile editor, server icon uploader, message attachment handler — animated/upload gates.
  - `src/components/app/UserBadges.tsx` — `maxEquippedBadges` enforcement.
  - `src/components/app/ProfilePopup.tsx` + `UserProfileCard.tsx` — Honey tier chip.
  - `src/contexts/ConversationsContext` or wherever `create_dm_conversation` is invoked — handle new error codes.
  - `src/components/app/GiftItemModal.tsx` — wishlist tab.

---

## What this plan does NOT include (per your instructions)

- Honey tab interior visual redesign (next pass).
- `lucide-react` icon sweep.
- Version bump to v0.4.0.
- Changelog entry.

Approve and I'll execute in this order: Share Note redesign → DM privacy enforcement → Honey gates → Wishlist gifting.
