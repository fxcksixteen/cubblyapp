I found two likely root causes in the current native iOS code:

1. Chat threads are wrapped in a global horizontal swipe gesture and each message row adds a zero-distance drag gesture for press feedback. That combination can steal vertical drag touches from the `ScrollView`, which matches the “cannot scroll up/down at all” report.
2. iOS presence relies only on realtime presence diffs. If the initial presence snapshot is missed, if IDs have case mismatches, or if the socket silently drops, iOS keeps showing friends offline even though web/desktop are online.

Plan:

1. Restore native iOS chat scrolling immediately
   - Remove or replace the message row `DragGesture(minimumDistance: 0)` press detector so message rows no longer capture scroll drags.
   - Disable or narrow the chat-level horizontal swipe gesture so it only starts from the screen edge and never competes with vertical chat scrolling.
   - Keep long-press actions working, but make them non-blocking for normal vertical scrolling.

2. Make iOS chat timeline stable while scrolling
   - Stop auto-scrolling to the newest message every time `messages.count` changes when older messages are prepended.
   - Only auto-scroll when the user sends/receives a new latest message while already near the bottom, or on initial open.
   - Keep pagination anchored so scrolling up does not yank the thread back to the bottom.

3. Fix native iOS online/status sync globally
   - Rework `PresenceService` to use the official Swift realtime presence callback pattern before subscribing.
   - Maintain a full snapshot of online user IDs, not just incremental joins/leaves that can become stale or incomplete.
   - Normalize all UUIDs to lowercase for parity with web/desktop.
   - Add foreground restart/heartbeat retry logic so iOS rejoins the global presence room after app suspension or network changes.
   - Add a fallback profile/status refresh for friends/conversations so status labels update even when the cached conversation profile is stale.

4. Verify parity with web/desktop behavior
   - Confirm web/desktop still use `global:online` with presence key `user.id`.
   - Confirm iOS publishes and reads the same channel/key/payload format.
   - Confirm Friends tab, DM list rows, chat headers, and profile popups all use the same live presence source.

5. Ship a new native iOS v0.1.4 zip
   - Bump iOS build number from 8 to 9 while keeping version `0.1.4`.
   - Regenerate/package the Xcode source folder as a new zip.
   - Also fix the existing `package-lock.json` root version mismatch to `0.2.27` if it is still wrong, because I confirmed it currently still says `0.2.1` even though `package.json` says `0.2.27`.

Files expected to change:
- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift`
- `ios-native/Sources/Cubbly/Shared/HorizontalSwipe.swift` or the chat call site using it
- `ios-native/Sources/Cubbly/Core/Services/PresenceService.swift`
- possibly `ios-native/Sources/Cubbly/Features/Friends/FriendsView.swift` / `DMListView.swift` if cached status refresh is needed
- `ios-native/Resources/Info.plist`
- possibly `ios-native/project.yml`
- `package-lock.json` for the v0.2.27 desktop/web lockfile version mismatch

After approval I’ll implement these fixes and create a fresh `cubbly-ios-v0.1.4-build9.zip`.