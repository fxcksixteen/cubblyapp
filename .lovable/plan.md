
# v0.4.0 — Cubbly Alpha

Massive release. Broken into clear workstreams. I will ship everything in this single plan once approved.

---

## 0. Voice calling — re-audit before anything else

Before touching new features I will do a clean read of `VoiceContext.tsx`, `useCallParticipants.ts`, `acceptCall`, `startCall`, `initializeOutgoingConnection`, and signaling handlers and confirm:

- Every signal carries `callEventId` and stale events are dropped.
- `currentCallEventIdRef` is set synchronously in both `startCall` and `acceptCall` before any broadcast.
- `forceFreshOffer` path tears down the caller's stale `RTCPeerConnection` BEFORE generating the new offer (not after).
- Green pickup = same code path as Rejoin (both call `acceptCall` → `ready-for-offer{forceFreshOffer:true}`).
- `lastAnsweredOfferRef` keyed on `${callEventId}:${sdpFingerprint}` so genuine fresh offers aren't dropped as dupes.
- Cross-device ring suppression still scoped per `callEventId`.

I'll add 2 small hardening items I expect to find missing: (a) flush ICE candidate queue only after `setRemoteDescription` resolves; (b) clear `pendingOfferTimeoutRef` on every state transition so a late timeout can't kill a healthy call. Report findings in the implementation summary.

---

## 1. Cubbly Honey — subscription system

**Names:** `Honey Basic` ($2.99/mo) and `Honey` ($7.99/mo). Sidebar tab label: **Honey**. Annual plan: Honey gets ~20% off ($76.70/yr ≈ "2 months free"), Honey Basic annual is straight 12× ($35.88/yr) with no discount.

**Sidebar tab:** new top-row entry between Shop and Personal Notes. Icon = honey-pot / honeycomb hex (custom SVG, not lucide). Half-pill **NEW** badge extending off the right edge of the tab label — pulsing soft amber glow, auto-hides 14 days after the user first views the tab (per-user localStorage flag).

