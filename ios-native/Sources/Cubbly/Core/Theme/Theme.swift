import SwiftUI

/// Design tokens — mirrors `src/index.css` and `tailwind.config.ts` from the web app.
/// Hex values pulled directly from the Cubbly dark palette.
enum Theme {
    enum Colors {
        // App surfaces (matches --app-bg-* in the web CSS)
        static let bgPrimary    = Color(hex: 0x313338)
        static let bgSecondary  = Color(hex: 0x2B2D31)
        static let bgTertiary   = Color(hex: 0x1E1F22)
        static let bgFloating   = Color(hex: 0x111214)
        static let bgHover      = Color(white: 1.0).opacity(0.05)

        // Text
        static let textPrimary   = Color(hex: 0xF2F3F5)
        static let textSecondary = Color(hex: 0xB5BAC1)
        static let textMuted     = Color(hex: 0x80848E)

        // Accents
        static let primary       = Color(hex: 0xE6A833) // warm Cubbly orange
        static let primaryGlow   = Color(hex: 0xF2C062)
        static let success       = Color(hex: 0x3BA55C)
        static let danger        = Color(hex: 0xED4245)
        static let warning       = Color(hex: 0xFAA61A)

        // Borders
        static let border        = Color(white: 1.0).opacity(0.06)
        static let divider       = Color(white: 1.0).opacity(0.04)
    }

    enum Fonts {
        // Falls back to system if Nunito isn't bundled yet.
        static let title       = Font.custom("Nunito-Bold",     size: 22).fallback(.system(size: 22, weight: .bold))
        static let heading     = Font.custom("Nunito-SemiBold", size: 17).fallback(.system(size: 17, weight: .semibold))
        static let body        = Font.custom("Nunito-Regular",  size: 15).fallback(.system(size: 15))
        static let bodyMedium  = Font.custom("Nunito-SemiBold", size: 15).fallback(.system(size: 15, weight: .semibold))
        static let bodySmall   = Font.custom("Nunito-Regular",  size: 13).fallback(.system(size: 13))
        static let caption     = Font.custom("Nunito-SemiBold", size: 11).fallback(.system(size: 11, weight: .semibold))
    }

    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 10
        static let lg: CGFloat = 14
        static let xl: CGFloat = 20
        static let pill: CGFloat = 999
    }
}

// MARK: - Helpers

extension Color {
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}

private extension Font {
    /// Returns self — `Font.custom` already falls back to system silently if the
    /// font name isn't registered, so this exists purely for call-site readability
    /// and to make the intent explicit. (Keeps Theme.Fonts declarations chainable.)
    func fallback(_ other: Font) -> Font { self }
}
