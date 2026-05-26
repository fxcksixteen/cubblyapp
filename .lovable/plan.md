# iOS App Fixes — Notes placement, swipe feel, broken animations

## 1. Move Personal Notes into the Home tab

**Goal:** Notes should not be a bottom-tab. It should appear as a single "Personal Notes" entry in the DM sidebar, right under the search bar and above the conversation list — matching web/desktop.

- `MainTabView.swift`
  - Remove `.notes` from the `Tab` enum and the `switch selection` block.
  - Remove the Notes button from the `CubblyTabBar` so the bar shows: Home, Friends, Shop, You (4 tabs, evenly spaced).
- `DMListView.swift`
  - Add a `PersonalNotesRow` view between `searchBar` and `content`:
    - Tappable row styled like a DM row: avatar slot = notes SVG icon in a rounded square using `Theme.Colors.primary` tint background, title "Personal Notes", subtitle "Your private space" (or last-edited preview if cheap).
    - Tap pushes `NotesView()` onto the existing `NavigationStack` via `navigationDestination(isPresented:)` or a dedicated `@State showNotes`.
  - Mirror the same row inside `DMSidebarPreview` so the peek preview stays accurate.
- `DMListView` also needs to update its `horizontalSwipe` if the home tab loses the notes peek anywhere (none today — safe).

## 2. Fix the horizontal swipe (axis-lock + native feel)

**Problem:** `HorizontalSwipe.swift` uses `simultaneousGesture` with a `DragGesture`, runs alongside vertical scrolling, never commits to an axis, and the spring snap-back is the only "feel" — so it feels mushy and lets the user drag diagonally.

Rewrite `HorizontalSwipe` so:
- On the first ~8 pt of movement, decide an axis once. If `|dy| > |dx|` at decision time, **abort for the rest of the gesture** (let ScrollView take it). If horizontal wins, **ignore all subsequent vertical delta** — only `value.translation.width` drives `dragX`.
- Track drag in a `@State` (not `@GestureState`) so we can drive the release animation explicitly with `.spring(response: 0.35, dampingFraction: 0.82)`; on commit, animate `dragX` to ±screenWidth before invoking the callback so the destination slides in instead of cutting.
- Velocity-aware commit: if release velocity (`value.predictedEndTranslation.width - value.translation.width`) plus current `dragX` clears the threshold, commit even on a short drag — same as Discord/iOS swipe-back.
- Edge-only start: optionally accept only drags that begin within ~24 pt of the appropriate screen edge for the right-edge (open-chat) direction to avoid accidental triggers from the middle of the list.
- Keep the rubber-band past-edge resistance.
- Apply this on all current callers (`DMListView`, `ChatView`, any others using `.horizontalSwipe`) — no API changes.

## 3. Fix Space theme & all animated theme/name animations

**Root cause:** SwiftUI does **not** animate `LinearGradient.startPoint/endPoint` or `.position(x:y:)` through `withAnimation`. Every "animated" surface in the app (animated themes, Space theme, animated gradient names) relies on that — so nothing actually moves on device.

Switch every one of these to a `TimelineView(.animation)` driver so the value is recomputed each frame from `context.date`.

### 3a. `AnimatedThemeGradient` (Shared/AnimatedThemeGradient.swift)
- Wrap the `LinearGradient` in `TimelineView(.animation(minimumInterval: 1/30))` and compute `phase` from elapsed time modulo `duration` mapped to a triangle wave (so it oscillates like the web `aurora` keyframes).
- Used by Shop previews and `MainTabView` background — both will start moving.

### 3b. `SpaceThemeAnimated`
- Replace the inline `.onAppear { withAnimation … }` with `TimelineView(.animation)`.
- For the starfield: build the 60 stars **once** with stable random offsets (seeded array stored in `@State`), then in each timeline tick offset their x by `(elapsed * driftSpeed).truncatingRemainder(width)`. Use `Canvas` for cheap drawing instead of 60 `Circle().position()` views (more accurate to the web look and far cheaper on GPU).
- Shooting star: drive `shoot` from `(elapsed.truncatingRemainder(period) / period)` so it loops every ~6 s with a long idle gap (matches web `shooting-star` keyframes).
- Add a deeper indigo→black radial + subtle nebula blobs (two soft radial gradients, low opacity) so the preview reads as "Space" rather than dark gray with dots — that's what's making the user say the preview "looks broken".
- Make the view honor the size it's given (currently fine via GeometryReader; keep that).

### 3c. `AnimatedGradientNameText` (NameColorsStore.swift) and `AnimatedGradientText` (ShopView.swift)
- Same fix: `TimelineView(.animation)` driving a `phase` value, used to compute `startPoint`/`endPoint` of the `LinearGradient` per frame.
- Consolidate the two implementations into a single shared `AnimatedGradientText(name:colors:font:)` in `AnimatedThemeGradient.swift` (or a new `AnimatedGradients.swift`), and have both Shop previews and `CubblyNameText` use it. Eliminates the duplicate-broken-in-two-places hazard.

### 3d. Verify equipped paths
- `MainTabView.swift` already gates `SpaceThemeAnimated` and `AnimatedThemeGradient` by equipped theme id — once 3a/3b actually animate, equipping Space / Aurora / Synthwave / Lava / Borealis on the live app background will animate too. No logic change needed there.
- `CubblyNameText` already routes to the animated variant for `.animated(stops:)` — once 3c is fixed, animated name colors animate everywhere they're used (chat bubbles, long-press preview, and we should additionally route `DMRow` sender names and `ProfilePopupView` through `CubblyNameText` so the effect shows beyond just ChatView).

## Out of scope
- No changes to web/desktop.
- No changes to backend, RLS, edge functions, or cost-related code.
- Version stays at **v0.1.6 build 18**; zip will be rebuilt as `cubbly-ios-v0.1.6-build18-animated.zip` (overwrite).

## Files touched
- `ios-native/Sources/Cubbly/Features/MainTabView.swift`
- `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift`
- `ios-native/Sources/Cubbly/Shared/HorizontalSwipe.swift`
- `ios-native/Sources/Cubbly/Shared/AnimatedThemeGradient.swift` (+ rename/consolidate)
- `ios-native/Sources/Cubbly/Core/Services/NameColorsStore.swift`
- `ios-native/Sources/Cubbly/Features/Shop/ShopView.swift`
- (optional) `ios-native/Sources/Cubbly/Features/Chat/ProfilePopupView.swift`, `DMListView.DMRow` to route names through `CubblyNameText`
