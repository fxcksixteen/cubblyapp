Four targeted iOS-only fixes. No backend, no web/desktop changes.

## 1. PIN entry — make the dots typable

In `Features/Notes/NotesView.swift` `LockScreen`, the hidden `TextField` (1×1, opacity 0.02) never gets focus, so the keyboard never appears.

- Add `@FocusState private var pinFocused: Bool`.
- Bind `.focused($pinFocused)` on the hidden `TextField`.
- Set `pinFocused = true` in `.onAppear` and again whenever `step` changes (so the confirm step re-focuses).
- Wrap the `PinDots` view in a `Button` (or `.onTapGesture`) that sets `pinFocused = true` — tapping the dots opens the keyboard.
- Keep the field hidden but make it slightly larger (e.g. 40×40, opacity 0.001) behind the dots so the system has a real first-responder target.

## 2. Launch screen logo

`cubbly-logo.png` is a 1920×1920 RGB image with no alpha — on the black launch background it renders as a white square with the logo inside. That's the "broken logo" the user is seeing.

- `Resources/LaunchScreen.storyboard`: switch the `imageView`'s `image="cubbly-logo"` → `image="cubbly-nobg"` (which is RGBA, transparent background) and update the `<resources>` entry to match. Keep 140×140, `scaleAspectFit`, black background.

## 3. Swipe between DM list ↔ last opened chat (replicate Notes feel)

The user wants the exact same gesture Notes has: native iOS push/pop where you can swipe from the left edge to go back. Notes works because it's a `NavigationLink` push inside the `NavigationStack`, so the system's `interactivePopGestureRecognizer` drives both directions of the transition feel.

Chat already has this (chat → back to list works via `.enableEdgeSwipeBack()`). What's missing is the *forward* swipe (list → re-open last chat). iOS doesn't ship a native "swipe-from-right to push" — Notes doesn't have that either. So we replicate it with a single, dedicated edge gesture, but widen and tune it so it actually triggers reliably.

In `Features/DMs/DMListView.swift`:

- Replace the current 24pt right-edge `.overlay` gesture with a wider, more responsive edge handler:
  - Width 32pt, `minimumDistance: 12`.
  - Trigger when `value.translation.width < -60` OR `predictedEndTranslation.width < -120`, and `abs(translation.height) < abs(translation.width)` (axis-lock to horizontal).
  - Only arm when `lastChat.lastConversationID` exists and maps to a cached conversation; otherwise do nothing (no fallback to new-chat).
- Add a subtle visual hint: a 2pt-wide vertical accent bar at the right edge that fades in while the drag is active (gives the user something to grab, matches Discord's edge handle).
- Keep `ChatView`'s `.enableEdgeSwipeBack()` unchanged — that side already mirrors Notes.

## 4. Friends strip not visible in the shipped build

`FriendsStrip.swift` is wired into `DMListView` correctly, but renders `EmptyView` when `sorted.isEmpty`, so when `FriendsRepository().listMine` returns nothing (or fails silently) the strip is invisible — which looks identical to "not added". The other likely cause is that the file isn't in the Xcode project target (it lives in `Sources/Cubbly/Features/DMs/` but `project.yml` uses globbing; need to verify).

- Verify `ios-native/project.yml` globs `Sources/Cubbly/**/*.swift` (it does), so the file ships. If it doesn't compile, the build would fail — so the issue is render-time, not bundling.
- Make the strip always render a container with a min-height so it's visible even while loading / when empty:
  - Always show the horizontal `ScrollView` shell.
  - While loading and cache empty: show 6 shimmer tiles (rounded-rect placeholders).
  - When loaded with zero friends: show a single "Add friends" tile that opens the new-chat sheet / friends tab.
- Surface load errors with a `print` so we can diagnose in console if it still appears blank.
- Bump cache TTL check so it always tries once on first appear (current `< 30s` guard is fine since `lastLoaded` starts nil).

## Files touched

- `ios-native/Sources/Cubbly/Features/Notes/NotesView.swift` — PIN focus
- `ios-native/Resources/LaunchScreen.storyboard` — swap image to `cubbly-nobg`
- `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift` — wider edge swipe + hint bar
- `ios-native/Sources/Cubbly/Features/DMs/FriendsStrip.swift` — always-visible shell, loading + empty states

After edits I'll rebuild the iOS zip (`cubbly-ios-v0.1.6-build20-fixes.zip`).
