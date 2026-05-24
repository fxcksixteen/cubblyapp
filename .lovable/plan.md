## v0.1.6 native iOS plan

### Scope
Bring the Swift native iOS app closer to web/desktop parity for calling, shop/coins, profile previews, activity presence, DM actions, unread badges, chat scrolling, and custom message sounds.

### 1. Fix and harden native calling
- Keep the native Swift/WebRTC approach. The project already uses the same Chromium WebRTC engine that browsers use, so switching to React Native is not the best path and would add risk rather than fix the current call flow.
- Repair the call handshake so iOS reliably connects with web/desktop:
  - ensure the caller creates a voice `WebRTCClient` and sends an offer after receiving `ready-for-offer`;
  - ensure accept/join paths always create the right answerer/caller peer connection;
  - improve ICE buffering and call state transitions so calls do not get stuck on “Calling…”;
  - keep call event participant heartbeats in sync with the existing backend.
- Add a first-class CubblyBot call test path:
  - make calling CubblyBot start a local echo WebRTC call that loops mic audio back;
  - add clear in-call state for “CubblyBot echo test” so you can verify mic, routing, speaker, mute, deafen, and WebRTC without another real user;
  - keep it isolated from normal realtime signaling so it cannot create ghost backend calls.
- Keep outgoing video/screenshare disabled unless a safe Swift WebRTC sender implementation is already possible in this patch; preserve receiving screenshares from web/desktop.

### 2. Build the full native Shop tab
- Replace the “Coming soon” shop screen with a native shop matching the web/desktop catalog:
  - All / Name Colors / Themes / Badges tabs;
  - promo tiles for Space Theme, Motion Name Colors, and Earn Coins;
  - item previews for static, gradient, animated name colors, themes, animated/premium themes, and badges;
  - owned/equipped/locked states;
  - purchase flow via `purchase_shop_item`;
  - equip/unequip via `equip_shop_item` / `unequip_shop_item`;
  - not-enough-coins and already-owned feedback.
- Add native coin state synced to the same backend tables as web/desktop:
  - load `user_coins.balance` for the signed-in user;
  - listen for realtime balance updates;
  - show a coin pill/info panel explaining earning/spending.
- Add the missing native shop artwork resources needed for parity, including coin images and badge art copied from the web asset set.

### 3. Add native settings access for shop-owned cosmetics
- In native profile/settings areas, add catalog sections equivalent to web settings:
  - Name Colors;
  - Badges;
  - Themes.
- Locked items route users to the Shop tab; owned items can be equipped directly.
- Reuse the same shop data/store so inventory/equipped state stays consistent between the Shop tab and settings.

### 4. Fix animated profile pictures and banners in profile previews
- Expand animated media detection beyond `.gif`/Giphy/Tenor to include animated WebP and signed/storage URLs where the file extension may be hidden.
- Update profile preview rendering so animated avatars and banners use the animated image renderer reliably.
- Keep static images on the existing lightweight path.

### 5. Add activity presence display on iOS
- Add an iOS `ActivityService` that reads and subscribes to `user_activities`, matching web/desktop visibility rules.
- Show friends’ activity in:
  - DM sidebar rows;
  - profile preview sheets;
  - any existing active/presence surfaces where web already shows “Playing/Using”.
- Add an Activity Privacy setting that controls whether the iOS user shares activity visibility.
- iOS cannot reliably scan arbitrary running games like the desktop Electron app, so iOS will display synced activity from desktop/web and preserve the user’s privacy setting; it will not fake game detection from iOS.

### 6. Add DM sidebar long-press user options menu
- Add a custom Cubbly-branded Discord-style compact menu when pressing and holding a DM row/user.
- Include practical actions that match available native functionality:
  - View Profile;
  - Message/Open Chat;
  - Copy Username;
  - optionally Remove Friend / Block if existing repositories support it cleanly.
- Keep the styling native, dark, compact, and consistent with Cubbly’s theme tokens.

### 7. Make chat opening always load bottom-up and land at latest message
- Keep fetching latest messages descending from the backend, then render ascending.
- Make initial chat entry scroll to the true latest message after hydration/layout, not just on first `onAppear`.
- Preserve upward pagination without yanking the user back down when older messages load.
- Re-scroll to bottom when opening from DM sidebar, notification deep-link, or horizontal swipe.

### 8. Add native unread badges on the server rail
- Add an unread-count service using `conversation_participants.last_read_at`, matching the web `useUnreadCounts` behavior.
- Show a profile/group avatar bubble with a red unread count indicator in the left server rail for unread DMs/group DMs.
- Keep badges live through realtime `messages` inserts and `conversation_participants` updates.
- Clear/hide the active conversation’s rail badge when opening it, and sync read state through the existing `mark_conversation_read` RPC.

### 9. Fix iOS push notification sound to use Cubbly’s message sound
- Add `message.wav` as a named notification sound for APNs payloads and local notifications.
- Update the native notification presentation path so foreground/local message notifications request the custom sound only when message sounds are enabled.
- Update the APNs backend function payload to send the custom sound name for iOS remote pushes, so closed/background notifications use the Cubbly sound instead of the user’s default iPhone tone.
- Keep the existing in-app `SoundService` ding for realtime foreground messages.

### Files likely to change
- `ios-native/Sources/Cubbly/Core/Services/CallStore.swift`
- `ios-native/Sources/Cubbly/Core/Services/WebRTCClient.swift`
- `ios-native/Sources/Cubbly/Core/Services/BotEchoCall.swift`
- `ios-native/Sources/Cubbly/Core/Services/SoundService.swift`
- `ios-native/Sources/Cubbly/Core/Services/NotificationService.swift`
- `ios-native/Sources/Cubbly/Core/Services/APNsRegistrar.swift`
- new native shop/coins/activity/unread services and models
- `ios-native/Sources/Cubbly/Features/Shop/ShopView.swift`
- `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift`
- `ios-native/Sources/Cubbly/Features/DMs/ServerRail.swift`
- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift`
- `ios-native/Sources/Cubbly/Features/Chat/ProfilePopupView.swift`
- `ios-native/Sources/Cubbly/Features/You/YouView.swift`
- native project resources under `ios-native/Resources/...`
- `supabase/functions/send-apns-push/index.ts`

### Validation
- I will not run a production web build manually.
- I will make the native changes in small, focused commits/files and rely on the harness checks.
- Since you said you’ll test later, I’ll finish implementation and summarize what changed plus the exact areas to test on device.