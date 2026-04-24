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

    @State private var loadedImage: UIImage?

    var body: some View {
        ZStack {
            Circle().fill(Self.color(for: fallbackText))
            if let img = loadedImage {
                Image(uiImage: img)
                    .resizable()
                    .scaledToFill()
            } else if url != nil {
                // Briefly show initials only on the very first load; then the
                // cache hands the image back instantly on subsequent appears.
                initials
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .task(id: url) { await load() }
    }

    private func load() async {
        guard let url else { loadedImage = nil; return }
        if let cached = AvatarImageCache.shared.image(for: url) {
            loadedImage = cached
            return
        }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            if let img = UIImage(data: data) {
                AvatarImageCache.shared.store(img, for: url)
                await MainActor.run { self.loadedImage = img }
            }
        } catch { /* keep initials */ }
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
