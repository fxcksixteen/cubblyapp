We should stop changing edge-swipe behavior and instead make chat threads follow the same navigation structure pattern as Personal Notes.

## Plan

1. **Undo the edge-swipe-specific workaround in ChatView**
   - Remove the `.nativeEdgeSwipeBack()` dependency from `ChatView`.
   - Stop treating this as a gesture problem.
   - Keep the existing chat UI, composer, messages, attachments, and reply gestures unchanged unless they directly block the NavigationStack behavior.

2. **Make ChatView behave like a normal pushed destination, like NotesView**
   - Rework `ChatView` navigation chrome so it does not fully detach itself from the system navigation stack with `.navigationBarHidden(true)`.
   - Keep the custom-looking Cubbly header visually, but wire it through the same kind of pushed-route structure Notes uses: a normal `navigationDestination` inside the DM sidebar’s `NavigationStack`.
   - Use toolbar/nav-bar configuration rather than force-hiding the whole navigation controller, because Notes keeps the native stack intact.

3. **Clean up DM sidebar route state so Notes and Chat are symmetrical**
   - Keep `DMListView` as the single owner of both routes:
     - `showNotes -> NotesView()`
     - `openConversation -> ChatView(conversation:)`
   - Make sure chat route dismissal clears the same way Notes does, so returning to the DM sidebar restores the bottom bar naturally instead of depending on gesture hacks.

4. **Remove misleading comments / code paths about edge swipe**
   - Update comments that say ChatView is trying to “match Personal Notes” via edge-swipe re-enabling.
   - Leave `NativeEdgeSwipeBack.swift` alone unless it becomes unused after the chat refactor; if unused, remove its usage only, not the file unless safe.

5. **Validate the target behavior**
   - Confirm ChatView is still pushed from the DM sidebar’s `NavigationStack` just like Notes.
   - Confirm the bottom bar restores when returning to the DM sidebar.
   - Confirm chat message left-swipe-to-reply still works.
   - Confirm no custom full-screen swipe gesture is added.