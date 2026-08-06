# Cubbly iOS v0.1.9

## First: the repo is missing most of the iOS app

You were right that you sent the whole folder — the archive does contain it. The problem is on my side: the sync last time only landed part of it.

- Your upload contains **107 Swift files**.
- The repo currently has **35**. `Core/Models`, `Core/Repositories`, `Core/Services`, `Core/Theme`, and every `Features/` subfolder (Call, Chat, DMs, Friends, Notes, Settings, Shop, You) are empty directories.

Everything below lives in those missing files, so step 1 is restoring them from your archive (which is still available in the sandbox) and verifying the file count matches before any edits.

---

## 1. Voice calls never connect

Symptom: caller sits on "Calling", no audio either direction, and at 30s it flips to "Not in call" even after the other side picks up.

What that pattern means: the SDP offer/answer handshake never completes, so the 30s ring timeout fires while both sides think they're waiting on the other.

I have not confirmed the exact break point — that needs a real trace, not a guess. So this is split into diagnose-then-fix:

**a. Instrument the handshake first.** Add a compact `[CallTrace]` log line at every step on both sides (channel joined, ring sent, ready-for-offer sent/received, offer sent/received, answer sent/received, ICE state changes), stamped with the call event id. Mirror the naming the web app already uses so the two logs can be read side by side.

**b. Fix the cross-platform gaps that are already visible in the code:**
- The web app broadcasts a `peer-accepted` signal when someone answers; iOS neither sends it nor handles it. On iOS→web calls, the caller never gets the "they picked up" ack. Add both directions.
- iOS drops any `ready-for-offer` that arrives within 1 second of the last offer it sent. The web app sends a pre-accept `ready-for-offer` immediately followed by a real one on accept — the second, meaningful one lands inside that window and is discarded. Replace the blanket time window with per-call-event deduplication so a genuine retry is never swallowed.
- iOS's caller-side fallback offer waits 5 seconds; with the 30s timeout that leaves very little room for a second attempt. Send the first offer as soon as the peer joins the call channel and retry on a short interval instead.
- Make the 30s timeout stop killing the outgoing state when the peer is provably present (participant row alive) — keep waiting on media instead of flipping to "Not in call".

**c. Verify with a real call** using the trace output before calling it done.

## 2. Ring sound cuts off after ~1s; hang-up sound plays twice

- The ring: the call code starts the looping ring tone, then a moment later reconfigures the shared audio session for WebRTC. That session takeover stops the ring player. Fix by configuring the call audio session **before** starting the tone, and playing call rings through that same session rather than the ambient one used for chat dings.
- The double hang-up: the leave sound is played inside the single end-call routine, which is reachable both from the in-app End button and from the iOS system call UI's end action — both fire on one hang-up. Make the end-call routine idempotent so teardown (and its sound) runs exactly once per call.

## 3. iOS users show as offline

Confirmed root cause: the `presence_heartbeat` database function only marks a device alive when it's given a session key, and it never touches the profile's last-seen field. Web and desktop register a session row and heartbeat with its key. iOS calls the function with no key and never registers a session row — so nothing on the server ever marks an iOS device online.

Fix on the iOS side (no schema change needed):
- Register a `user_sessions` row on sign-in with a stable per-install key, labelled "Cubbly for iOS", marked as a mobile device.
- Heartbeat with that key on the existing 30s timer, and again on every foreground.
- Clear the row on sign-out.

Side benefit: the iPhone now appears in the Devices list on web/desktop.

## 4. Themes, name colors, and gems parity

- **Themes:** iOS hard-codes 12; the shop has 18 active. Missing: Cosmic Nebula, Cyber Grid, Volcanic, Bioluminescent, Northern Lights, Sakura Storm. Add gradients, palettes, and the animated backgrounds for each so they match web.
- **Name colors:** iOS renders static/gradient/animated configs generically but the shop's 11 gem-priced animated colors (Stardust, Prism, Plasma, Phoenix, Ocean Mist, Neon Pulse, Holographic, Solar Flare, Cotton Candy, Hello Kitty, Bow) need their animation styles and any artwork ported.
- **Gems:** iOS has no gems at all — the Shop is coins-only. Add a gems balance store, the 3D gem icon and balance chip next to the coin chip, gem prices on shop cards, the gem purchase path, and gem-only filtering. Gem top-up purchases (Stripe) stay out of scope for this patch unless you want them; iOS in-app purchase rules make that its own project.

## 5. The You tab's settings are placeholders

Ten of the settings screens are single "this lives on desktop" cards. Replace them with real iOS settings:

- **Chat** — message grouping, font size, emoji style, link previews, GIF autoplay, send-on-return.
- **Accessibility** — reduce motion, high contrast, larger tap targets, in-app text scale (on top of Dynamic Type).
- **Content & Social** — who can DM you, friend request filtering, blocked users list with unblock.
- **Data & Privacy** — activity status, read receipts, typing indicators, cache size and clear cache.
- **Devices** — live list of your signed-in sessions with device name, last seen, and sign-out (now populated by the fix in section 3).
- **Language & Time** — 12/24h clock, timestamp format, plus the link to iOS language settings.
- **What's New** — read the shared changelog instead of a hard-coded blurb.
- **Gaming Mode / Keybinds / Advanced** — these genuinely have no iOS equivalent. Rather than three empty cards, fold them into one short "Desktop features" note at the bottom of the settings list and drop them as separate tabs.

## 6. Version and release

Bump to **0.1.9** in `CubblyConfig.swift`, `project.yml`, and `Info.plist` (all three, kept in sync), and add the v0.1.9 entry to the What's New screen.

---

## Technical notes

- Restore path: extract the archive already present in the sandbox and sync `Sources/`, excluding `.git`, `build/`, `DerivedData/`, and the generated `.xcodeproj`; assert the Swift file count afterwards.
- Files in play: `Core/Services/CallStore.swift`, `CallSignaling.swift`, `CallKitService.swift`, `SoundService.swift`, `PresenceService.swift`, `ThemeStore.swift`, `NameColorsStore.swift`, `ShopStore.swift`, a new `GemsStore.swift`, `Features/Shop/ShopView.swift`, `Features/Settings/*`, `Features/You/YouView.swift`.
- No database migration is required. The presence fix is entirely client-side: iOS starts using the session-key path the other clients already use.
- Signaling stays wire-compatible with `src/contexts/VoiceContext.tsx` — same channel names, same single `voice-signal` event, same lowercase UUID keys.
