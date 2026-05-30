# iOS chat polish + sidebar swipe-in

All changes are inside `ios-native/`. The interactive pop gesture on chat threads is working and will NOT be touched.

## 1. Stop messages from "registering as long-press" during right-swipe back

File: `Features/Chat/ChatView.swift` (`MessageRowView`)

- Today the row uses `.onLongPressGesture(minimumDuration: 0.28, maximumDistance: 12, onPressingChanged:)`. The press visual fires the instant a finger lands, which is why the user feels the long-press "fight" the swipe-back even though `maximumDistance: 12` cancels the action.
- Replace the immediate `isPressing = true` with a delayed assignment (~120 ms via `DispatchWorkItem`) cancelled if any horizontal translation > 6 pt is detected by a parallel `DragGesture(minimumDistance: 0)` reading `startLocation.x` and `translation.width`.
- When the parallel drag sees `value.translation.width > 6` (rightward) and `startLocation.x < 60`, immediately cancel both the pending press feedback AND the long-press intent for this touch. (`DragGesture(minimumDistance: 0).onChanged` lets us detect motion before long-press fires.)
- Net effect: a quick right-swipe never paints the press tint or scales the bubble — it cleanly hands off to the system's interactive pop. Vertical scroll and real long-press still work because we only cancel on rightward horizontal motion starting near the left half.

## 2. Restore Discord-style chat top bar (kill the iOS-26 default treatment)

File: `Features/Chat/ChatView.swift`

- Remove `ToolbarItem(placement: .principal)` (which centers content) and the `ToolbarItemGroup(placement: .topBarTrailing)` call/video buttons that pick up the iOS-26 liquid-glass capsule background.
- Keep the nav bar visible (mandatory for the pop gesture) but drive its layout with:
  - `ToolbarItem(placement: .topBarLeading) { chatToolbarTitle }` — avatar + name + status dot, left-aligned right next to the system back chevron, Discord-style.
  - `ToolbarItem(placement: .topBarTrailing) { HStack { callBtn; videoBtn } }` where each button uses `.buttonStyle(.plain)` and a flat `SVGIcon` so iOS 26 does not wrap them in glass pills.
- `chatToolbarTitle` is rewritten to use the existing 32 pt `AvatarView` + `StatusDot` + `CubblyNameText`, no centering, no extra chrome.
- Keep `.toolbarBackground(Theme.Colors.bgPrimary, for: .navigationBar)` and `.toolbarBackground(.visible, for: .navigationBar)` so the strip stays flat Discord-grey.

## 3. Inline attach panel: square thumbnails, selection toggle, no duplicates

Files: `Features/Chat/InlineAttachPanel.swift`, `Features/Chat/ChatView.swift`

- `AssetThumb` already uses `.aspectRatio(1, contentMode: .fit)` in the grid, but the inner `Image` uses `.scaledToFill()` inside a square clip — that part is correct. The fix is to make sure the displayed image is *always* square regardless of source orientation: wrap the `Image` in `.aspectRatio(1, contentMode: .fill).clipShape(RoundedRectangle(...))` and pin both width & height to the cell via `GeometryReader`-free `.frame(maxWidth: .infinity, maxHeight: .infinity)` so portrait/video assets are center-cropped to a clean 1:1 just like Discord.
- Track selection inside `InlineAttachPanel` with `@State private var selected: [String: Int] = [:]` (asset localIdentifier → 1-based order). Replace the single-tap-export flow with a toggle:
  - First tap on a thumb: add to `selected`, show a filled blue circle with the order number in the top-right corner + a 2 pt `Theme.Colors.primary` inset border on the tile.
  - Tap again on the same thumb: remove it (and renumber the rest).
- Add a bottom-right "Send N" action (or surface the selection via the existing composer pending-attachments bar after the panel dismisses). Confirm with user which UX they want (see Questions). Default to: hitting the composer Send / a new "Add" button in the panel bottom bar resolves all selected assets via `AttachmentsPicker.exportToTempURL` in parallel and calls the existing `onPickURLs([URL])` callback once.
- Dedupe across rapid taps using the `selected` map — picking the same asset twice in a single message is impossible by construction.
- Same selection model is applied to the system PhotosPicker pathway via `selection: $systemPicked` with `maxSelectionCount: 10`, which already prevents duplicates.

## 4. Friend badges in the DM sidebar

Files: `Core/Services/UserBadgesStore.swift`, `Features/DMs/DMListView.swift`

