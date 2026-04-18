

Plan for the remaining v0.2.5 fixes before the What's New modal + auto-update push.

## 1. Mobile (iOS PWA) push notifications

iOS only delivers push to a PWA when:
- App is added to Home Screen (✅ user did this)
- A service worker is registered AND
- A `PushSubscription` is created with the VAPID key AND
- That subscription is saved server-side AND
- The `send-push-notification` edge function is actually triggered on new messages

Need to audit and likely fix:
- `src/lib/webPush.ts` — confirm it actually subscribes on iOS, saves to `push_subscriptions`, and is called after permission grant on the mobile prompt path (`MobileNotificationPrompt.tsx`).
- `useMessages.ts` / wherever new messages are inserted — make sure we invoke the `send-push-notification` edge function for the recipient when they're offline / not focused. Right now it looks like nothing triggers it.
- `src/sw.ts` — verify it's actually registered in production for iOS standalone mode (not blocked by the iframe guard when running as installed PWA).

## 2. Mobile call functionality audit

Walk through `MobileCallOverlay.tsx`, `VoiceContext.tsx`, and the mobile chat header call buttons to confirm:
- Incoming call ring works on mobile (audio context unlock on iOS)
- Mic permission prompt fires on first call
- Camera toggle works in mobile overlay
- End-call button always visible (safe-area padding)
- Background-tab handling doesn't kill the call

Fix anything broken found in the audit.

## 3. Lower call ping / better connection

Two real levers:
- **TURN server region**: `get-turn-credentials` edge function likely returns a single region. Add a closer relay (Frankfurt / EU-Central) so Palestine routes ~40ms instead of ~90ms. Update the function to return multiple ICE servers; browser auto-picks the lowest-latency.
- **ICE config tuning**: in `VoiceContext.tsx` / `GroupCallContext.tsx`, set `iceTransportPolicy: "all"` (prefer p2p when possible — direct UDP is way lower ping than TURN relay), `bundlePolicy: "max-bundle"`, `rtcpMuxPolicy: "require"`, and enable `iceCandidatePoolSize: 4` for faster connection establishment.
- **Audio jitter buffer**: lower `playoutDelayHint` on inbound audio receivers to ~0.05s (50ms) for snappier real-time feel.

## 4. Desktop taskbar flash on notification (Windows)

Electron supports `BrowserWindow.flashFrame(true)` — exactly what Discord does. Wire up:
- In `electron/main.cjs`, add an IPC handler `notification:flash` that calls `mainWindow.flashFrame(true)` (auto-stops when window gains focus).
- In `electron/preload.cjs`, expose `electronAPI.flashFrame()`.
- In `src/lib/notifications.ts`, after `showNotification` in Electron path, also call `electronAPI.flashFrame?.()` so the taskbar icon flashes alongside the toast.

## 5. "Launch on PC start" setting (default ON, toggleable OFF)

Electron has `app.setLoginItemSettings({ openAtLogin: bool })`.
- `electron/main.cjs`: on first launch ever, default to `openAtLogin: true`. Add IPC handlers `autoLaunch:get` / `autoLaunch:set`.
- `electron/preload.cjs`: expose `electronAPI.getAutoLaunch()` / `setAutoLaunch(bool)`.
- New settings row in `src/components/app/SettingsModal.tsx` (under an existing "Desktop" or "Advanced" section) with the same switch styling as notification rows. Only render when `isElectron`. Reads/writes via the IPC bridge.

## 6. What's New modal for 0.2.5

- Append a new entry to `src/lib/changelog.ts` for `0.2.5` summarizing user-facing changes:
  - Window screenshare audio quality fix (clear, stereo)
  - Higher screenshare quality for viewers + maintain-resolution under load
  - Instant mute/deafen/camera indicators
  - Camera now visible to peers
  - Chat now lazy-loads (Discord-style scroll up to load older)
  - GIF replies show as "GIF" instead of long URL
  - Layout fixes for narrow / vertical monitors
  - Gaming Mode no longer hurts performance, doesn't bleed into calls
  - Lower-latency TURN routing
  - Taskbar flash on new desktop notifications
  - Launch on startup toggle
  - iOS PWA push notifications now working
- `WhatsNewModal.tsx` already auto-shows on version bump (the existing logic), so no UI rework needed.

## Files I'll touch

- `electron/main.cjs`, `electron/preload.cjs` — flashFrame + autoLaunch IPC
- `src/lib/notifications.ts` — call flashFrame on Electron toasts
- `src/components/app/SettingsModal.tsx` — Launch on Startup toggle
- `src/contexts/VoiceContext.tsx`, `src/contexts/GroupCallContext.tsx` — ICE tuning, jitter buffer
- `supabase/functions/get-turn-credentials/index.ts` — multi-region ICE servers
- `src/lib/webPush.ts`, `src/components/app/MobileNotificationPrompt.tsx` — iOS PWA subscription path
- `src/hooks/useMessages.ts` — trigger `send-push-notification` for recipient on new message
- `src/components/app/mobile/MobileCallOverlay.tsx` + audit pass — mobile call fixes
- `src/lib/changelog.ts` — 0.2.5 entry
- `package.json` — already at 0.2.5 ✅

Once approved I'll implement everything in one batch, then you run the rebuild command.

