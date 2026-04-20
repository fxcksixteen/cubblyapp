

# iOS native — fix resources, navigation, fonts, chat media

A focused pass to make the v2 zip actually run with all assets working, restore navigation, fix the fonts/presence/console errors, and make group avatars + chat images behave correctly. Everything ships as a fresh `cubbly-ios-v3.zip`.

## 1. Make resources actually bundle in Xcode (root cause fix)

The zip already contains `Resources/Images`, `Videos`, `Fonts`, `Icons`, but Xcode (when opened standalone) wasn't pulling them in. I'll fix that for good:

- Update `project.yml` so each resource folder is listed with explicit `type: folder` and `buildPhase: resources` (not just `path:`). XcodeGen will then create blue **folder references** under the Cubbly target. Folder refs survive even if the user opens the project before re-running `xcodegen`.
- Add a top-level `Resources/Resources.xcassets` migration: move PNG branding (`cubbly-logo`, `cubbly-wordmark`, `cubbly-nobg`) into the asset catalog as image sets so they're guaranteed to ship and addressable via `Image("cubbly-logo")`. This eliminates "file in folder didn't get copied" failure modes.
- Add an `AppIcon.appiconset` rebuilt from the new bear logo PNG you uploaded this turn (`Cubbly_Logo-3.png`) so the app icon is correct on first install.
- Add a `LaunchScreen.storyboard` (warm bear-cocoa background `#96725E` + centered `cubbly-nobg` logo) and switch `UILaunchScreen` in Info.plist to use it. The .mov keeps playing in `SplashView` after launch.
- Ship a `RESOURCES_VERIFY.md` with a one-line `find Resources -type f` snapshot inside the zip so it's obvious every asset is present.

## 2. Font console spam ("Unable to update Font Descriptor's weight to 0.3 / 0.56")

iOS is rejecting weights because the variable Nunito file isn't being matched as a variable font; it's being treated as a single static face, so SwiftUI's `.weight(.semibold)` etc. fails to apply.

- Switch from a single variable TTF to the **8 static Nunito + 8 italic** weights (Light/Regular/Medium/SemiBold/Bold/ExtraBold/Black + italics). Drop them under `Resources/Fonts/`. Update `UIAppFonts` in Info.plist to list every face.
- Replace `Theme.Fonts` with weight-aware helpers (`Font.custom("Nunito-SemiBold", size: …)`) and add a `Font.cubbly(_ size, _ weight)` helper. Sweep every `Font.custom("Nunito", size: …).weight(…)` call site (~25 spots across DMListView, MainTabView, YouView, FriendsView, GiphyPickerView, etc.) to use the helper. This kills every "Unable to update Font Descriptor's weight" warning and gives correct weights everywhere.

## 3. Presence channel warning ("track presence after subscribing", "add callbacks before subscribing")

`PresenceService.swift` calls `subscribeWithError()` first and only then iterates `presenceChange()` and calls `track(...)` — that's the wrong order for supabase-swift v2.

- Restructure `start(userID:)` to: build channel → register `presenceChange()` listener task → `track(...)` → finally `subscribeWithError()`. This silences both warnings and makes presence reliable.

## 4. Navigation regressions (chat scroll, swipe, black flash, DM right-swipe)

- Rip out `HorizontalSwipe` entirely. It's fighting both vertical scroll and SwiftUI's built-in interactive pop. Replace with the system back gesture by removing `.navigationBarBackButtonHidden(true)` on `ChatView` and instead hiding only the back-button label/title, while leaving `interactivePopGestureRecognizer` enabled. This gives Apple-native edge-swipe-to-dismiss with a real preview of the underlying screen (no black flash, no half-swipes through ghost screens).
- Re-enable full vertical scrolling in chat (the `isSwipingOut` guard goes away).
- DMListView no longer has any horizontal swipe attached, so the "swipe right on DM list shows black screen" bug is gone. Tapping a row still pushes into chat normally.

## 5. You-tab banner expanding the layout

The `AnimatedImageView` is sized via `.frame(height: 132)` on the parent ZStack but its underlying `UIImageView` reports its intrinsic image size, which causes layout to grow when a tall GIF loads.

- Wrap `AnimatedImageView` so its `UIImageView` returns `intrinsicContentSize = .zero`, then constrain it with `.frame(maxWidth: .infinity).frame(height: 132).clipped()` and `.allowsHitTesting(false)`. Banner will render at a fixed strip height regardless of GIF aspect.

