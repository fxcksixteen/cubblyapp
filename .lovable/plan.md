

## v0.2.5 final batch — custom fullscreen viewer + call-pill order + mobile UX

### 1. Custom branded fullscreen screenshare viewer

Replace the native browser `requestFullscreen()` (which gives users the generic Windows/Chrome video controls — including the **pause button**, picture-in-picture, download, playback speed) with a custom in-app overlay.

**Why this fixes the pause issue:** native HTML5 video controls let viewers pause the inbound stream. There's no way to disable just "pause" while keeping native fullscreen. The only real fix is to never use native fullscreen — render our own.

**New component:** `src/components/app/FullscreenScreenShareViewer.tsx`
- Fixed `inset-0 z-[100]` overlay, pure black background, fade-in animation
- Uses the existing `MediaStream` from the screen video element (no re-negotiation)
- `controls={false}` — no pause, no PiP, no download
- Custom Cubbly-branded top bar:
  - Left: Cubbly logo + "Watching {sharerName}'s screen" + live red dot
  - Right: volume slider, picture-in-picture toggle (our own, opt-in), exit fullscreen button
- Bottom auto-hide bar (3s idle): mute/unmute viewer audio, fit/fill toggle, exit
- ESC key to exit
- Mouse-idle: hide cursor + bars after 2.5s, show on movement
- Smooth zoom-in entrance (`scale-95 → scale-100`, 200ms)

**Wire-up in `VoiceCallOverlay.tsx`:**
- Replace the two `el.requestFullscreen()` blocks (lines ~174-180 for screen, ~221-229 / ~287-291 for cam tiles) with `setFullscreenStream({stream, sharerName, type: "screen"|"cam"})` state
- Render `<FullscreenScreenShareViewer>` when state is set
- Same treatment for `GroupCallPanel.tsx`'s screenshare/cam tiles
- Mobile: `MobileCallOverlay` already has its own overlay so nothing to do there, but we'll add the same custom viewer for tile expansion on mobile too

### 2. Call-pill ordering bug

**Root cause** (`VoiceContext.tsx` line 1260): when the receiver accepts a call, code inserts a *local* call event with `startedAt: new Date().toISOString()` (receiver's clock, at accept time — minutes after the caller actually started). Meanwhile the realtime INSERT subscription (line 367) also adds the row with the **real** `started_at` from the DB. The local one wins because it's inserted first into local state, and any messages that arrived between caller-insert and receiver-accept end up timestamped *before* this fake value → they render above the pill.

**Fix:**
- Remove the manual `setCallEvents([...prev, { startedAt: new Date().toISOString() }])` insert at line 1257-1262. Let the realtime subscription be the single source of truth (it already fires on the receiver side with the real DB timestamp).
- Add a small dedupe guard: if `callEvents` already contains the id from realtime, the receiver doesn't double-insert.
- Defensive: in `ChatView.tsx` interleaver (line 378-385), also use `<= ts` instead of `> ts` so a pill and a message with identical ms always puts the pill first.

### 3. Mobile UX audit & fixes

Issues found scanning `MobileBottomNav`, `MobileCallOverlay`, `MobileChatHeader`, `MobileNotificationPrompt`, `AppLayout`:

- **Bottom nav clipped on iPhone Pro Max landscape**: `paddingBottom: env(safe-area-inset-bottom)` is right but missing `paddingLeft/paddingRight: env(safe-area-inset-left/right)` for landscape notch. Add those.
- **Mobile chat header back button hit area is 36px** — below iOS's 44px minimum recommendation. Bump to `h-11 w-11`.
- **Pull-to-refresh accidentally triggers** in chat scroll on iOS Safari → add `overscroll-behavior: contain` on the messages scroll container in `ChatView`.
- **Tap-to-zoom double-tap** on message text triggers iOS browser zoom. Add `touch-action: manipulation` on message bubbles.
- **Keyboard covers input** on iOS PWA when typing — switch the message composer container to use `100dvh` math + `visualViewport` listener so it stays above the keyboard. (Currently uses `100vh` which iOS doesn't shrink for keyboard.)
- **Bottom nav badge** for friend requests overlaps the icon awkwardly on small screens — reposition with `top-0.5 right-[30%]`.
- **Minimized call pill** at `bottom-20` collides with bottom nav on some viewports — anchor relative to nav instead with `bottom-[calc(64px+env(safe-area-inset-bottom))]`.
- **Long DM names** in mobile chat header overflow the back button — add `truncate` + `min-w-0`.
- **Settings modal on mobile** doesn't lock body scroll — add `overflow: hidden` on `<body>` while open.
- **Active tab indicator** in bottom nav is just color; add a 2px top border in primary color for clarity at a glance.

### 4. Files touched

- **NEW** `src/components/app/FullscreenScreenShareViewer.tsx`
- `src/components/app/VoiceCallOverlay.tsx` — swap native FS for custom viewer (3 spots)
- `src/components/app/GroupCallPanel.tsx` — same swap
- `src/contexts/VoiceContext.tsx` — remove receiver-side double-insert of call event (line 1257-1262 area)
- `src/components/app/ChatView.tsx` — defensive `<=` in pill interleaver
- `src/components/app/mobile/MobileBottomNav.tsx` — landscape safe-area, badge position, top-border indicator
- `src/components/app/mobile/MobileChatHeader.tsx` — 44px back button, name truncate
- `src/components/app/mobile/MobileCallOverlay.tsx` — minimized pill anchor
- `src/components/app/MobileNotificationPrompt.tsx` — already touched, no-op here
- `src/pages/AppLayout.tsx` — `100dvh` + visualViewport listener for keyboard
- `src/components/app/SettingsModal.tsx` — body-scroll lock on mobile
- `src/index.css` — `touch-action: manipulation` on `.message-bubble`, `overscroll-behavior: contain` on chat scroll
- `src/lib/changelog.ts` — add to existing v0.2.5 entry: custom branded fullscreen viewer (no more accidental pause), call-pill order fix, mobile polish pass

### 5. Quick answer to your Swift/iOS question

I'll include the answer in the implementation message — short version: very capable for a SwiftUI Discord-style app, can scaffold the whole thing in chunks, but Xcode + a Mac is required to actually build/sign/run it. Cubbly's design system, color tokens, and feature set translate cleanly to SwiftUI.

### 6. After

Once approved, I implement, then ship with the standard:
```
git pull && npm install && npm run build:electron && BUILD_TARGET=electron npx electron-builder --win nsis --x64 --publish always
```

