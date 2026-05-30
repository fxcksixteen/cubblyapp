# v0.1.7 native iOS — fix pass

## 1. Native horizontal swipe between DM sidebar ↔ chat threads (and bottom-bar disappearing bug)

**Smoking gun (per your test):** going into Personal Notes and back doesn't fix the missing bottom bar, but going into a chat thread does. That means `ChromeStore.tabBarHidden` flipped to `true` and never flipped back — it's tied to `ChatView.onDisappear`, which iOS sometimes skips on rapid pop. NotesView also flips it but is reached so rarely it doesn't reset the flag set by chat. And Notes' edge swipe works because Notes does NOT call `.navigationBarHidden(true)` / `.toolbar(.hidden, …)` — UIKit's built-in interactive pop only stays smooth when the nav bar layout is intact. ChatView hides it, breaking the gesture.

Fix:
- **ChatView.swift**: remove `.navigationBarHidden(true)` and `.toolbar(.hidden, for: .navigationBar)`. Replace with `.toolbar(.hidden, for: .navigationBar)` only at the `UINavigationBar` cosmetic level using `.toolbarBackground(.hidden, …)` + a custom `principal` `ToolbarItem` that hosts the existing `header` view. Keep `.nativeEdgeSwipeBack()`. This gives Notes-identical native pop AND keeps the custom Cubbly header.
- **ChromeStore-driven tab bar** is brittle. Replace with derivation: in `MainTabView`, set `tabBarHidden` from the SwiftUI `NavigationStack` path emptiness instead of from ChatView/NotesView lifecycle. Concretely, hoist `openConversation` / `showNotes` state up via a thin `DMNavStore` observable (or simply read `chrome.pushedRouteCount` incremented by ChatView/NotesView `onAppear` and decremented in BOTH `onDisappear` AND in `DMListView`'s `onAppear` as a safety reset to 0). This guarantees returning to the DM sidebar always re-shows the bottom bar even if `onDisappear` is skipped.
- **DMListView.onAppear**: defensively force `ChromeStore.shared.tabBarHidden = false` whenever the DM list reappears — fixes the "stuck invisible" state for free.

## 2. Equipped badges & name colors in DM sidebar AND profile popups

- DMListView already calls `CubblyNameText` and `UserBadgesRow` but is being read from the store before realtime data lands. Add an explicit `.onAppear { UserBadgesStore.shared.request(uid); NameColorsStore.shared.request(uid) }` for every visible row, including FriendsStrip avatars.
- `ProfilePopupView` currently renders a plain `Text(displayName)` and no badges. Replace with `CubblyNameText(userId:, text:)` and append `UserBadgesRow(userID:, size: 18)` under the name — same layout the web `ProfileCard` uses.
- Make sure `UserBadgesStore.shared.startRealtime()` is awaited at session-start (already is in `SessionStore.swift`), and add the same `request(uid)` on the chat header avatar tap.

## 3. "+" attachment button crashes the app

Most likely cause: `InlineAttachPanel` calls `PHPhotoLibrary.authorizationStatus(for: .readWrite)` from a `@State` default-value initializer, which runs on a non-main thread on first body evaluation and trips PhotoKit's main-thread assertion on iOS 18/26 in release builds.

Fix in `InlineAttachPanel.swift`:
- Initialise `authStatus` to `.notDetermined` and read the real value inside `.task` only.
- Wrap the `PHPhotoLibrary.authorizationStatus` and `requestAuthorization` calls in `await MainActor.run`.
- Defer building `PHFetchOptions` / `PHAsset.fetchAssets` to `.task` too (never in `body`).
- Guard `.photosPicker` and `.fileImporter` behind the `attachPanelOpen` parent so they only mount once visible.
- Add `NSPhotoLibraryAddUsageDescription` to `Info.plist` (camera save path) — its absence crashes some PhotoKit flows even when only reading.

## 4. Animated chat-thread backgrounds (space, sky_dusk, snowy_drift, moonlit_hills, midnight_aurora, synthwave, lava_flow, borealis)

`ChatView.chatBackground` currently only paints `Theme.Colors.bgPrimary` or its 55% variant. Mirror the `MainTabView` background ZStack here so the animated theme actually appears inside the thread:
- Extract `MainTabView`'s background ZStack into a reusable `ThemedBackground` view (in `Shared/`).
- Use it as the base layer of both `MainTabView` and `ChatView` (and inside `NotesEditorScreen` for parity). Overlay `Theme.Colors.bgPrimary.opacity(themed ? 0.55 : 1)` for legibility.

## 5. Notes attachment upload — "new row violates row-level security policy"

The bucket policy is `(auth.uid())::text = (storage.foldername(name))[1]` and our path is `<uid>/<id>.bin`, so the path is correct. The RLS error is coming from the `upsert: true` codepath: Supabase Swift sends a `POST … x-upsert: true` which is dispatched against the storage `UPDATE` policy when an object would be overwritten, and against `INSERT` otherwise — combined with our custom `metadata` dict it can hit a stale UID claim if the JWT is older than `auth.refresh_threshold`.

Fix in `NotesStore.swift uploadAttachment(...)`:
- Switch back to `upsert: false` (the path uses a fresh UUID, no collision risk).
- Before upload, `try await client.auth.refreshSession()` if the current `accessToken` expires within 60s, so the storage REST call carries a fresh `sub` claim that matches the path prefix.
- Read `currentUserId` from `client.auth.currentUser?.id` at upload time rather than the cached value captured at vault-unlock.
- Surface server error body verbatim in the existing toast so the next failure is debuggable.

## 6. Misc

- DM quick-menu sheet detents already `[.medium, .large]` — verify by re-reading line 120 area after Plan 1 lands.
- `FriendsStrip` `.simultaneousGesture` from the prior pass stays.

## Technical detail

Files to edit:
- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift` (nav bar visibility, themed background, header into toolbar principal)
- `ios-native/Sources/Cubbly/Features/MainTabView.swift` (use shared `ThemedBackground`, drive tabBarHidden from nav state)
- `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift` (force-reset tabBarHidden onAppear, request badges/colors per row)
- `ios-native/Sources/Cubbly/Features/Chat/ProfilePopupView.swift` (CubblyNameText + UserBadgesRow)
- `ios-native/Sources/Cubbly/Features/Chat/InlineAttachPanel.swift` (PhotoKit safety)
- `ios-native/Sources/Cubbly/Features/Notes/NotesView.swift` (drive tab bar via shared mechanism)
- `ios-native/Sources/Cubbly/Core/Services/NotesStore.swift` (upload: refresh session, upsert:false, fresh uid)
- `ios-native/Resources/Info.plist` (add `NSPhotoLibraryAddUsageDescription`)

Files to create:
- `ios-native/Sources/Cubbly/Shared/ThemedBackground.swift` (extracted animated/gradient theme stack)

No DB migrations needed — storage RLS is already correct.
