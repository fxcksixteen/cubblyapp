# Cubbly iOS v0.1.7

Scope is iOS-native only (`ios-native/`). No web/desktop changes. Tackled as one cohesive release.

## 1. Calls (still broken)
- Add verbose logging across `WebRTCClient`, `CallSignaling`, `CallStore`, `CallKitService` so we can see exactly where the flow dies (signaling channel join, offer/answer exchange, ICE, CallKit reporting).
- Verify TURN credentials fetch path on device, and that the mic permission prompt actually fires before peer connection setup.
- Re-test 1:1 audio call path end-to-end; fix whichever stage logs reveal (most likely missing CallKit `reportNewIncomingCall` on push, or peer connection never getting remote SDP).
- This is the highest-risk item — may need a follow-up pass once first round of logs comes back.

## 2. Note attachments don't actually attach
- In `NotesView.swift` / `NotesStore`, the iOS picker currently shows an image but never uploads it to `notes-attachments` storage nor appends the attachment id to the note's encrypted body the way web does.
- Mirror the web flow: encrypt blob with per-file key + IV → upload to `notes-attachments/<user_id>/<note_id>/<uuid>.bin` with IV in `user_metadata` → append attachment reference into note content → re-encrypt + save note.
- On render, decrypt + sniff MIME the same way web does (matches the fix we already shipped to web).

## 3. Notes — full link support
- Make sure URLs in note bodies on iOS render as tappable links (open in Safari), matching web/desktop behavior. Use `AttributedString` with automatic link detection in the note viewer/editor render path.

## 4. Notes — hide bottom tab bar when a note is open
- Wrap the open-note destination so `MainTabView`'s `TabView` bar is hidden while a single note is being viewed/edited (use `.toolbar(.hidden, for: .tabBar)` on the destination).

## 5. Chat composer — new plus/X attachment flow
Redesign the `+` button in `ChatView` message input:
- Tap `+` → smoothly rotates 45° into an `×` (spring animation).
- Opens a small action sheet/menu with: **Photo Library**, **Attach File**, **GIF** (keep existing Giphy entry), maybe **Camera** later.
- **Photo Library** → presents a half-height sheet (`.presentationDetents([.medium, .large])`) previewing recent photos/videos from `PHPhotoLibrary`, multi-select supported.
- Top-right button label is **Attach** (not Send) — dismisses the sheet and stages the selected items as pending attachments above the input.
- User can then type a caption and hit Send to post text + attachments together (currently attachments send alone). Update send pipeline to accept `(text, [attachments])`.

## 6. Chat media optimization
- Run images through `AttachmentCompressor` before upload (downscale large dimensions, re-encode to HEIC/JPEG ~80% quality, strip EXIF).
- Generate + upload a small poster/thumbnail for videos so chat threads load fast; lazy-load full video only on tap.
- In `SignedAttachmentView`, use the thumbnail first and fade to full-res, with proper `AsyncImage`-style caching so scrolling back doesn't re-fetch.

## 7. Server sidebar unread blips not clearing properly
- In `ServerRail.swift` (iOS equivalent of web `ServerSidebar`), the red unread dot lingers after opening the conversation. Hook clear-on-view into the same `UnreadCountsStore` mutation the web app uses (mark conversation read on `ChatView.onAppear` AND on returning to the DM list), and force a SwiftUI refresh.

## 8. Server sidebar `+` button on mobile
- Replace the current behavior with a Cubbly-branded modal sheet: rounded card, Cubbly logo, copy along the lines of *"Servers aren't on Cubbly iOS just yet — stay tuned!"*, single dismiss button. No server-create flow on iOS for now.

## 9. Space theme background on app
- The Space theme is selectable but the animated background (matching the Shop preview) never renders behind the app. Wire `SpaceThemeAnimated` from `AnimatedThemeGradient.swift` into `RootView` as a background layer when `ThemeStore.current == .space`, sitting behind the main `TabView`.

## 10. Three new animated themes — Sky Dusk, Moonlit Hills, Snowy Drift
For each:
- Build a SwiftUI animated view (mirroring the web `cb-sky-bg`, `cb-hills-bg`, `cb-snowy-bg` CSS animations) using `TimelineView` + `Canvas` so animations actually run.
- Hook into the Shop tab preview tile so users see the live animation before equipping.
- Hook into `RootView` background layer (same mechanism as Space) so equipping actually applies the animated background app-wide.

## Technical notes
- All iOS animated backgrounds go through `TimelineView(.animation)` — `withAnimation` on gradient stops is a no-op (already documented in `AnimatedThemeGradient.swift`).
- Photo library access needs `NSPhotoLibraryUsageDescription` in `Info.plist` (verify it's there).
- Note attachment encryption must read/write IV in storage `user_metadata` — matches the recent web fix so iOS uploads stay recoverable.
- No DB migrations expected; this is all client work in `ios-native/`.

## Out of scope
- Web/desktop changes.
- Server creation on iOS (deferred, replaced with the "coming soon" modal).
- Recovering the 10 older `.bin` note attachments (already established as unrecoverable).
