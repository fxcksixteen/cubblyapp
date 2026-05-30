## Why Notes already works and chat doesn't

`NotesView` / `NoteEditorView` push via a plain `NavigationStack` + standard `navigationTitle` + `.toolbar`. Because the system nav bar is visible, UIKit's `interactivePopGestureRecognizer` is wired up automatically — that's the silky edge swipe you like.

`ChatView` (the chat thread) is different:
1. It calls `.navigationBarHidden(true)` and draws its own `header` view.
2. To get edge-swipe back it patches a `UIViewControllerRepresentable` (`EdgeSwipeBack.swift` → `enableEdgeSwipeBack()`) that pokes `interactivePopGestureRecognizer.delegate`. This works ~partially, but…
3. Every message bubble installs a `DragGesture(minimumDistance: 18)` for swipe-to-reply (`ChatView.swift` ~L1148-1171). On the left edge those bubble drags start "winning" the gesture race, so the system pop gesture either never fires or fires inconsistently — exactly the bug you're describing.

The DM sidebar (`DMListView`) is the root of the `NavigationStack`, so there's nothing to swipe back to from it; the swipe you want there is really "from chat thread back to DM sidebar," which is the same fix.

## The fix — match Notes, delete the hack

1. **`ChatView.swift`**
   - Remove `.navigationBarHidden(true)` and `.enableEdgeSwipeBack()`.
   - Move the current custom `header` (avatar + name + presence + call button + menu) into a `.toolbar` with a `ToolbarItem(.principal)` for the title block and `.topBarTrailing` items for call + menu. Use `.navigationBarTitleDisplayMode(.inline)` so it stays compact like Notes/Discord.
   - The system back chevron will appear automatically; we can hide just the back-button label with `.toolbar(.visible, for: .navigationBar)` + a custom `.topBarLeading` chevron only if we want the icon to stay Cubbly-branded. (Default chevron is fine — that's what Notes uses.)
   - Result: zero custom code, the gesture is the OS's, identical to Notes.

2. **Stop the per-bubble swipe-to-reply from stealing the left edge**
   - In `DiscordStyleBubble` (`ChatView.swift` ~L1148), gate the reply `DragGesture` so it only begins when the touch starts **outside the leftmost 24 pt** of the bubble's frame. Easiest implementation: track the gesture's `startLocation.x` in `onChanged` and bail out (`return`) if `startLocation.x < 24`. This guarantees the system edge-pop always wins on the left strip.

3. **Delete `ios-native/Sources/Cubbly/Shared/EdgeSwipeBack.swift`**
   - No longer referenced after step 1; removing it makes future contributors stop reaching for the workaround.

4. **No DM sidebar changes needed.** It's the root view; the navigation you want is "chat → back to DM sidebar," which step 1 fixes. If you later push other screens from the DM sidebar (settings, profile, etc.), they will all inherit the same default swipe-back automatically as long as they don't hide the nav bar.

## Files touched

- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift` — toolbar-ify header, drop `.navigationBarHidden` / `.enableEdgeSwipeBack`, gate bubble drag.
- `ios-native/Sources/Cubbly/Shared/EdgeSwipeBack.swift` — delete.

## Visual impact

The chat header layout stays visually the same (same avatar, name, presence, call, menu), but it lives inside the standard `UINavigationBar` and gets the system back chevron on the leading side. This matches Notes exactly and unlocks the native edge swipe with zero proprietary gesture code.