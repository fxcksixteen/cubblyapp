import SwiftUI
import SVGKit

/// Untinted bundled artwork renderer for the exact web/desktop PNG + SVG
/// cosmetics copied into `Resources/Images`.
struct BundledAssetImage: View {
    let name: String
    var contentMode: ContentMode = .fit

    var body: some View {
        Group {
            if let image = Self.loadImage(named: name) {
                Image(uiImage: image)
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: contentMode)
            } else {
                Image(systemName: "star.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(Theme.Colors.primary)
            }
        }
    }

    private static let cache = NSCache<NSString, UIImage>()

    static func loadImage(named name: String) -> UIImage? {
        if let cached = cache.object(forKey: name as NSString) { return cached }
        if let image = BrandAsset.uiImage(named: name) {
            cache.setObject(image, forKey: name as NSString)
            return image
        }
        if let url = BrandAsset.bundledURL(named: name, ext: "svg", preferredSubdirectories: ["Images/badges", "Images", nil]),
           let svg = SVGKImage(contentsOf: url),
           let image = svg.uiImage {
            cache.setObject(image, forKey: name as NSString)
            return image
        }
        return nil
    }
}

enum ShopArtwork {
    static func badgeAssetName(for itemId: String) -> String? {
        switch itemId {
        case "badge_chat_champ":      return "chat_champion"
        case "badge_early_supporter": return "early_supporter"
        case "badge_friendly":        return "friendly"
        case "badge_gamer":           return "gamer"
        case "badge_legend":          return "legend"
        case "badge_night_owl":       return "night_owl"
        case "badge_og":              return "og"
        case "badge_petite":          return "petite"
        case "badge_voice_veteran":   return "voice_veteran"
        default: return nil
        }
    }
}