## 6. Group chat avatar (matches desktop)

- Add `Shared/GroupAvatar.swift`: a tiled mini-mosaic (1/2/3-up) using each member's `avatarURL`, mirroring the web `GroupAvatar.tsx`.
- `ConversationSummary.avatarURL` returns `nil` for groups when no `pictureURL` is set; update `DMRow` and `ChatView` header to render `GroupAvatar(members:)` when `conversation.isGroup && pictureURL == nil`, otherwise the regular `AvatarView`.

## 7. Chat images: tap to fullscreen + correct GIF aspect

- Add `Shared/ImageLightbox.swift` (full-screen cover with pinch-to-zoom + swipe-down to dismiss, matches the web `ImageLightbox.tsx`).
- In `DiscordStyleBubble.content`:
  - Image branch becomes a `Button { lightbox = url } label: { AsyncImage … .scaledToFit() }` and presents the lightbox via `.fullScreenCover`.
  - GIF branch: change from a fixed `220x160` frame to `.frame(maxWidth: 260)` with `.aspectRatio(contentMode: .fit)` and `AnimatedImageView(url: url, contentMode: .scaleAspectFit)`. No more "way too zoomed in".
  - Video branch already uses fullscreen — keep, just style the play overlay.

## 8. Attachments half-sheet glitch after granting full photo access

- Recreate `AttachmentsPicker` as a UIKit-backed PhotoKit grid (`PHCachingImageManager` + `UICollectionView`) wrapped via `UIViewControllerRepresentable`. Pure SwiftUI `LazyVGrid` over `PHAsset` is the source of the glitch (it re-fetches thumbnails on every state change and races with `PHPhotoLibrary` change observers).
- Add a `PHPhotoLibraryChangeObserver` so newly granted access immediately repopulates the grid instead of staying blank.

## 9. Friends list and previously broken bot/aria/♡ rows

- Already restored in the database last turn. Sanity check in `FriendsRepository`: ensure rows where `requester_id = me OR addressee_id = me AND status = 'accepted'` are returned and de-duplicated by the *other* user's id. Add a unit-style print-on-empty so future regressions are visible.

## 10. Ship

- Re-run `xcodegen generate` inside the zipped project (so the .xcodeproj inside the zip is in sync with the new `project.yml`).
- Bundle the resources, regenerated `Cubbly.xcodeproj`, and a `README_FIRST.txt` describing: open `.xcodeproj`, set signing team, run.
- Output `cubbly-ios-v3.zip` to `/mnt/documents/`.

## Files touched

```
ios-native/project.yml
ios-native/Resources/Info.plist
ios-native/Resources/Assets.xcassets/AppIcon.appiconset/{Contents.json, cubbly-icon-1024.png}
ios-native/Resources/Assets.xcassets/{cubbly-logo, cubbly-wordmark, cubbly-nobg}.imageset/*
ios-native/Resources/LaunchScreen.storyboard       (new)
ios-native/Resources/Fonts/Nunito-{Light,Regular,Medium,SemiBold,Bold,ExtraBold,Black}{,-Italic}.ttf
ios-native/Sources/Cubbly/Core/Theme/Theme.swift   (font helper rewrite)
ios-native/Sources/Cubbly/Core/Services/PresenceService.swift  (subscribe order)
ios-native/Sources/Cubbly/Shared/HorizontalSwipe.swift          (delete)
ios-native/Sources/Cubbly/Shared/GroupAvatar.swift              (new)
ios-native/Sources/Cubbly/Shared/ImageLightbox.swift            (new)
ios-native/Sources/Cubbly/Shared/AnimatedImageView.swift        (intrinsic size fix)
ios-native/Sources/Cubbly/Features/Chat/ChatView.swift          (system back, image lightbox, GIF aspect, group avatar in header)
ios-native/Sources/Cubbly/Features/Chat/AttachmentsPicker.swift (UIKit rewrite)
ios-native/Sources/Cubbly/Features/DMs/DMListView.swift         (group avatar in row)
ios-native/Sources/Cubbly/Features/You/YouView.swift            (banner sizing)
ios-native/Sources/Cubbly/Features/MainTabView.swift            (font sweep)
ios-native/Sources/Cubbly/Features/{Friends, Shop, DMs}/*       (font sweep only)
```

Approve and I'll ship `cubbly-ios-v3.zip` with everything wired correctly so opening the .xcodeproj works without manual import.