**Honey page** (`/@me/honey`): premium animated hero — slow-drifting honeycomb gradient (amber #F5A524 → rose #F472B6 → violet #A855F7), floating bee particles, glassmorphic tier cards with monthly/annual toggle, comparison table, "Gift Honey" CTA, FAQ. Built with Framer-Motion-style CSS animations (no new lib needed). Mobile-responsive.

**Benefits enforced in-app:**
| Benefit | Free | Honey Basic | Honey |
|---|---|---|---|
| Coin rewards multiplier | 1× | 2× | 2× |
| Profile badges equipped | 1 | 2 | 3 |
| Motion-gradient name colors | ❌ | ✅ | ✅ |
| Animated themes (space, sky, snowy, hills, future) | ❌ | ✅ | ✅ |
| Personal notes cap | 10 | unlimited | unlimited |
| Shared-note "More settings" (live edit, allow-save) | ❌ | ✅ | ✅ |
| Attachment size cap | 25 MB | 100 MB | 250 MB |
| Message length cap | 2 000 | 4 000 | 8 000 |
| Exclusive **Honey** profile badge (auto-equippable while active) | ❌ | ✅ | ✅ |
| Monthly gems stipend | 0 | 0 | 500 |

Explicit non-perks (everyone keeps): full-quality streaming, animated banners, animated avatars.

**Enforcement:** new hook `useEntitlements()` reads `subscriptions` table; every gated surface (theme picker, badge equip, name-color picker, note editor cap, attachment uploader, message composer) checks `entitlements.tier`. Gated items show a tasteful "Honey only" lock with one-click upgrade.

**Payments:** Stripe BYOK (user's own keys, not Lovable built-in). I'll add `add_secret` requests for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` after plan approval. Three edge functions:
- `stripe-create-subscription` (create Checkout Session for monthly/annual)
- `stripe-create-gems-purchase` (Checkout Session, one-time)
- `stripe-webhook` (handle `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.paid`)

**DB (migration):** `subscriptions`, `subscription_events`, `gems_balances`, `gems_transactions`, `gift_transactions`, `wishlists`, `wishlist_items`, `message_requests`, `custom_statuses`, `activity_details`. All with GRANTs + RLS as per project rules.

---

## 2. Gems currency

- Bundles: 100 ($0.99) · 500 ($4.99) · 1200 ($9.99) · 2500 ($19.99) · 6500 ($49.99). Honey tier auto-credits 500 gems monthly via webhook on `invoice.paid`.
- New "💎 Gems" section in Shop with ultra-premium items (animated themes with full particle systems, exclusive badges, future profile effects). Items have either `price_coins` or `price_gems` (exclusive).
- Gems balance pill next to coins balance in user panel.

---

## 3. Wishlist + Gifting

- Heart toggle button on every shop item card. Bold = wishlisted (uploaded `Heart_1-2.svg`), light = not (uploaded `Heart-2.svg`). Stored in `wishlist_items`.
- Profile setting: "Make wishlist public". Public wishlist shows on profile card with a "🎁 Gift" button next to each item.
- **Gifting system:** Gift either Honey subscription or any shop/gem item. Recipient gets an animated DM card ("X sent you a gift! 🎁") with an "Open gift" reveal animation. Sender pays via Stripe (subscription gift = one-time charge for N months); shop-item gifts pay in coins/gems from sender's balance.
- Gift entry points: (a) new Gift icon button in message composer (between emoji and GIF), (b) "Gift Honey" CTA on Honey page, (c) gift buttons on public wishlists, (d) right-click user → "Send a gift".

---

## 4. Message requests

- New "Message Requests" tray inside DM sidebar (collapsible section above DM list).
- DMs from non-friends land in `message_requests` instead of creating an active conversation. Sender sees "Request sent — they need to accept".
- Recipient can Accept (promotes to real conversation), Decline, or Block.
- `dm_preferences` already exists — extend with `who_can_dm` enum (`everyone` | `friends_only` | `friends_of_friends`).

---

## 5. Server settings continuation

- Server Settings modal: Overview (name/icon/description), Roles (basic — owner-only for now, plus mod role flag), Members (kick, transfer ownership), Invites (list/revoke), Channels (rename/reorder/delete), Danger Zone (delete server).
- Right-click server icon → "Server Settings" (owner-only).

---

## 6. Custom statuses

- New "Set custom status" entry in user panel popup (above status dropdown).
- Modal: text (≤ 80 chars), emoji picker, expiry (Never / 30 min / 1 hr / 4 hrs / Today / Custom).
- Shows under display name everywhere (DM header, profile card, member lists, sidebars).
- Stored in `custom_statuses`; auto-cleared by client when `expires_at` passes.

---

## 7. Smart gaming activities

- New `activity_details` table: `{user_id, game_key, payload jsonb, updated_at}`.
- Native helper (Electron) snapshot reader for **Valorant**, **Marvel Rivals**, **Fortnite**, **League of Legends**:
  - Valorant: parse local game-state log → round X/13, score, agent.
  - Marvel Rivals: parse `MarvelGame.log` → map, hero, win/loss streak.
  - Fortnite: parse `FortniteGame.log` → mode, placement, kills.
  - LoL: existing LCU REST API → champion, KDA, time.
- Rich activity card replaces flat "Playing X" with game-specific UI: map thumbnail, score, round indicator, win/loss color.
- Graceful fallback to plain "Playing X" when no parser matches.

---

## 8. Composer additions

Right side of message input, left → right: **Emoji**, **Gift**, **GIF**, **Send**. Icons from user-uploaded SVGs (`Swap_moods.svg` for emoji, `Gift.svg` for gift). Re-exported as `src/assets/icons/emoji.svg` and `src/assets/icons/gift.svg`.

**`:shortcode:` emoji autocomplete:** typing `:hea` opens popover with matches from existing `emoji-by-group.json` (already vendored, has slugs). Selecting inserts the emoji char inline. Works in message composer AND note editor.

---

## 9. Billing settings section

New top-level Settings category between **USER SETTINGS** and **APP SETTINGS**: **BILLING**.
Tabs:
- **Subscription** — current plan, renew/cancel, switch monthly↔annual, billing history.
- **Payment Methods** — list/add/remove cards (Stripe Customer Portal embedded link).
- **Gems & Coins** — balances, purchase gems, transaction history.
- **Gifts** — sent/received list, claim pending gifts.

---

## 10. Lucide icon purge

I will run a sweep and produce a complete inventory of every `from "lucide-react"` import in the web/desktop app, grouped by component, with the exact icon names + a recommended replacement category (action/nav/status/etc.). I'll post that list as the FIRST deliverable after build mode so you can hand me the SVG pack before I do the bulk swap. Until I have your SVGs, lucide stays in place (no half-migration). All NEW icons added in this version (Honey, Gift, Emoji, Heart) already use your uploaded SVGs.

---

## 11. Version + changelog

Bump `package.json` → `0.4.0`. Changelog entry titled **"Cubbly Alpha — Honey, Gifts, and more"** with short user-facing bullets per the project rule.

---

## Order of operations during build mode

1. Voice re-audit + 2 hardening tweaks.
2. Lucide inventory dump (so you can prep SVG pack in parallel).
3. DB migration (all new tables in one shot).
4. Entitlements hook + gating across existing gated surfaces.
5. Honey page + sidebar tab + NEW pill.
6. Stripe secrets + 3 edge functions + webhook.
7. Wishlist + gifting UI + DB wiring.
8. Message requests.
9. Custom statuses.
10. Server settings modal.
11. Smart activities (Electron parsers + UI cards).
12. Composer emoji/gift buttons + `:shortcode:` autocomplete.
13. Billing settings section.
14. Version bump + changelog.

I will NOT swap any lucide icons until you've sent the SVG pack — that becomes v0.4.1 or a follow-up within v0.4.0 depending on timing.

Approve and I'll start with the voice re-audit.
