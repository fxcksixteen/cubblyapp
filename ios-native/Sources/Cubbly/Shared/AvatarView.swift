import SwiftUI

/// Circular avatar with fallback to initials over a deterministic color.
/// Mirrors `src/lib/profileColors.ts` from the web app (hash-by-username).
struct AvatarView: View {
    let url: URL?
    let fallbackText: String
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            Circle().fill(Self.color(for: fallbackText))
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFill()
                    default:
                        initials
                    }
                }
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
    }

    private var initials: some View {
        Text(Self.initials(from: fallbackText))
            .font(.system(size: size * 0.4, weight: .bold))
            .foregroundStyle(.white)
    }

    static func initials(from name: String) -> String {
        let parts = name.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first.map(String.init) }.joined().uppercased()
    }

    /// Deterministic color from a string (8 brand-friendly hues).
    static func color(for seed: String) -> Color {
        let palette: [UInt32] = [
            0xE6A833, 0xED7B45, 0xD8543F, 0x9B59B6,
            0x3498DB, 0x16A085, 0x27AE60, 0xE67E22
        ]
        var hash: UInt32 = 5381
        for byte in seed.utf8 { hash = (hash &* 33) &+ UInt32(byte) }
        return Color(hex: palette[Int(hash % UInt32(palette.count))])
    }
}
