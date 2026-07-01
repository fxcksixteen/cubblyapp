## Fixes

### 1. Bioluminescent jellyfish look nothing like jellyfish
In `src/components/app/ShopView.tsx` (theme_bioluminescent preview, ~L220-247), replace the current blurry blob divs with real jellyfish shapes rendered as inline SVGs:
- Dome-shaped translucent bell (rounded top, wavy scalloped bottom edge) with a soft inner glow gradient
- 4–5 wispy trailing tentacles below the bell, drawn as slightly curved thin lines with fading opacity
- Bell gently pulses (subtle scaleY 1 → 0.9 → 1) via a new `@keyframes cb-jelly-pulse` in `src/index.css`
- Tentacles sway (skewX ±3deg) via a second keyframe
- Keep the existing rise animation and cyan/teal tint palette, but reduce blur so the shape reads clearly

Add matching `@keyframes cb-jelly-pulse` and `cb-jelly-sway` in `src/index.css` near the existing `cb-jelly-rise-preview` block (~L572).

### 2. Duplicate "Message Requests" title on /requests
In `src/components/app/MessageRequestsView.tsx` (L93-105), remove the internal header block (the envelope icon + "Message Requests" H2 + red count badge). The topbar in `AppLayout.tsx` (L320) already renders "Message Requests" as the page title, so the in-view header is redundant. Keep the body/list untouched.

### 3. Message Requests inbox button visible while already on /requests
In `src/pages/AppLayout.tsx` (L767-780), change the visibility guard on the inbox button from `!isServerRoute` to `!isServerRoute && !isRequests` so it's hidden when `activeView === "requests"`. `isRequests` is already computed on L168.

No version bump, no changelog changes (per Core memory — user didn't ask).