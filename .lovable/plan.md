# v0.1.3 — Long-press UX & Full Emoji Picker (iOS)

Two issues remaining for the iOS native app:

1. **Hard to trigger / no visual feedback** when long-pressing a message.
2. **Limited to 6 quick emojis** — no way to pick any emoji from the system.

## What we'll change

### 1. Make long-press easier and visible (`ChatView.swift` — `DiscordStyleBubble`)

- **Lower the press threshold**: `minimumDuration` from `0.32s` → `0.25s` (matches Discord/iMessage feel).
- **Press-down visual feedback**: track a `@State isPressing` flag using a combined `LongPressGesture` + `DragGesture(minimumDistance: 0)` so we know the moment a finger lands on the bubble. While pressing, the bubble:
  - scales to `0.97` with `.spring(response: 0.25, dampingFraction: 0.7)`
  - background tints to `Color.white.opacity(0.06)` (entire row, not just the bubble) so the user clearly sees the targeted message
- **Selection light haptic on touch-down**, medium haptic on trigger (existing).
- **Bigger hit target**: keep `.contentShape(Rectangle())` but ensure the gesture is attached to the full row (avatar + bubble area), not just the bubble. Today the gesture is on the row already — confirm by moving it just above `.padding(.top, …)` and adding `.frame(maxWidth: .infinity, alignment: .leading)` so empty horizontal space is also pressable.
- Cancel the press visual if the finger drags more than a few points (so scrolling still works).

### 2. Full emoji picker via a "+" button in the action menu (`MessageActionMenuView`)

- Append a 7th tile to the horizontal slider after the 6 `QuickReactions`: a `+` button (SF Symbol `plus`) inside the same circular tile style.
- Tapping `+` presents a `.sheet` containing a new `FullEmojiPickerView` with `.presentationDetents([.medium, .large])`.
- **`FullEmojiPickerView`**: a `UIViewControllerRepresentable` wrapping a hidden `UITextField` whose `keyboardType = .default` and which becomes first responder immediately. The user switches to the emoji keyboard (globe) and any character typed is intercepted via `shouldChangeCharactersIn`, sent back to the parent as the chosen emoji, then both sheets dismiss and `onReact(emoji)` fires.
  - Header reads "Pick any emoji" + a search/instruction line "Tap the 😀 key on your keyboard, then choose an emoji".
  - This is the standard iOS approach (Apple does not expose a native SwiftUI emoji picker). It feels familiar and supports every emoji the device has, including skin tones.

### 3. Version metadata

No version bump needed — still v0.1.3, Build 4 in progress. Update `README_FIRST.md`'s changelog note for Build 4 to mention the improved long-press + full emoji picker.

## Files touched

- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift` — bubble gesture/visual + `+` tile + sheet presentation.
- `ios-native/Sources/Cubbly/Shared/FullEmojiPickerView.swift` — **new** UIKit-backed full emoji picker.
- `ios-native/README_FIRST.md` — short note.

## Out of scope

- No DB / web changes (reactions schema already supports arbitrary emoji strings, so any emoji picked here syncs to web/desktop automatically).
- No version bump.
