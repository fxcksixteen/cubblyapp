import SwiftUI

/// Design tokens — mirrors `src/index.css` and `tailwind.config.ts` from the web app.
enum Theme {
    enum Colors {
        private static var p: ThemeStore.Palette { MainActor.assumeIsolated { ThemeStore.shared.palette } }
        // App surfaces
        static var bgPrimary: Color { p.bgPrimary }
        static var bgSecondary: Color { p.bgSecondary }
        static var bgTertiary: Color { p.bgTertiary }
        static var bgFloating: Color { p.bgFloating }
        static var bgHover: Color { p.hover }

        // Text
        static var textPrimary: Color { p.textPrimary }
        static var textSecondary: Color { p.textSecondary }
        static var textMuted: Color { p.textMuted }

        // Accents
        static var primary: Color { p.primary }
        static var primaryGlow: Color { p.primaryGlow }
        static let success       = Color(hex: 0x3BA55C)
        static let danger        = Color(hex: 0xED4245)
        static let warning       = Color(hex: 0xFAA61A)

        // Borders
        static var border: Color { p.border }
        static var divider: Color { p.divider }
    }

    /// Static Nunito faces shipped under Resources/Fonts — addressed by their
    /// real PostScript family name so iOS doesn't try to retag axis weights.
    /// This is what kills the "Unable to update Font Descriptor's weight" spam.
    enum Fonts {
        static func cubbly(_ size: CGFloat, _ weight: Font.Weight = .regular, italic: Bool = false) -> Font {
            Font.custom(faceName(for: weight, italic: italic), size: size)
        }

        static let title       = cubbly(22, .bold)
        static let heading     = cubbly(17, .semibold)
        static let body        = cubbly(15, .regular)
        static let bodyMedium  = cubbly(15, .semibold)
        static let bodySmall   = cubbly(13, .regular)
        static let caption     = cubbly(11, .semibold)

        static func faceName(for weight: Font.Weight, italic: Bool = false) -> String {
            let base: String
            switch weight {
            case .ultraLight, .thin, .light: base = "Light"
            case .regular:                   base = "Regular"
            case .medium:                    base = "Medium"
            case .semibold:                  base = "SemiBold"
            case .bold:                      base = "Bold"
            case .heavy:                     base = "ExtraBold"
            case .black:                     base = "Black"
            default:                         base = "Regular"
            }
            return "Nunito-\(base)\(italic ? "Italic" : "")"
        }
    }

    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 10
        static let lg: CGFloat = 14
        static let xl: CGFloat = 20
        static let pill: CGFloat = 999
    }
}

extension Font {
    /// Project-wide shorthand for Nunito with a guaranteed-correct weighted face.
    static func cubbly(_ size: CGFloat, _ weight: Font.Weight = .regular, italic: Bool = false) -> Font {
        Theme.Fonts.cubbly(size, weight, italic: italic)
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1.0) {
        let r = Double((hex >> 16) & 0xFF) / 255.0
        let g = Double((hex >> 8) & 0xFF) / 255.0
        let b = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
