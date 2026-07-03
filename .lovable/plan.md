## v0.4.3 tightening pass 2

Four separate issues, all frontend-only. No version bump, no DB changes.

---

### 1. Screenshare FPS is capped below what the user picked

In `VoiceContext.tsx` around line 2772 there's a per-resolution FPS ceiling:
- ≤480p → forced to 15
- ≤720p → forced to 24
- else → user's chosen fps

So if the user picks 30 fps but 720p (or a preset that resolves to 720p), it silently sends 24 — and after further scale-down and encoder pressure the viewer sees ~15. This is why "30 fps" looks like a slideshow even after the choppiness fix.

**Fix:** honor the user's selected fps at 720p and above (only clamp at ≤480p, and even there raise the floor to 20). Keep `contentHint = "motion"` when Optimize-For-Motion is on so the encoder trades resolution for framerate instead of the other way around. Add a one-line diag log showing "requested Xfps, negotiated Yfps" so future regressions are visible.

---

### 2. Wishlist shows "Petite" instead of "Cute"

`ShopView` and `ShopItemsGrid` already remap `badge_petite → { name: "Cute", description: ... }` client-side (v0.3.17). `UserProfileCard.tsx` (line 137-145) hydrates wishlist rows straight from `shop_items` without that remap, so on someone else's profile the wishlisted badge still reads "Petite".

**Fix:** apply the same remap in `UserProfileCard`'s wishlist mapper.

---

### 3. Premium animated themes don't render in the desktop app when HW-accel is off

Themes that still work with software rendering (Space, Sky, Snowy, Hills) use only `transform` + `background-position` animations — cheap on CPU.

Themes that don't render (Cosmic Nebula, Cyber Grid, Volcanic, Bioluminescent Abyss, Aurora Borealis, Sakura Storm) all lean on:
- `filter: blur(38–60px)` on full-screen layers
- `mix-blend-mode: screen`
- `drop-shadow()` filter animations

Chromium's software rasterizer effectively can't paint these at interactive framerates — the layers get dropped or freeze. That's why previews look completely dead when HW accel is off.

**Fix:** detect "software rendering mode" and swap those six themes to a lightweight static-fallback variant while keeping the fancy version for GPU users.
- Electron main process already knows the HW-accel setting; expose it via `electronAPI.getHardwareAcceleration()` (already exists per `main.cjs` line 476) and set `document.documentElement.dataset.gfx = "software"` on boot when it's off.
- Add `[data-gfx="software"] .cb-nebula-glow, .cb-aurora-curtain, .cb-abyss-jelly, .cb-volcanic-glow, .cb-cyber-scan, .cb-sakura-petals { filter: none; mix-blend-mode: normal; animation: none; }` style guards, and provide a simple gradient fallback so the theme still visually reads as its brand color palette.
- Same guard applied inside the shop *previews* (`ShopItemPreview`) so the tile isn't a dead black square.

This is not a "make it identical without a GPU" fix — that's impossible with those effects. It's "the theme still looks like itself as a static/soft-animated version" so previews and the equipped background never render as nothing.

---

### 4. Advanced game activity (Valorant / Fortnite / Roblox / Marvel Rivals) not visible publicly

Pipeline is wired correctly (`electron/gameDetails.cjs` → `electronAPI.getGameDetails` → `activity_details` table → realtime subscription → `ActivityCard` render). DB grants + RLS are correct. So the failure is at the parser level: either the log path is wrong for the current game version, or the regex doesn't match what the game actually writes.

Since I can't run these games in the sandbox to confirm the current log format, the plan is:

1. **Add a `[game-details]` diag channel** (main-process console + renderer console when devtools are open) that logs: which parser ran, which log/lockfile path it read, and whether it returned a payload or null. This makes it obvious *why* nothing shows up when the user next tests.
2. **Widen the parsers** with the patterns most likely to hit current versions:
   - Valorant: also try `Loading map .*Maps/([A-Za-z]+)/` and the `Game state:` line.
   - Roblox: also try `Report game_join_loadtime` (contains placeId + universeId in modern logs) and the `Connecting to game '…'` line.
   - Fortnite: also try `MatchState[:=]\s*(\w+)` and `PlaylistName[:=]`.
   - Marvel Rivals: also read the newer `MarvelGame\Saved\Logs\MarvelGame.log` path in addition to `Marvel\Saved\Logs`.
3. **LoL:** call the live-client endpoint on the `HTTPS 2999` route with the `riotgames.pem`-style cert-ignore path (already correct) but also fall back to `/liveclientdata/activeplayername` when the full payload 404s during loading screens.
4. Keep every parser wrapped in try/catch — a broken regex must never break the activity tick.

After this ships, if a specific game still shows no details, the console will name exactly which parser failed and where, and I can patch that one regex without another exploration round.

---

### Files touched

- `src/contexts/VoiceContext.tsx` — screenshare fps floor
- `src/components/app/chat/UserProfileCard.tsx` — wishlist Petite→Cute remap
- `src/index.css` — `[data-gfx="software"]` fallbacks for six premium themes
- `src/components/app/shop/ShopItemPreview.tsx` — mirror the same fallback in previews
- `src/main.tsx` (or a small `useGfxMode` bridge) — set `data-gfx` from `electronAPI.getHardwareAcceleration()`
- `electron/preload.cjs` — expose `getHardwareAcceleration` if not already whitelisted
- `electron/gameDetails.cjs` — wider regexes + `[game-details]` diag logs
- `src/lib/changelog.ts` — one-line bullets for the four fixes

### Out of scope

- TURN (confirmed not needed for home wifi).
- Full glare / perfect-negotiation refactor.
- Any DB / RLS / schema change.