- `UserBadgesRow` is rendered at line 426 of `DMListView.swift`. Recent fix added `.fixedSize(horizontal: true, vertical: true)` for the chat header but the sidebar variant still gets clipped by the surrounding `HStack` `lineLimit(1)` on the name.
- Wrap the name + badges in an `HStack(spacing: 6)` where the name has `.layoutPriority(0)` and `UserBadgesRow` has `.layoutPriority(1)` plus `.fixedSize(horizontal: true, vertical: false)`, and remove `lineLimit(1)` from the name *container* (apply it on the `CubblyNameText` only). Add `.frame(minWidth: 0, alignment: .leading)` so the name truncates first.
- Verify `UserBadgesStore.shared.request(uid)` is fired in `.onAppear` (it is) — also call it once at conversation-list load so badges appear on first paint without scrolling.

## 5. Notification tap → jump to that chat

Files: `Core/Services/NotificationService.swift` (already posts `.cubblyOpenConversation` with `conversationID` in `userInfo`), `Features/DMs/DMListView.swift`, `Features/MainTabView.swift`

- `DMListView` owns the `NavigationStack` + `navigationDestination(for: ConversationSummary.self)` chat push.
- Add an `.onReceive(NotificationCenter.default.publisher(for: .cubblyOpenConversation))` on the sidebar's NavigationStack root:
  1. Switch to the DMs tab if we're not already there (post a tab-switch notification handled in `MainTabView`).
  2. Look up the `ConversationSummary` for the incoming id from the in-memory `ConversationsRepository` cache.
  3. Replace `path` with `[summary]` (or append if already on the same stack) so the chat opens directly. The newest unread is auto-scrolled to by `MessagesRepository` on load.
- Same handler is added for APNs cold-launch via the existing `didFinishLaunching` user-info path so tapping a push from a fully-killed app also deep-links.

## 6. Swipe LEFT on the DM sidebar to reopen the most recent chat (native)

The truly native iOS primitive for "swipe horizontally between two screens" is `UIPageViewController`, exposed in SwiftUI as `TabView(...).tabViewStyle(.page(indexDisplayMode: .never))`. This is what Discord/Messages use for this gesture.

File: `Features/DMs/DMListView.swift` (wrap the NavigationStack root)

- Persist `@AppStorage("lastOpenedConversationID") var lastChatID: String?` written every time a chat is pushed.
- Replace the bare `NavigationStack { sidebar }` with:
  ```text
  TabView(selection: $page) {
      sidebarStack.tag(0)         // current DM list, full NavigationStack
      mostRecentChatStack.tag(1)  // NavigationStack pre-seeded with [lastChat]
  }
  .tabViewStyle(.page(indexDisplayMode: .never))
  ```
  `mostRecentChatStack` is only mounted when `lastChatID` resolves to a valid `ConversationSummary`; otherwise the second page is omitted and the gesture is a no-op (matches Discord — no recent chat ⇒ no swipe target).
- When the user pops the chat (back chevron or swipe-back), `path` drains AND we set `page = 0` so they end up on the sidebar, ready to swipe left again.
- This keeps the existing chat-thread → sidebar swipe-back as-is (it's the right edge of the chat page, handled by the same NavigationStack), and adds a left-edge swipe on the sidebar that pages over to the chat — entirely via the system page transition, no custom DragGesture.

Trade-off to confirm with the user: opening a *different* chat from the sidebar will replace `page 1`'s seeded conversation. Confirm in Questions below.

## Technical details

- All new gestures are SwiftUI-built or pure UIKit Apple primitives (`UIPageViewController` via `TabView(.page)`). No third-party gesture engines, no `UIScreenEdgePanGestureRecognizer` subclasses.
- No backend / RLS / migration changes in this plan — the recently-fixed notes-attachments policy stays.
- Files touched: `ChatView.swift`, `InlineAttachPanel.swift`, `DMListView.swift`, `NotificationService.swift` (small), `MainTabView.swift` (tab-switch handler), and possibly a small `LastChatStore.swift` for the `@AppStorage` mirror.

## Questions before I build

1. For the attach panel: should selecting items show a **bottom "Send (N)" button inside the panel**, or just flow the selected assets into the existing composer pending-attachments bar so you can type a caption and hit the composer Send (current behavior, just multi-select)?
2. For the sidebar swipe-left: confirm that opening any chat from the sidebar should make THAT chat the "most recent" page-1 target (so the next swipe-left from the sidebar returns to whichever chat was last opened, exactly like Discord)?
