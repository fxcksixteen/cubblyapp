I found the likely break from the last batch: `ChatView` now hides the real navigation bar (`.navigationBarHidden(true)` + `.toolbar(.hidden, for: .navigationBar)`) and draws a custom header inside the page. That removes the exact native UIKit/SwiftUI navigation transition behavior you’re comparing to Personal Notes, so the chat no longer has the catchable interactive push/pop feel.

Plan:

1. Restore ChatView to real native navigation-stack chrome
- Remove the inline `chatHeader` from inside the chat page body.
- Remove `.navigationBarHidden(true)` / `.toolbar(.hidden, for: .navigationBar)` from `ChatView`.
- Put the Discord-style header back into `.toolbar` with:
  - top-left avatar + display name + status/badges
  - top-right call + video buttons
  - no centered principal title
- Keep the chat inside the same `NavigationStack` from `DMListView`, matching Personal Notes’ structure so iOS owns the horizontal interactive transition again.
- Do not add a custom horizontal swipe system to chat threads.

2. Prevent the toolbar from looking like the bad liquid-glass pill
- Use plain toolbar buttons and flat SVG icons.
- Keep nav bar background aligned to `Theme.Colors.bgPrimary`.
- Avoid any custom capsule/pill backgrounds around the chat title or call buttons.

3. Remove the gesture that can interfere with native navigation
- Remove the left-swipe reopen `DragGesture` that was attached directly to the `NavigationStack` content in `DMListView`; that recognizer can compete with navigation gestures.
- If sidebar swipe-left reopen is still needed afterward, move it to a narrow trailing edge-only overlay later, not across the whole stack.

4. Fix DM sidebar badge rendering
- Change `UserBadgesStore` fetch to match the actual table shape safely: filter `user_equipped.category = 'badge'` and fetch `shop_items(category, config, name, description)` without relying on joined-table category filtering.
- Add a fallback two-step fetch path: if the joined query returns no badge rows or fails, fetch equipped badge rows first, then fetch matching `shop_items` by `item_id`, and build badges locally.
- Make `UserBadgesRow` reserve visible width/height when badges exist and keep it inline after `CubblyNameText` so it cannot collapse/clamp out of the DM row.

5. Keep scope tight
- No database migrations.
- No attachment-panel changes in this pass unless you ask again; this pass targets exactly the broken native chat swipe and missing friend badge.