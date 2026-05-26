# iOS v0.1.7 — Launch Screen + Discord-Style Interactive Swipe

Two focused polish changes for the native iOS app. No web/desktop changes.

---

## 1) Discord-style launch screen

Goal: when the app cold-starts, show a full 9:16 screen painted in Cubbly's main brown brand color with the no-background Cubbly logo centered — exactly how Discord's launch screen shows just their logo on a flat brand color.

What to change:
- `ios-native/Resources/LaunchScreen.storyboard` — already uses brown bg + centered `cubbly-nobg`. Tighten it so:
  - Background color is set to the canonical Cubbly brown `#96725E` (matches `SPLASH_BG_COLOR` from the web splash) on both the root view and `LaunchBackground.colorset`.
  - Logo image is centered with a fixed 180×180 size (looks right on every device class from SE through Pro Max — current 200 is fine but we'll lock it via auto-layout instead of frame math).
  - Remove the "respects safe area" hint so the brown fills edge-to-edge in true 9:16, including under the notch / dynamic island and home indicator.
- `LaunchBackground.colorset/Contents.json` — confirm the sRGB components resolve to `#96725E` (currently `0.588, 0.447, 0.369` ≈ correct, will re-verify and snap exact).
- `Info.plist` `UILaunchScreen` dict — keep `cubbly-nobg` as the image, ensure `UIImageRespectsSafeAreaInsets = false` so the brown bleeds full-bleed.
- No change to the in-app `SplashView` (the cozy animated bears loop) — that one stays as the post-launch loading state, just like Discord shows their logo first and then their app loads in.

Result: identical launch behavior to Discord — flat brand-brown 9:16 with logo dead-center, then the app loads into the existing animated splash.

---

## 2) Discord-style interactive horizontal swipe (DM list ⇄ chat)

Goal: when the user is in a DM thread, dragging right reveals the DM sidebar live under the finger; dragging left from the DM list reveals the most recently opened chat. Half-swipes, slow-swipes, pause, reverse, and commit all feel smooth and rubber-banded — just like Discord and the new Lovable iOS app.

### Background research

Discord's RN app uses their own gesture stack (built on `react-native-gesture-handler` + `react-native-reanimated`, with a custom `PanResponder`-style "DrawerLayout" they open-sourced fragments of). The smoothness comes from three properties:

1. The gesture runs on the UI thread (not JS), so tracking is frame-perfect.
2. Content + sidebar are siblings in a `ZStack` and both translate by the same `dragX` value — the sidebar isn't pushed in *after* a threshold, it tracks the finger from pixel 1.
3. Release uses a spring with velocity carried over, so a fast flick commits and a slow drag past threshold settles.

The native SwiftUI equivalent is `DragGesture` driving a `@GestureState` translation, with `.interactiveSpring` on the offset and a velocity-aware `.onEnded` that decides commit vs. snap-back. This already runs on the render thread in SwiftUI — no library needed. We already have a working version in `ios-native/Sources/Cubbly/Shared/HorizontalSwipe.swift` (used elsewhere); it just isn't wired into the DM list ↔ chat transition, and its commit logic needs velocity + slightly tuned thresholds to feel Discord-smooth.

### What to build

- **New navigation controller** `DMRootView` (replaces direct `NavigationStack` usage inside `DMListView`):
  - Holds `@State var openChatID: UUID?` (the currently-open conversation) and `@State var dragX: CGFloat = 0`.
  - Renders DM list and ChatView as siblings in a `ZStack`, both with `.offset(x:)` tied to the same drag value. When no chat is open, only the DM list is interactive.
  - Tracks the most-recently-opened conversation so swiping left from the DM list when no chat is currently open re-opens the last one (Discord behavior).
- **Interactive `PanGestureView`** (UIKit-backed `UIViewRepresentable` wrapping `UIPanGestureRecognizer`):
  - We use a recognizer instead of SwiftUI's `DragGesture` because we need (a) `shouldRecognizeSimultaneouslyWith` to coexist with the vertical `ScrollView` inside chat without stealing its touches, and (b) real velocity at release for the spring.
  - Reports `(translation, velocity, state)` back via a binding.
  - Rejects gestures whose initial angle is more vertical than horizontal (so chat scrolling stays smooth).
  - Allows the system left-edge swipe-back to coexist (we treat full-width pans, the edge-swipe handler keeps the first 20px).
- **Spring commit logic** in `DMRootView`:
  - Threshold: 35% of screen width OR velocity > 800 pt/s in the swipe direction → commit (open chat or open sidebar).
  - Otherwise spring back with `interactiveSpring(response: 0.32, dampingFraction: 0.86)`.
  - Rubber-band when dragging past the available edge (matches existing `HorizontalSwipe.rubberband` helper).
- **Side-peek preview** while dragging:
  - From chat → right: DM list slides in from the left in lock-step with the finger (no fade, no parallax — Discord doesn't parallax).
  - From DM list → left: last chat slides in from the right in lock-step.
- **ChatView changes**:
  - Remove the `.enableEdgeSwipeBack()` modifier in favor of the new pan controller's "swipe right to dismiss chat" semantics (full-width drag, not just edge). The system back-edge gesture stays for true edge pulls so we don't break iOS muscle memory.
  - Stop pushing chat via `NavigationStack`; instead, `DMRootView` flips `openChatID` and the offset animates the chat in.

### Files

- New: `ios-native/Sources/Cubbly/Shared/InteractivePanGesture.swift` (UIPanGestureRecognizer wrapper).
- New: `ios-native/Sources/Cubbly/Features/DMs/DMRootView.swift` (sibling-stack controller).
- Edit: `ios-native/Sources/Cubbly/Features/MainTabView.swift` (`case .home: DMRootView()` instead of `DMListView()`).
- Edit: `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift` (replace nav-push with `openChatID` callback).
- Edit: `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift` (drop nav-push back gesture; honor parent-driven dismiss).
- Edit: `ios-native/Resources/LaunchScreen.storyboard`, `LaunchBackground.colorset/Contents.json`, `Info.plist`.

### Version bump

- `CFBundleShortVersionString` → `0.1.7`
- `CFBundleVersion` → `19`
- Rebuild source zip as `cubbly-ios-v0.1.7-build19.zip`.

---

## Out of scope

- No web/desktop changes.
- No new dependencies (SPM stays untouched — no `react-native-gesture-handler` analogs needed; UIKit's `UIPanGestureRecognizer` already gives us frame-perfect tracking).
- No changes to chat content, call flow, notes, or shop.
