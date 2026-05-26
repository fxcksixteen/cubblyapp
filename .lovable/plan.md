I’ll fix the native iOS implementation in the same places you pointed to instead of keeping the fake edge-swipe approach.

## Plan

1. **Loading screen: use the no-background logo correctly**
   - Put/use the transparent `cubbly-nobg.png` asset in the same asset catalog area as `cubbly-logo`.
   - Make the launch screen a plain Cubbly-brown 9:16 screen with the transparent logo centered.
   - Make the in-app `SplashView` match that same plain brown + centered transparent logo, removing the bear video/loading animation so launch and app loading no longer show the broken logo/square behavior.
   - Keep the logo centered and stable with fixed sizing.

2. **Personal Notes black-screen/kickback bug**
   - Fix the nested `NavigationStack` inside `NotesView`. Right now Notes is opened from `DMListView` through a navigation destination, then creates another `NavigationStack` for notes; opening an existing note can break the navigation hierarchy and pop back to DMs.
   - Keep Notes as the sheet-like pushed screen, but use one clean internal navigation path for the notes list and note editor so tapping old notes opens the editor instead of going black and returning.
   - Add a safe fallback if a note row can’t be decrypted/loaded so it doesn’t navigate into an empty black editor.

3. **DM sidebar ↔ chat threads: replicate the Notes relationship**
   - Remove the right-edge-only `EdgeSwipeOpen` from `DMListView`.
   - Stop treating chat like a separate edge-only destination.
   - Rewire chat opening to use the same `NavigationStack`/`navigationDestination` pattern that Personal Notes uses: chat threads open on top of the DM sidebar.
   - Keep `ChatView`’s native iOS interactive swipe-back enabled, but make it behave like Notes by allowing the system swipe-back across the screen instead of only the tiny edge where possible.
   - Add a full-screen horizontal swipe on the DM sidebar that reopens the last active conversation, with the same sheet-on-top feel: DM list swipes left into the last chat; chat swipes right back to the DM list.
   - Avoid the previous “fake side-by-side panel” behavior and avoid edge-only gestures.

4. **Profile preview GIFs: make avatar and banner animations actually play**
   - Update profile previews to render avatar and banner URLs through the animated image renderer regardless of file extension, because signed/storage URLs may not end in `.gif` or `.webp`.
   - Ensure animated views restart when the profile sheet appears/reappears so GIF avatars and banners don’t freeze.
   - Keep static images working through the same renderer or a safe fallback.

5. **Package/version update**
   - Bump the native build number and rebuild the iOS zip artifact after the fixes so you get a fresh package with these changes.