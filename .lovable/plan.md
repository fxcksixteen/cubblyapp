## v0.4.19 — major QoL + hotfix

### 1. Gifting & shop UX
- **Message-input gift menu** (`ChatView.tsx`): replace the 🍯 and 🎁 emoji with the existing SVG assets — `src/assets/icons/honey.svg` for "Gift Honey" and `src/assets/icons/shop.svg` for "Gift a shop item" (tinted like the other input icons, no emoji anywhere in that popover).
- **Rebuild `GiftItemModal`** into a clean shop-style picker:
  - Search field for shop items (name + description), category filter chips (Name colors / Themes / Badges), wishlist items pinned first with the existing "Wished" tag.
  - Grid of item cards using the same `ShopItemPreview` component the real shop uses, so gifts show the actual visual instead of a bare text row.
  - Select item → confirm step with the optional note and the gem cost + balance, instead of a note box floating above the list.
  - Owned filtering hardened: items the recipient already owns are excluded from the list (already partly done) **and** re-checked at send time, with `RECIPIENT_ALREADY_OWNS` surfaced clearly. Same owned-guard applied in `GiftSendModal` and the profile-card gift path.
  - Empty/loading/insufficient-gems states styled consistently.
- **Prices are not changed** — gem-only items keep their gem price, coin items keep the `max(20, coins/10)` gift conversion that the backend enforces. Work here is correctness/UX only, and the modal will always display the exact number the RPC will charge.

### 2. Profile modals bigger
- `UserProfileCard.tsx` (and the popup variant in `ProfilePopup.tsx`): increase card width (~360px → ~480px) and vertical room; banner height grows (88px → ~150px in the profile card, proportionally in the popup) so banners show more of the image. Avatar/name offsets re-tuned so nothing overlaps.

### 3. Roblox detection
- `electron/gameDetails.cjs` `parseRoblox()`: when no place join is found, return launcher state; when a real place/universe is found, return the experience.
- Activity publishing (`src/contexts/ActivityContext.tsx`): Roblox becomes `activity_type: "using"` (→ "Using Roblox", subtitle "In Launcher") while only the launcher is detected, and flips to `"playing"` with the experience name once a real game join is detected. Because coin earning keys off `isSoftwareActivity`, launcher-only Roblox stops paying out coins.
- Widen the join detection: also scan `%LOCALAPPDATA%\Roblox\logs` for `*_Player_*` logs by recency regardless of the 12-newest slice, and add the current client log lines (`[FLog::Output] ! Joining game`, `GameJoinLoadTime`, `join_game` telemetry) so real games are actually detected.

### 4. Right-click menus in friends views
- Wire the existing `MemberRowMenu` (message / call / profile / add-or-remove friend / block / unblock, context-appropriate per tab) onto rows in `FriendsView.tsx` for `/online`, `/all`, `/pending` and `/blocked`.

### 5. DM sidebar search bar
- `SearchBar.tsx`: include group conversations as first-class results — show the group's real name (or member-name fallback exactly like the sidebar) and render `GroupAvatar` (stacked member pictures) instead of a single member's avatar.
- De-duplicate: a friend who is only present via a group no longer appears as a separate repeated row, and avatar rendering uses the same component as the sidebar so broken/odd-looking pictures are fixed.

### 6. Custom status in the bottom user panel
- Under the display name, show the custom status (emoji + text) when one is set instead of the username; on hover, the status slides/fades down and the username slides/fades back up (CSS transition, both stacked in a fixed-height container so nothing shifts).
- Custom status data is loaded/subscribed in one place and shared, so setting/clearing/expiry from `CustomStatusModal` updates the panel, the profile popup and profile cards immediately.

### 7. Attachment "+" menu
- Convert the ad-hoc absolutely-positioned menu in `ChatView.tsx` to a Radix `Popover` anchored to the "+" button with `side="top"`, aligned directly above the message input, with the same fade/scale-in animation the other popovers use and click-outside / Escape to dismiss cleanly.

### 8. Profile popup transparency with the Space theme
- The popup panel uses `var(--app-bg-tertiary)`, which the Space theme makes translucent. Give the popup an opaque solid surface (theme-aware solid token + backdrop) so it is never see-through, matching how the settings menus render.

### 9. User panel spanning both sidebars (Discord-style)
- `AppLayout.tsx` (desktop): restructure the left region into a vertical column — top row = server rail + DM/server sidebar, bottom row = a single full-width `UserPanel` that spans both. `DMSidebar`/`ServerSidebar` stop rendering their own copies of the panel; the shared `UserPanel` gains the extra controls the DM copy has today so nothing is lost. Mobile layout unchanged.

### 10. Server member list grouping
- `ServerView.tsx` members panel: split into `ONLINE — n` and `OFFLINE — n` sections (using `getEffectivePresenceStatus` + `onlineUserIds`, invisible counted as offline for others), offline rows dimmed, matching Discord.

### 11. Game streaming (both diagnosis + retune, no forced settings)
- **Stats overlay**: a screenshare diagnostics readout (encoder implementation hardware/software, resolution, fps, target vs actual bitrate, `qualityLimitationReason`, RTT) available from the call UI, sampled from `getStats()`.
- **Game path retune** in `screenShareEncoding.ts` / `VoiceContext.tsx` / `GroupCallContext.tsx`:
  - Single high-quality layer (no simulcast) for game/motion shares, so the encoder budget isn't split.
  - Relax the RTT backoff further (only react to sustained congestion, not spikes) and raise the floor.
  - **Strictly honour the user's picked resolution/fps** — if they chose 30 fps or 720p, nothing in the pipeline raises it; the automatic logic may only reduce bitrate, never change the framerate/resolution the user selected.

### 12. Release
- Bump `package.json` to `0.4.19` and add a short user-facing `changelog.ts` entry (one-liners, desktop patch — no web publish).

### Technical notes
- Files touched: `ChatView.tsx`, `GiftItemModal.tsx`, `GiftSendModal.tsx`, `chat/UserProfileCard.tsx`, `ProfilePopup.tsx`, `UserPanel.tsx`, `DMSidebar.tsx`, `ServerSidebar.tsx`, `ServerView.tsx`, `FriendsView.tsx`, `SearchBar.tsx`, `pages/AppLayout.tsx`, `contexts/ActivityContext.tsx`, `electron/gameDetails.cjs`, `lib/screenShareEncoding.ts`, `contexts/VoiceContext.tsx`, `contexts/GroupCallContext.tsx`, `lib/changelog.ts`, `package.json`.
- No database migrations are required; gifting already enforces ownership and pricing server-side.
