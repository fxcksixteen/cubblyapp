import SwiftUI

/// Circular avatar with fallback to initials over a deterministic color.
/// Mirrors `src/lib/profileColors.ts` from the web app (hash-by-username).
///
/// Uses a process-wide image cache so scrolling back through chat history
/// shows the actual avatar immediately instead of flashing the initials
/// fallback while AsyncImage refetches the URL.
struct AvatarView: View {
    let url: URL?
    let fallbackText: String
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            Circle().fill(Self.color(for: fallbackText))
            if let url {
                // Always use the ImageIO-backed renderer for remote avatars.
                // Storage/CDN signed URLs often hide the original .gif/.webp
                // extension, so URL-extension checks alone incorrectly fell
                // back to static UIImage decoding in profile previews.
                AnimatedImageView(url: url, contentMode: .scaleAspectFill)
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

    static func isAnimated(url: URL) -> Bool {
        let full = url.absoluteString.lowercased()
        let path = url.path.lowercased()
        return path.hasSuffix(".gif") || path.hasSuffix(".webp") || path.hasSuffix(".apng")
            || full.contains(".gif") || full.contains(".webp") || full.contains(".apng")
            || full.contains("giphy.com") || full.contains("media.giphy") || full.contains("tenor.com")
            || full.contains("/animated/") || full.contains("anim=1")
    }
}

/// Process-wide UIImage cache keyed by URL. Capped at ~80 MB so very long
/// chat sessions don't balloon memory.
final class AvatarImageCache {
    static let shared = AvatarImageCache()
    private let cache = NSCache<NSURL, UIImage>()
    private init() {
        cache.totalCostLimit = 80 * 1024 * 1024
    }
    func image(for url: URL) -> UIImage? { cache.object(forKey: url as NSURL) }
    func store(_ image: UIImage, for url: URL) {
        let cost = Int(image.size.width * image.size.height * 4)
        cache.setObject(image, forKey: url as NSURL, cost: cost)
    }
}
