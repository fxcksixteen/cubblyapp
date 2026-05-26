## 1. Horizontal swipe — copy what already works for Notes

You noticed Notes swipes back perfectly. That's because it's pushed onto a `NavigationStack` and iOS gives it the native interactive-pop gesture for free. The reason chat threads feel "forced" is that on top of that native gesture we're stacking our custom `HorizontalSwipe` modifier (`DragGesture`), and the two fight each other.

Changes:
- **`ChatView.swift`**: remove `.horizontalSwipe(right: { dismiss() }, …)`. Keep only `.enableEdgeSwipeBack()` so iOS's native `interactivePopGestureRecognizer` drives the back-swipe — identical to the Notes feel you just praised.
- **`DMListView.swift`**: remove the `.horizontalSwipe(left: …, leftPreview: ChatThreadPreview)`. Replace it with a tiny right-edge `DragGesture` (minimumDistance 20, only starts within 20pt of the right edge) that triggers `openConversation = lastChat…` on flick — so swipe-from-right still re-opens the last chat, but doesn't intercept any vertical scroll or any drag started in the middle of the list.
- **`HorizontalSwipe.swift`**: leave the file in place but unused by these two screens. (No other call sites use it for chat/DM.)

Result: pushing a chat = native iOS push animation; swiping back = the same native interactive-pop you already love on Notes; the DM peek/reveal preview goes away, but that's the price of the native feel — and matches Discord exactly.

## 2. Discord-style friends strip at the top of the DM sidebar

New horizontal row of square avatar tiles right above Personal Notes, under the search bar — exactly like image 1.

- New view `FriendsStrip` in `ios-native/Sources/Cubbly/Features/DMs/FriendsStrip.swift`:
  - Pulls accepted friends from `FriendsRepository` (already used by `FriendsView`) into a small `@StateObject` cache so it shows instantly on revisit.
  - `ScrollView(.horizontal)` of 64×72 tiles: `RoundedRectangle(cornerRadius: 16)` background `bgSecondary`, centred `AvatarView` size 52 clipped to `RoundedRectangle(cornerRadius: 14)`, with a `StatusDot` (size 14, bgSecondary border) pinned bottom-trailing — driven by `PresenceService.effectiveStatus` so online/idle/dnd/offline all show.
  - Tap = `openConversation = ` existing DM with that friend, or open `NewChatSheet` prefilled if no DM exists.
- Order: online first, then idle/dnd, then offline (matches Discord). Cap at ~20 visible, horizontally scrollable past that.

## 3. Personal Notes row — Discord-style redesign

Replace the current `PersonalNotesRow` with a layout matching image 2:
- 40×40 `RoundedRectangle(cornerRadius: 20)` filled `bgTertiary` containing a 20pt pencil/edit glyph (`SVGIcon "notes"` tinted `textPrimary`).
- Title "Personal Notes" in `Theme.Fonts.bodyMedium`, `textPrimary`, single line.
- No subtitle. No outer card/background — just the row, full-width, vertical padding 10, leading padding 12, with `contentShape(Rectangle())` for the full-row tap target.
- Sits right under the friends strip, above the conversation list.
- Mirror the same row in `DMSidebarPreview` so the swipe-back peek matches.

Final sidebar order (top → bottom): header → search → friends strip → personal notes row → conversations list.

## 4. Activity in DM rows (parity with web/desktop)

Web shows e.g. "Playing Minecraft" under the contact name instead of last message when the other user has a live activity. iOS already runs `ActivityService.shared` with realtime updates — just isn't read here.

Changes in `DMListView.swift` `DMRow`:
- Add `@ObservedObject var activity = ActivityService.shared`.
- For 1:1 DMs (`conversation.otherUser != nil`), compute:
  ```swift
  let isOnline = presence.isOnline(other.userID)
  let activityLabel = activity.label(for: other.userID, isOnline: isOnline)
  ```
- If `activityLabel != nil`, render the subtitle as that label with the small game/software icon (`SVGIcon "activity"`, 12pt, `Theme.Colors.success`) instead of the last-message preview. Otherwise keep current `previewText` behaviour.
- Group rows unchanged.

This is purely a read-only display change — no new subscriptions, no extra DB cost.

## 5. Launch screen — make it look like the brand, not a cropped face

Image 3 shows the launch storyboard scaling `cubbly-nobg` (a 200×200 face-only asset) to fill, so on iPhone it crops to just the eyes and snout on white.

Fix in `ios-native/Resources/LaunchScreen.storyboard`:
- Change background `color` to `#000000` (matches `Theme.Colors.bgPrimary`, the same dark canvas the app boots into — no more white flash).
- Swap `image="cubbly-nobg"` → `image="cubbly-logo"` (the proper full-logo asset already in `Assets.xcassets`).
- Keep `contentMode="scaleAspectFit"`, shrink frame to 140×140, keep centred via the existing `centerX` / `centerY` constraints.

Result: cold-start shows a small, properly-proportioned Cubbly logo on the same dark background as the app itself — no flash, no cropped face.

---

### Files touched

- edit  `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift` (remove `.horizontalSwipe`)
- edit  `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift` (remove `.horizontalSwipe`, add edge-only re-open gesture, redesign `PersonalNotesRow`, insert `FriendsStrip`, activity-aware `DMRow`, mirror in `DMSidebarPreview`)
- new   `ios-native/Sources/Cubbly/Features/DMs/FriendsStrip.swift`
- edit  `ios-native/Resources/LaunchScreen.storyboard` (logo + dark bg)

No backend, schema, or web/desktop changes. After approval I'll apply the edits and rebuild the `cubbly-ios-v0.1.6-buildN-animated.zip`.
