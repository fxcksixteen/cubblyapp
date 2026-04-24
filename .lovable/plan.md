# Fix Plan for v0.2.24 Stability Regressions

## What will be fixed

1. **Presence / status indicators everywhere**
   - Replace the web/desktop presence channel setup with a single shared global presence room.
   - Keep initial snapshot hydration so already-online users appear immediately.
   - Verify all status consumers still use the effective-status helper correctly.

2. **Chat unread indicators inside chat pages**
   - Stop marking conversations read immediately on chat open.
   - Preserve unread state until the user actually reaches the bottom, clicks **Mark as Read**, or sends a reply/message.
   - Reconnect the top blue bar and red `NEW` divider to the real unread snapshot taken on entry.

3. **Screenshare fullscreen controls**
   - Move the custom fullscreen chrome so it anchors to the rendered stream frame, not the app viewport edges.
   - Make the controls reliably clickable.
   - Split **stream audio controls** from **user audio controls**:
     - avatar/right-click stays user-level
     - right-clicking the shared stream opens stream-level controls
     - fullscreen stream slider controls the stream audio itself, not the person’s entire call audio
   - Wire the 1-on-1 fullscreen viewer to receive the remote stream owner ID/context too, so it behaves the same as group calls.

4. **iOS PWA Voice & Video settings crash**
   - Harden all device select values against stale/empty values from old local storage and Safari device enumeration.
   - Sanitize loaded voice settings so empty strings are converted to safe defaults before the panel renders.
   - Keep the existing iOS capture-lock behavior, but make the panel render safely even when device data is incomplete.

5. **iOS PWA call audio still silent**
   - Add an iOS-safe remote audio fallback so call audio does not depend on the desktop-style Web Audio gain path.
   - Keep the current autoplay/gesture re-arm logic, but prevent iOS from ending up with a muted hidden element while the gain graph is ineffective.
   - Apply the same fallback to both 1-on-1 and group calls.

## Root causes found

- **Presence is broken because the web app is joining unique per-tab presence channel names** (`online-presence:<random>`) instead of one shared room. That isolates each client, so everyone looks offline.
- **Unread indicators are broken because chats are being marked read as soon as they open** in `useUnreadCounts`, before `ChatView` can capture the unread-on-entry snapshot. That zeroes out both the blue bar and red divider.
- **Fullscreen stream controls are still user-level controls** because the viewer is wired to the shared per-user gain API. The stream right-click also opens `UserVolumeMenu`, not a stream menu.
- **The iOS settings crash is likely from stale invalid select state**, not just current device filtering. The render path needs value sanitization before Radix Select mounts.
- **The iOS silent-call bug likely persists because the current remote-audio path still relies on the peer gain graph**. On iOS PWA, that can leave the hidden audio element muted while the graph is not reliably producing audible output.

## Implementation steps

1. **Presence fix**
   - Update `src/contexts/AuthContext.tsx` to join a stable shared channel (matching the native app’s `global:online` behavior).
   - Keep `.on(...)` before `.subscribe()`.
   - Track the user after subscribe and hydrate from `presenceState()` immediately.
   - Make cleanup deterministic so StrictMode/HMR doesn’t duplicate subscriptions.

2. **Unread indicator fix**
   - Remove the auto-mark-read-on-open effect in `src/hooks/useUnreadCounts.ts`.
   - Let `ChatView.tsx` remain the owner of read dismissal timing.
   - If needed, expose a shared `markConversationRead` helper so sidebar badges and chat indicators stay in sync from one code path.

3. **Stream-specific audio controls**
   - Extend the audio-control layer so it can address `mic` and `screen` separately.
   - Add a dedicated stream menu component for remote screenshares.
   - Update `FullscreenScreenShareViewer.tsx`, `VoiceCallOverlay.tsx`, and `GroupCallPanel.tsx` so stream right-click and slider target the stream track.
   - Reposition overlay chrome inside the actual stream frame container.

4. **iOS PWA settings hardening**
   - Sanitize loaded values in `VoiceContext` when reading local settings.
   - Add device-option normalization in `VoiceVideoSettings.tsx` for inputs, outputs, and cameras.
   - Guard every `Select` root with a guaranteed valid value.

5. **iOS PWA call-audio recovery**
   - Add an iOS branch in the peer audio pipeline so remote audio can stay element-driven instead of graph-driven when needed.
   - Keep desktop/web behavior unchanged.
   - Apply the same safeguard to screen-share audio elements.
   - Re-check deafen/output-volume interactions so they don’t remute remote audio on iOS.

6. **Version handling**
   - Keep this inside **v0.2.24**. No version bump.

## Technical details

Files likely involved:
- `src/contexts/AuthContext.tsx`
- `src/hooks/useUnreadCounts.ts`
- `src/components/app/ChatView.tsx`
- `src/lib/peerGain.ts`
- `src/components/app/FullscreenScreenShareViewer.tsx`
- `src/components/app/UserVolumeMenu.tsx` or a new stream-specific companion menu
- `src/components/app/VoiceCallOverlay.tsx`
- `src/components/app/GroupCallPanel.tsx`
- `src/contexts/VoiceContext.tsx`
- `src/contexts/GroupCallContext.tsx`
- `src/components/app/settings/VoiceVideoSettings.tsx`

If you approve this, I’ll implement these fixes directly and keep the patch on **0.2.24**.