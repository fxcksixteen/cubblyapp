import SwiftUI

/// Design tokens — mirrors `src/index.css` and `tailwind.config.ts` from the web app.
enum Theme {
    enum Colors {
        // App surfaces
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
        static let primary       = Color(hex: 0xE6A833)
        static let primaryGlow   = Color(hex: 0xF2C062)
        static let success       = Color(hex: 0x3BA55C)
        static let danger        = Color(hex: 0xED4245)
        static let warning       = Color(hex: 0xFAA61A)

        // Borders
        static let border        = Color(white: 1.0).opacity(0.06)
        static let divider       = Color(white: 1.0).opacity(0.04)
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
