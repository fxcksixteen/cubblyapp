## 1. Fix the Cyber Grid theme

Rework `.cb-cyber-*` in `src/index.css`:
- Deeper, more coherent synthwave sky: `linear-gradient(180deg, #05010f 0%, #0a0325 40%, #2a0a55 65%, #ff2fbf 88%, #ffb15c 100%)` (no ugly abrupt pink band).
- Replace the current sun with a clean semicircle sitting on the horizon (mask off the bottom half) using pink→gold radial + crisp horizontal cut lines.
- Rebuild the grid: two perspective grids (major + minor lines) with neon-cyan `rgba(0,240,255,…)` and a soft magenta bottom glow; smoother scroll (`6s`), stronger perspective (`800px`, `60deg`), fade mask so lines dissolve at the horizon.
- Add a distant mountain silhouette layer under the grid.
- Keep `.cb-cyber-scan` but tone the opacity down so it isn't noisy.

Also update the matching preview in `ItemPreview` for `theme_cyber_grid` (~line 187) and the shop banner (line 574 area — only if it's the cyber card; it's currently space, leave that alone) so the in-shop preview mirrors the new look.

## 2. Keep motion name colors at the bottom of the Name Colors list

Root cause: the shop query orders by `price` ASC first (line 316). Premium animated items have `price = 0` (gems-only), so they get pulled above coin-priced static/gradient colors.

Fix in `ShopView.tsx` catalog load: order by `sort_order` ASC first, then `price` ASC as a tiebreaker. This keeps animated items (sort_order 2010+) below the existing static/gradient items across every tab without touching migrations.

## 3. Featured-card carousel with 3 more cards

Convert the three static banner cards at `ShopView.tsx` ~lines 568–614 into a horizontal carousel:
- Container becomes a horizontally scrollable strip using `embla-carousel-react` (already installed via `src/components/ui/carousel.tsx`).
- Show 3 cards per view on desktop (`basis-1/3`), 2 on tablet, 1 on mobile — same visual size as today.
- Add left/right arrow buttons that advance by exactly one card (`api.scrollNext()` / `scrollPrev()` with `slidesToScroll: 1`, `align: "start"`).
- Arrows are small circular buttons floating on the sides of the strip, hidden when there's nothing further to scroll.
- Add 3 new cards to the right of the existing 3, so 6 total in this order:
  1. Space Theme (existing)
  2. Motion Name Colors (existing)
  3. Earn Coins (existing)
  4. **Cosmic Nebula** — swirling purple/pink nebula preview → `setActiveTab("theme")`
  5. **Aurora Borealis** — animated green/teal curtain preview → `setActiveTab("theme")`
  6. **Premium Motion Names** — pink→purple animated gradient preview showcasing the new Bow color → `setActiveTab("name_color")`

Each new card mirrors the existing aspect-video, rounded-2xl, gradient-overlay style so nothing looks out of place.

## 4. New premium name color: "Bow"

New migration `INSERT` into `shop_items`:
- `id`: `name_color_animated_bow`
- `category`: `name_color`, `subcategory`: `animated`
- `name`: `Bow`, `description`: `A soft pink-to-purple motion gradient with a tiny cute bow tucked in the corner.`
- `price`: `0`, `price_gems`: `1500`
- `config`: `{ gems_only: true, style: "sweep", duration: "5s", stops: ["#f9a8d4","#ec4899","#a855f7","#7c3aed","#ec4899","#f9a8d4"], bow: true }`
- `sort_order`: `2100` (below all other animated names so it appears last, per rule #2).

## 5. Render the tiny bow on the "Bow" name color

Extend the animated-name rendering paths so that when `config.bow === true`, a very small `imgPetite` (the Cute 3D bow badge, already imported) is absolutely-positioned at the top-left of the name text, roughly `-6px` up / `-4px` left, `10–12px` tall, `pointer-events:none`, `z-10`, with a subtle drop-shadow.

Files to touch:
- `src/components/app/ShopView.tsx` → `ItemPreview` animated branch (wrap the `<span>` in a `relative` container and conditionally render the bow img).
- `src/components/app/settings/ShopItemsGrid.tsx` → same treatment in its `ItemPreview` animated branch so the Settings preview matches.
- `src/components/app/UserDisplayName.tsx` → when an animated name color has `config.bow`, render the bow absolutely-positioned over the name in chat/profile/etc. Keep it purely decorative (aria-hidden).

## 6. Purchase button copy

No change needed — `gems_only` items already render the "Gems Only" purple button via existing code, so the 1,500-gem price will display correctly with no coin fallback.

## Technical notes

- No app version bump, no changelog edit (per project rules).
- Migration is data-only (INSERT … ON CONFLICT DO UPDATE); no schema changes.
- Cyber CSS edits are scoped to `.cb-cyber-*` classes so no other theme is affected.
- Carousel uses the existing `embla-carousel-react` dep — no new packages.
