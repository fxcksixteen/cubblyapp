

# iOS Native: Realtime Chat + Asset Pipeline Fixes

## Problems

1. **Chat is not live** — `MessagesRepository` only does one-shot fetches. There's no Supabase Realtime channel subscribed to `postgres_changes` on `messages`, so new/edited/deleted messages only appear after a manual refresh.
2. **Conversation list doesn't update live** — same root cause for `ConversationsRepository` (no realtime on `conversations` / `messages` bumps).
3. **SVG icons not rendering** — `SVGIcon` looks for files in the `Icons/` subdirectory, but `project.yml` likely flattens resources into the bundle root, so `Bundle.main.url(forResource:withExtension:subdirectory:"Icons")` returns nil and we fall back to SF Symbols.
4. **Launch screen black/broken** — `LaunchScreen.storyboard` references image `cubbly-nobg`, but the asset catalog imageset is empty (no PNGs inside `cubbly-nobg.imageset/`), and `Info.plist` may not point at the storyboard.
5. **Brand PNGs/logos missing** — `cubbly-logo.imageset`, `cubbly-nobg.imageset`, `cubbly-wordmark.imageset` only contain `Contents.json`, no actual PNG files. `LoginView` / `ServerRail` render blank.
6. **.mov / animated assets** — `AnimatedImageView` handles GIFs via SDWebImage but there's no `.mov` playback path; need `AVPlayerLayer`-backed view (or confirm we don't actually ship `.mov` and the user means GIF/Lottie).

## Fix Plan

### 1. Realtime messages (`MessagesRepository` + `ChatView`)

Add a `subscribeToMessages(conversationID:) -> AsyncStream<RealtimeEvent>` API that wraps `supabase.realtimeV2.channel("messages:<id>")` with `postgresChange(InsertAction.self/UpdateAction.self/DeleteAction.self, schema:"public", table:"messages", filter: "conversation_id=eq.<id>")`.

In `ChatView.swift`:
- On `.task(id: conversation.id)`: start the stream, hydrate sender profile + reply preview for each event, and merge into `@State messages` (dedupe by id, replace optimistic temp- ids).
- On view disappear / id change: `await channel.unsubscribe()`.
- Keep optimistic send — when realtime INSERT arrives with same content+sender, swap the temp row.

This mirrors `src/hooks/useMessages.ts` exactly.

### 2. Realtime conversation list (`ConversationsRepository` + `DMListView`)

Subscribe to `messages` INSERTs across all conversations the user participates in (single channel, no filter — RLS already restricts) and bump the affected `ConversationSummary.lastMessageAt` + reorder. Also subscribe to `conversations` UPDATE for `updated_at` changes. Drives unread dots and last-message preview live.

### 3. SVG icon resolution (`SVGIcon.swift`)

Fix `resolveURL`:
- Try `Bundle.main.url(forResource: name, withExtension: "svg")` first (flat bundle — this is how XcodeGen ships them).
- Then try the `Icons/` subdirectory variant.
- Then walk `resourcePath` recursively as a last resort (already there).

Also confirm `project.yml` ships `Resources/Icons/**` with `type: folder` (preserves the subdirectory) OR as flat resources — pick one and align `SVGIcon` to it. Plan: ship as **flat files** (simpler) and update `resolveURL` to look at bundle root first.

### 4. Brand assets — populate the imagesets

The three imagesets (`cubbly-logo`, `cubbly-nobg`, `cubbly-wordmark`) have `Contents.json` but no PNGs. Copy the PNGs from the web project's `src/assets/` (or `public/`) into:
- `ios-native/Resources/Assets.xcassets/cubbly-logo.imageset/cubbly-logo.png` (+ `@2x`, `@3x`)
- `ios-native/Resources/Assets.xcassets/cubbly-nobg.imageset/cubbly-nobg.png` (+ `@2x`, `@3x`)
- `ios-native/Resources/Assets.xcassets/cubbly-wordmark.imageset/cubbly-wordmark.png` (+ `@2x`, `@3x`)

Update each `Contents.json` to reference the three filenames at scales 1x/2x/3x.

After that, `Image("cubbly-nobg")` (used in `LaunchScreen.storyboard` and `LoginView`) renders properly and the launch screen stops being a brown rectangle with no logo.

### 5. Launch screen wiring (`Info.plist` + `project.yml`)

- Ensure `Info.plist` has `UILaunchStoryboardName = LaunchScreen` (no `.storyboard` suffix).
- Ensure `project.yml` includes `Resources/LaunchScreen.storyboard` as a resource and sets `INFOPLIST_KEY_UILaunchStoryboardName` if using build-setting–style plist generation.

### 6. .mov / animated content

Add `VideoPlayerView.swift` (thin `UIViewRepresentable` over `AVPlayerLayer` with looping + muted autoplay) and route any `.mov` URL through it inside `AttachmentItem` / message rendering. If the user actually meant Lottie (`.json`), confirm before adding the dep — but the safe baseline is AVKit-based playback for `.mov`/`.mp4`.

### 7. Repackage

Regenerate `Cubbly.xcodeproj` via `xcodegen`, zip as **`cubbly-ios-v6.zip`** excluding `.build`, `DerivedData`, `.xcodeproj` state, and `.DS_Store`.

## Files Touched

- `ios-native/Sources/Cubbly/Core/Repositories/MessagesRepository.swift` — add realtime subscribe API
- `ios-native/Sources/Cubbly/Core/Repositories/ConversationsRepository.swift` — add realtime subscribe API
- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift` — consume stream, merge optimistic
- `ios-native/Sources/Cubbly/Features/DMs/DMListView.swift` — consume stream, reorder list
- `ios-native/Sources/Cubbly/Shared/SVGIcon.swift` — fix bundle resolution order
- `ios-native/Sources/Cubbly/Shared/VideoPlayerView.swift` — **new**, AVPlayer wrapper
- `ios-native/Sources/Cubbly/Features/Chat/AttachmentsPicker.swift` (or wherever attachments render) — route `.mov` to `VideoPlayerView`
- `ios-native/Resources/Assets.xcassets/cubbly-logo.imageset/` — add PNGs + update `Contents.json`
- `ios-native/Resources/Assets.xcassets/cubbly-nobg.imageset/` — add PNGs + update `Contents.json`
- `ios-native/Resources/Assets.xcassets/cubbly-wordmark.imageset/` — add PNGs + update `Contents.json`
- `ios-native/Resources/Info.plist` — confirm `UILaunchStoryboardName`
- `ios-native/project.yml` — confirm Resources globs include Icons + LaunchScreen
- Repackage → `/mnt/documents/cubbly-ios-v6.zip`

## Required from you (one ask)

The brand PNGs aren't in `ios-native/`. I need to source them — confirm I should pull from the web project's existing assets (`src/assets/` or `public/`) and reuse the same files for the imagesets. If you have higher-res `@2x`/`@3x` versions you'd prefer, drop them in chat; otherwise I'll generate `@2x`/`@3x` by upscaling the highest-res source available in the repo.

