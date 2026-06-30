# v0.4.0 audit

Going section-by-section against the original `.lovable/plan.md`.

## ✅ Done and shipped
- **Voice re-audit + hardening** (callEventId, forceFreshOffer, SDP fingerprinting) — v0.3.23.
- **DB migration** — `subscriptions`, `subscription_events`, `gems_balances`, `gems_transactions`, `gift_transactions`, `wishlist_items`, `message_requests`, `custom_statuses`, `activity_details` all live.
- **Honey sidebar tab** — icon between Shop and Notes, half-pill NEW bookmark.
- **HoneyPage** — animated hero, tier cards, monthly/annual toggle.
- **`useEntitlements` hook** — tier resolution wired.
- **Stripe edge functions** — `stripe-create-subscription`, `stripe-create-gems-purchase`, `stripe-webhook`, `stripe-customer-portal` all present.
- **Gems** — `GemsContext`, `GemPill`, shop dual-currency.
- **Wishlist** — heart toggle on shop items, Wishlist tab.
- **Gifting** — `GiftItemModal` + `GiftSendModal`.
- **Custom statuses** — `CustomStatusModal` + user panel entry.
- **Message Requests** — `MessageRequestsView` polished.
- **Server Settings modal** — Overview/Channels/Members/Invites.
- **Smart Gaming Activities** — Electron parsers (LoL, Valorant, Rivals, Fortnite) + realtime `activity_details` + rich `ActivityCard`.
- **Composer additions** — emoji + gift + GIF + send icons swapped to uploaded SVGs.
- **`:shortcode:` emoji autocomplete** — `EmojiAutocomplete.tsx` wired in ChatView.
- **Billing settings section** — Subscription / Payment Methods / Gems & Coins / Gifts tabs.

## ⚠️ Done but needs polish / verification
1. **Entitlements enforcement coverage** — hook exists, but I never did a systematic sweep to confirm EVERY gated surface checks it:
   - Theme picker (animated themes locked behind Honey)
   - Profile badge equip cap (1 / 2 / 3)
   - Motion-gradient name colors picker
   - Personal notes 10-cap for Free
   - Shared-note "More settings" (live-edit, allow-save) gated
   - Attachment uploader caps (25 / 100 / 250 MB)
   - Message composer length caps (2k / 4k / 8k)
   - "Honey" exclusive badge auto-grant on activation
   - Monthly 500 gems stipend for Honey tier (webhook path)
2. **`:shortcode:` autocomplete in NOTE editor** — only wired in ChatView; plan says composer AND notes.
3. **Gift entry points** — composer button ✅, Honey page CTA ✅, public-wishlist gift buttons ✅, but **right-click user → "Send a gift"** unverified.
4. **`dm_preferences.who_can_dm`** enum extension (`everyone` / `friends_only` / `friends_of_friends`) — message requests UI exists but the actual filter/preference picker may not be exposed in Settings.
5. **Custom status auto-clear** — client clears when `expires_at` passes; need to verify it actually does on tick (not just on next reload).
6. **Server Settings — Roles tab** — plan calls out "basic — owner-only for now, plus mod role flag". Modal only has 4 tabs (Overview/Channels/Members/Invites). Roles tab missing.
7. **Annual ↔ monthly switch in Subscription tab** — BillingSettings tab exists; need to verify it actually offers a switch, not just cancel/renew.

## ❌ Not done
1. **Lucide icon purge** — plan deliverable was to dump a complete inventory of every `from "lucide-react"` import for you to send an SVG pack. **84 files still import lucide.** I never produced the inventory.
2. **Version bump + changelog** — `package.json` is still on a 0.3.x; no `0.4.0` bump, no "Cubbly Alpha — Honey, Gifts, and more" changelog entry.

## What I'll do next (pending your approval)
- Produce the full **lucide inventory** (file → icon names) as a single dump so you can prep the SVG pack.
- Audit each entitlement gate and patch any that don't check `useEntitlements`.
- Wire `:shortcode:` autocomplete into the notes editor.
- Add Roles tab to Server Settings modal.
- Add right-click "Send a gift" to user context menu.
- Add `who_can_dm` selector to Privacy settings.
- Confirm custom-status expiry tick + monthly Honey gems stipend in webhook.
- Verify annual/monthly switcher in Billing → Subscription.
- Hold the 0.4.0 version bump + changelog until everything above lands.

Approve and I'll start with the lucide inventory + entitlement gate sweep in parallel.
