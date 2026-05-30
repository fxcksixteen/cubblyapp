## v0.1.7 fix plan

### 1. Restore Discord-style chat header without iOS 26 default glass
- Remove the SwiftUI `.toolbar` chat header that centered the avatar/name and introduced default system `Button` styling.
- Bring back a fully custom Cubbly/Discord-style top bar inside `ChatView`:
  - back chevron on the left
  - avatar + name/status left-aligned next to it
  - custom plain call/video icon buttons on the right
  - no default toolbar buttons or centered title
- Keep all buttons `.buttonStyle(.plain)` and visually custom so iOS 26 does not apply Liquid Glass/default button styling.

### 2. Make chat thread swipe-back use the native iOS gesture, not a fake swipe
- Hide the system navigation bar again for the custom header.
- Add a tiny UIKit bridge that only re-enables Apple’s built-in `interactivePopGestureRecognizer` while the chat is pushed in the `NavigationStack`.
- Do not add a proprietary `DragGesture`/custom horizontal navigation animation.
- Keep message swipe-to-reply from stealing the left edge by ignoring drags that begin in the edge-pop zone.

### 3. Fix chat layout/keyboard bottom reset
- When the keyboard dismisses after tapping outside the composer, force the timeline to re-anchor to the newest message after the keyboard animation completes.
- Keep the extra bottom breathing room above the input, but prevent the “empty keyboard-sized gap” from lingering.
- Also retry the bottom scroll after initial load/content reflow so chat opens at the true newest message.

### 4. Change iOS chat attachments to queue before sending
- Stop `AttachmentsPicker` and `fileImporter` from immediately sending files.
- Store selected images/videos/files as pending attachments in `ChatView`.
- Show a pending attachment preview strip above the composer with remove buttons.
- Send attachments only when the user taps send, optionally with the typed caption, matching Discord/web/desktop behavior.
- Upload then serialize with the existing `[attachments]...[/attachments]` format so all clients render the message correctly.

### 5. Fix personal notes image attachments
- Make note image/video ingestion persist attachment metadata immediately after upload instead of relying only on the debounced note save.
- Add a stronger PhotosPicker fallback path for images that do not load cleanly as raw `Data`.
- Keep the attachment grid visible immediately after adding, and avoid later title/body autosaves overwriting the attachment list.

### 6. Fix DM quick-menu sheet top cropping
- Add safe top spacing/content padding inside `DMQuickMenuSheet` and tune the sheet detents so the header/avatar row is never clipped by the grabber or sheet top edge.
- Keep the custom branded half-sheet; no return to generic iOS context menus.

### 7. Lock the FriendsStrip to horizontal-only behavior
- Move pull-to-refresh/vertical scrolling behavior off the entire DM screen and onto the conversation list only.
- Keep the friend strip as a fixed-height horizontal `ScrollView(.horizontal)` so vertical swipes over it do not scroll/pull the DM sidebar.

### 8. Make animated themes actually visible in iOS and web/desktop surfaces
- iOS: add a reusable themed animated background layer and use it behind chat threads/DM sidebar/main surfaces, then make appropriate surfaces slightly translucent so Space/Sky/Snowy/Hills animations are visible instead of hidden by opaque `bgPrimary`.
- Web/desktop/mobile: broaden the theme CSS selectors so animated backgrounds apply to the mobile root as well as the desktop `h-screen` root.
- Ensure chat, DM/sidebar, and user-panel surfaces use translucent themed backgrounds for Space/Sky/Snowy/Hills without making modals/dialogs transparent.
- Keep the server rail from reverting to flat Cubbly coloring when an animated shop theme is equipped.

### 9. Update displayed iOS version
- Change `CubblyConfig.appVersion` from `0.1.6` to `0.1.7` so the You tab footer displays the correct version.

### Files expected to change
- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift`
- `ios-native/Sources/Cubbly/Features/Chat/AttachmentsPicker.swift`
- `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift`
- `ios-native/Sources/Cubbly/Features/DMs/DMQuickMenuSheet.swift`
- `ios-native/Sources/Cubbly/Features/DMs/FriendsStrip.swift`
- `ios-native/Sources/Cubbly/Features/DMs/ServerRail.swift`
- `ios-native/Sources/Cubbly/Features/Notes/NotesView.swift`
- `ios-native/Sources/Cubbly/Core/Services/NotesStore.swift`
- `ios-native/Sources/Cubbly/App/CubblyConfig.swift`
- likely one small new shared iOS helper for the native pop gesture/background layer
- `src/index.css`
- possibly `src/pages/AppLayout.tsx` / theme background wrapper classes if CSS alone is not enough