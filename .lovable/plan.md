## Wishlist redesign on profile cards

### 1. Extract the shop preview into a shared component
The `ItemPreview` function inside `src/components/app/ShopView.tsx` (name-color swatches, animated theme scenes, badge art, etc.) is currently trapped in that file. Lift it into a new shared component:

- `src/components/app/shop/ShopItemPreview.tsx` — moves the existing `ItemPreview` verbatim, plus a `size` prop (`"lg"` for shop grid, `"sm"` for the wishlist strip so previews scale to ~64px tall instead of 80px).
- `ShopView.tsx` re-imports it so shop rendering is byte-identical.

### 2. Fetch full item data for the wishlist
`UserProfileCard.tsx` currently selects only `id, name, price, price_gems, category` — not enough to render real previews. Update the wishlist fetch to also pull `subcategory, description, config` so `ShopItemPreview` has what it needs. `WishlistEntry` type expands accordingly.

### 3. New wishlist card UI
Replace the current 2-column text list with a vertical stack of rich rows, styled to match the Discord-dark card system already used elsewhere on the profile card. Each row:

```
┌────────────────────────────────────────────────┐
│ ┌──────────┐  Item name                        │
│ │ preview  │  category · short descriptor      │
│ │ (64px)   │  💎 300   [🎁]                    │
│ └──────────┘                                   │
└────────────────────────────────────────────────┘
```

- Preview thumbnail on the left (real `ShopItemPreview` render — name color, theme scene, badge art).
- Title, subtle category tag beneath.
- Price with the proper currency image: `@/assets/gems/gem.png` for gems, the existing coin PNG for coins — no more emoji, no "weird coin icon".
- Vertical scroll capped at ~3 rows visible (~260 px) with a subtle fade.

### 4. Gift button for other users
For non-own profiles only, render a small circular gift-icon button (`@/assets/icons/gift.svg`) on the right side of each row.

- Enabled only when the item has `price_gems` set AND the viewer's gem balance covers it (uses existing `useGems()`).
- Disabled state: greyed-out with tooltip "Not enough gems" (or "Not giftable" for coin-only items).
- Click flow: opens a compact inline confirm popover ("Send *Bow* to Ella for 💎 1,500?" with Cancel / Confirm) to prevent accidents, then calls the existing `gift_shop_item` RPC directly — no full modal traversal. On success, toast "Sent *Bow* to Ella 💝" and remove the row optimistically if the recipient now owns it.
- Skip filtering by ownership on load — the RPC already rejects duplicates with `RECIPIENT_ALREADY_OWNS`, which we surface as a friendly toast.

### 5. Own-profile view
No gift button (obviously). The "Manage" pill in the header stays as-is. Wishlist section still hidden entirely when empty (rule from previous turn is preserved).

### Technical notes
- No schema changes. All new UI is purely presentational plus one existing RPC call.
- `ShopItemPreview` is a pure move-and-parameterize refactor; shop grid rendering must remain visually identical.
- The confirm popover reuses shadcn `Popover` so it renders above the profile card via portal (avoids clipping inside the profile modal — same pattern the profile card itself uses).
