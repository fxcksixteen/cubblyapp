# v0.4.20 — Hotfix, QoL, and Native Game Capture

## 1. Name icons cropped in the DM sidebar

Name decorations (bow, Hello Kitty, etc.) are drawn as an absolutely positioned image that hangs above and to the left of the name. In the DM sidebar the name sits inside a `truncate`/`overflow-hidden` row, so the decoration gets clipped.

Fix: give the name element enough room and stop clipping it.
- In `UserDisplayName`, reserve real space for the icon (left padding + top padding sized to the icon) instead of letting it overhang into the parent's clipped area.
- In `DMSidebar` (row list and bottom user panel), keep `text-overflow` truncation on the text span only, and let the wrapping row allow the decoration to render (`overflow-visible` on the immediate wrapper, truncation applied one level in).
- Apply the same wrapper pattern anywhere else the decorated name is inside a clipped row: chat message author line, member lists, search results.

## 2. Northern Lights shop preview not animating

The Aurora preview curtains animate with `cb-aurora-preview`, but the parent tile is `overflow-hidden` with `mixBlendMode: screen` + heavy blur, and the sweep is a small translate — with GPU acceleration off it reads as static.

Fix: rebuild the preview to match the other animated tiles — larger travel, added opacity/hue shimmer keyframe, staggered per-curtain durations, and a drifting star layer, using the same CSS-transform-only approach the rest of the previews use so it still animates without hardware acceleration.

## 3. Desktop app feels laggy while typing in DMs

Investigate and fix the re-render cost of the message composer. Planned work:
- Profile the chat view with React DevTools-style instrumentation: confirm whether each keystroke re-renders the whole message list.
- Move composer text into a local, memo-isolated component so keystrokes don't re-render `ChatView` and the message list.
- Memoize message rows and stabilize callbacks passed into them.
- Throttle typing-indicator broadcasts (send at most once per few seconds instead of per keystroke).
- Verify animated backgrounds/blur layers aren't repainting on every keystroke; isolate them onto their own compositing layer.

## 4. Make Honey a real recurring free plan (kaszy, fawnsly, geassbound)

Today those three rows have `current_period_end = 2126-07-01`, which is why billing shows "Renews 01/07/2126". Nothing rolls the period, so the monthly gems claim keys off the calendar month only.

Plan:
- Add a `complimentary` marker to `subscriptions` (a boolean column) and set it for these three accounts.
- Set their `current_period_end` to the next real monthly anniversary instead of 2126.
- Add a security-definer function that, when a complimentary subscription's period has passed, advances `current_period_end` by one month and keeps status `active` — i.e. it renews itself forever, for free.
- Call that roll function on app load (same place the gems claim runs), so the period is always current and the existing `claim_honey_monthly_gems` grants the 500 gems on each new cycle.
- Billing UI: show "Renews <real next date>" plus a small "Complimentary" badge, and label the next gems drop.

## 5. Roblox game detection

Verify against real logs rather than assuming. Planned work:
- Extend the log scan to also read the newest `*_Player_*.log` regardless of age window, and add the current join-flow markers Roblox emits (`joinGame`, `Connecting to`, `placeId`, `universeId`, teleport lines).
- Fall back to the Roblox presence API by place ID when the log parse finds a join but no name.
- Add a diagnostic line printed to the desktop console showing which log file and which matched line produced the result, so a bad detection can be reported concretely.

## 6. Native Windows game capture (DXGI/WGC)

Add a second native addon next to `native/win-audio-capture`, `native/win-video-capture`, using Windows Graphics Capture (WGC) with a DXGI fallback:
- Enumerates capturable windows/monitors and captures frames on the GPU.
- Delivers frames into the renderer as a `MediaStreamTrackGenerator`/`VideoFrame` source, replacing `getDisplayMedia` when the addon is present.
- Keeps existing simulcast/bitrate logic; the win is capture-side (no desktop compositor round trip, correct frame pacing at 60fps).
- Prebuild workflow mirrors the audio addon (`prebuildify --napi -t electron@41.0.0 --arch=x64`) and the same GitHub Actions prebuild job.
- Graceful fallback to the current path when the addon is missing or WGC is unsupported.

At the end I'll give you exact step-by-step commands to run on your PC to build, prebuild, and test the native module and produce the desktop installer.

## Release

Bump `package.json` to 0.4.20 and add a short user-facing changelog entry in `src/lib/changelog.ts`. No web publish.

## Technical notes

- Files touched: `src/components/app/UserDisplayName.tsx`, `src/components/app/DMSidebar.tsx`, `src/components/app/shop/ShopItemPreview.tsx`, `src/index.css`, `src/components/app/ChatView.tsx`, `src/components/app/settings/BillingSettings.tsx`, `src/contexts/GemsContext.tsx`, `electron/gameDetails.cjs`, `electron/main.cjs`, `electron/preload.cjs`, new `native/win-video-capture/*`, `src/lib/changelog.ts`, `package.json`.
- One DB migration: `subscriptions.complimentary` column, backfill for the three accounts, period reset, and the self-renewing roll function with GRANTs.
