# v0.1.7 — round 3 fixes

Six concrete iOS-only changes. No backend / schema changes.

## 1. DM quick-menu = half-sheet, not full

`DMListView.swift` opens `DMQuickMenuSheet` with `.presentationDetents([.large])`. Change to `.medium` as the default detent (with `.large` as a stretch option) and keep the drag indicator so it lifts like Discord's branded quick menu.

```text
DMListView.swift:120  .presentationDetents([.medium, .large])
                          → default lands on .medium
```

## 2. Native full-screen edge swipe on chat thread + DM sidebar

`NativeEdgeSwipeBackEnabler` exists but currently:
- Only sets `interactivePopGestureRecognizer.isEnabled = true` once in `makeUIViewController`.
- Sets itself as the recognizer delegate, which on a hidden nav bar actually *blocks* the pop gesture in some iOS builds (UIKit refuses to begin the gesture if the recognizer's delegate returns false and there's no visible back button).

Fixes inside `NativeEdgeSwipeBack.swift`:
- Stop overriding the delegate. Leave UIKit's default delegate in place — it knows how to honour a hidden nav bar when `interactivePopGestureRecognizer.isEnabled = true`.
- Re-assert `isEnabled = true` from `updateUIViewController` as well, because SwiftUI rebuilds the host during nav transitions.
- Expand the gesture region to the full leading half of the screen with a custom `UIScreenEdgePanGestureRecognizer` mirroring iOS's native pop (Personal Notes works because it never hides its system nav bar; the chat header replaced ours, which is what disabled the swipe).

Then attach `.nativeEdgeSwipeBack()` to:
- `ChatView` root (already attached — confirm it survives the new custom header).
- `NotesView` root (already inherited, no-op).
- The DM list rows' pushed destinations are SwiftUI-managed, but verify by confirming the recogniser is enabled when `ChatView` appears (log `nav.interactivePopGestureRecognizer?.isEnabled`).

The DM sidebar itself is the root of the `NavigationStack`, so there is no "back" from it — the user's "horizontal swipe on dm sidebar" likely refers to swiping back **into** the sidebar **from** a chat thread. That is the same gesture as above; fixing it on chat covers both.

## 3. Notes attachments persist

In `NotesView.swift` `ingest(_:)`:
- After each successful upload, call `flushSave()` directly instead of `scheduleSave()`. The current 700ms debounce loses attachments when the user backs out of the editor before the timer fires.
- Wrap `store.uploadAttachment(...)` failures in a user-visible toast/banner so silent failures stop being invisible (right now they only log to console).
- Guard against PhotosPickerItem returning `nil` for HEIC by retrying once with `loadTransferable(type: Data.self, preferredImageType: .jpeg)`-equivalent: request `UIImage` then re-encode to JPEG when raw `Data` is nil.

In `NotesStore.swift` `uploadAttachment`:
- Switch the storage upload to `upsert: true` so a retry after a transient failure doesn't blow up on the duplicate object name.

## 4. FriendsStrip — lock to horizontal, no pull-to-refresh

Two symptoms reported (vertical swipe + refresh in the strip area) come from the parent `List` having `.refreshable` and from the horizontal `ScrollView` not absorbing vertical drags cleanly.

Changes:
- Remove `.refreshable { await load(silently: false) }` from the DM list — realtime + the existing `task` already cover refresh, and matches web/desktop which have no pull-to-refresh.
- Wrap the FriendsStrip's `ScrollView(.horizontal)` in a `.simultaneousGesture(DragGesture(minimumDistance: 6).onChanged { _ in })` no-op limited to vertical translations, so vertical drags are eaten by the strip and never bubble up.
- Keep `.scrollBounceBehavior(.basedOnSize, axes: .vertical)` for visual polish.

## 5. Discord-style inline attach picker (replaces sheet)

Today the `+` button presents `AttachmentsPicker` as a sheet. Reference screenshot shows an inline panel that **replaces the keyboard region** below the composer, with a "Photos / Files" bottom bar and a camera tile inside the grid.

Plan:
- New file `ios-native/Sources/Cubbly/Features/Chat/InlineAttachPanel.swift`. Renders:
  - A horizontally-scrolling `PhotoGrid` of the user's PhotoKit recents (reuse `PhotoGridViewController` from `AttachmentsPicker.swift`, refactored into a shared component).
  - A leading camera tile (`UIImagePickerController` source `.camera`) that visually matches a photo cell but is a button — taps it to launch the camera.
  - A bottom action bar with two pill buttons: **Photos** (opens system `PHPicker` for full library) and **Files** (opens `UIDocumentPickerViewController`).
- Wire-up in `ChatView.swift`:
  - Replace `@State showAttachments` sheet with `@State attachPanelOpen: Bool`.
  - When the `+` button is tapped it toggles `attachPanelOpen`, rotates to `x`, **dismisses the keyboard** (`composerFocused = false`), and the panel slides up in the same vertical region the keyboard occupied (use `KeyboardObserver`'s last known keyboard height as the panel height; fall back to ~280pt).
  - Selecting any photo from the inline grid feeds into the existing `enqueueAttachments(urls:)` flow (preview chip strip above composer). Photos and Files buttons feed into the same pipeline.
  - Tapping `x` again (or sending) collapses the panel.
- The existing `AttachmentsPicker` sheet remains for the rare "Pick from Library Instead" denied-state fallback but stops being the primary entry point.

## 6. Auto-scroll past the latest message into the bottom padding

In `ChatView.swift`, every `proxy.scrollTo(last, anchor: .bottom)` (lines 364, 376, 382, 391, 394) snaps the bottom **edge of the last message** to the bottom of the visible area, so the 28pt padding above the composer sits below it but feels invisible (no over-scroll allowed because nothing pulls scroll past the message).

Fix: add a zero-height invisible sentinel `Color.clear.frame(height: 1).id("bottomSentinel")` inside the messages `LazyVStack` **after** the bottom padding spacer, and change all five `scrollTo(last, anchor: .bottom)` calls to `scrollTo("bottomSentinel", anchor: .bottom)`. That makes the scroll target the absolute bottom of the padding rather than the last bubble.

---

## Files touched

- `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift` — quick-menu detent, drop `.refreshable`.
- `ios-native/Sources/Cubbly/Shared/NativeEdgeSwipeBack.swift` — delegate / re-enable fix.
- `ios-native/Sources/Cubbly/Features/Notes/NotesView.swift` — flushSave-after-upload, error surfacing, HEIC fallback.
- `ios-native/Sources/Cubbly/Core/Services/NotesStore.swift` — `upsert: true`.
- `ios-native/Sources/Cubbly/Features/DMs/FriendsStrip.swift` — vertical-drag swallow.
- `ios-native/Sources/Cubbly/Features/Chat/AttachmentsPicker.swift` — extract reusable grid component.
- `ios-native/Sources/Cubbly/Features/Chat/InlineAttachPanel.swift` — **new**, Discord-style inline panel.
- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift` — swap sheet → inline panel, sentinel-based auto-scroll, kill `showAttachments` sheet.

Final step: rebuild `Cubbly-iOS.zip` for download.
