# Cubbly iOS (Native)

Native SwiftUI iOS app for Cubbly, sharing the same Lovable Cloud backend
as the web app in this repo. **iOS 17+, Swift 5.9+.**

This folder is fully self-contained: download just `ios-native/`, open in
Xcode on a Mac, hit Run.

---

## One-time setup (Mac)

1. Install **Xcode 15.3+** from the Mac App Store.
2. Install [XcodeGen](https://github.com/yonaskolb/XcodeGen) to (re)generate
   the `.xcodeproj` from `project.yml`:
   ```bash
   brew install xcodegen
   ```
3. From inside `ios-native/`:
   ```bash
   xcodegen generate
   open Cubbly.xcodeproj
   ```
   Xcode will resolve Swift Package dependencies on first open
   (supabase-swift). Wait for "Package Resolution" to finish, then hit ⌘R.

---

## Running on a real device / TestFlight

1. In Xcode → project settings → Signing & Capabilities, set your Team
   (your Apple Developer account).
2. Bundle ID is `app.cubbly.ios` — change it if it conflicts in your account.
3. Plug in an iPhone, select it as the run destination, ⌘R.
4. For TestFlight: Product → Archive → Distribute App → App Store Connect.

---

## Backend

Reads from the same Lovable Cloud Supabase project as the web app.
Credentials are baked into `Sources/Cubbly/App/CubblyConfig.swift`
(public anon key — safe to ship, RLS protects everything).

If the web app's Supabase URL / anon key ever change, update them in
`CubblyConfig.swift`. They mirror the values in `.env` of the web project.

---

## Folder layout

```
ios-native/
├── project.yml              # XcodeGen manifest — source of truth
├── Package.swift            # SwiftPM modules (for CLI builds + tests)
├── Sources/Cubbly/
│   ├── App/                 # Entry point, config, app delegate
│   ├── Auth/                # Login, register, session
│   ├── Core/
│   │   ├── Models/          # Codable models matching DB tables
│   │   ├── Repositories/    # Supabase CRUD + realtime per domain
│   │   └── Theme/           # Colors, fonts, spacing — matches web tokens
│   ├── Features/
│   │   ├── Friends/
│   │   ├── DMs/
│   │   ├── Chat/
│   │   ├── Shop/
│   │   └── You/
│   └── Shared/              # Reusable views (Avatar, StatusDot, etc.)
├── Resources/
│   ├── Assets.xcassets/     # App icon, accent color
│   └── Info.plist
└── Tests/
    └── CubblyTests/
```

---

## v1 scope (chat-only)

Voice/video calls, screenshare viewing, and CallKit are **v1.1**. v1 ships:
- Email + password auth (matches web app's `login-with-username` flow)
- Friends (online / all / pending / blocked / add by username)
- DMs (1:1 + groups), realtime messages, typing indicators
- Attachments, GIF picker (Giphy edge function), link previews
- Push notifications (APNs via the existing `push_subscriptions` table)
- Profile + status

---

## Notes

- **Pixel-match the web mobile UI** is the explicit design goal. Colors,
  spacing, fonts, and component shapes mirror the React/Tailwind values.
- **Nunito** is bundled as a font resource and registered at app launch.
- All Supabase reads use the same RLS policies — no schema changes needed.
