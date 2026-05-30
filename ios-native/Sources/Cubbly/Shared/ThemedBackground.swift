import SwiftUI

/// Shared themed background — paints the user's equipped Shop theme exactly
/// like the web/desktop animated backgrounds. Used by both `MainTabView`
/// (under the tab stack) and `ChatView` (so the animated theme also shows
/// through inside chat threads, not just behind the DM sidebar).
struct ThemedBackground: View {
    @ObservedObject private var theme = ThemeStore.shared
    /// When true (inside a chat thread), the base color is rendered with a
    /// translucent overlay so the animated theme behind it shows through.
    var translucent: Bool = false

    var body: some View {
        ZStack {
            Theme.Colors.bgPrimary
            if let id = theme.equippedShopThemeId,
               ["theme_midnight_aurora","theme_synthwave","theme_lava_flow","theme_borealis"].contains(id) {
                AnimatedThemeGradient(colors: theme.backgroundGradient)
                    .opacity(0.35)
                    .allowsHitTesting(false)
            } else if theme.equippedShopThemeId == "theme_space" {
                SpaceThemeAnimated().allowsHitTesting(false)
            } else if theme.equippedShopThemeId == "theme_sky_dusk" {
                SkyDuskAnimated().allowsHitTesting(false)
            } else if theme.equippedShopThemeId == "theme_snowy_drift" {
                SnowyDriftAnimated().allowsHitTesting(false)
            } else if theme.equippedShopThemeId == "theme_moonlit_hills" {
                MoonlitHillsAnimated().allowsHitTesting(false)
            } else {
                LinearGradient(colors: theme.backgroundGradient,
                               startPoint: .topLeading, endPoint: .bottomTrailing)
                    .opacity(theme.equippedShopThemeId != nil ? 0.35 : 0.18)
                    .allowsHitTesting(false)
            }
            if translucent && theme.equippedShopThemeId != nil {
                Theme.Colors.bgPrimary.opacity(0.45).allowsHitTesting(false)
            }
        }
        .ignoresSafeArea()
    }
}
