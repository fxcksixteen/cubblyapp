You're right — I bumped the changelog/plan but never updated the actual iOS bundle metadata. Both `Resources/Info.plist` and `project.yml` still say `0.1.4` / build `11`, and `CubblyConfig.appVersion` is still `"0.1.4"`. That's why Xcode archives as v0.1.4 (11).

## Fix

Bump version to **0.1.5** and build number to **12** in all three places that carry it:

1. `ios-native/Resources/Info.plist`
   - `CFBundleShortVersionString` → `0.1.5`
   - `CFBundleVersion` → `12`

2. `ios-native/project.yml` (so re-running `xcodegen generate` doesn't revert it)
   - `CFBundleShortVersionString: "0.1.5"`
   - `CFBundleVersion: "12"`

3. `ios-native/Sources/Cubbly/App/CubblyConfig.swift`
   - `appVersion = "0.1.5"` (shown in Settings)

## After applying

In Xcode: Product → Clean Build Folder (⇧⌘K), then Archive again — it'll read 0.1.5 (12). No need to re-run xcodegen unless you want to; the Info.plist edit alone is enough for the next archive.

I'll also produce a fresh `cubbly-ios-native-v0.1.5.zip` with the corrected metadata so the download matches.