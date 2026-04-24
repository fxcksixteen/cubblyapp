import SwiftUI
import SVGKit

/// Renders one of the bundled SVG icons from `Resources/Icons/*.svg` using
/// SVGKit, then tints with `tint`. Pixel-matches the PWA's bottom-bar icons.
struct SVGIcon: View {
    let name: String
    var size: CGFloat = 22
    var tint: Color = Theme.Colors.textSecondary

    var body: some View {
        if let img = Self.loadTinted(name: name, size: size, tint: UIColor(tint)) {
            Image(uiImage: img)
                .renderingMode(.original)
                .interpolation(.high)
                .frame(width: size, height: size)
        } else {
            Image(systemName: Self.fallbackSymbol(for: name))
                .font(.system(size: size, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: size, height: size)
        }
    }

    private static let cache = NSCache<NSString, UIImage>()

    private static func resolveURL(_ name: String) -> URL? {
        // XcodeGen ships our `Resources/Icons/*.svg` as a folder reference, so
        // the files end up at the bundle root. Try flat first, then nested,
        // then a recursive walk as a last-ditch fallback.
        if let u = Bundle.main.url(forResource: name, withExtension: "svg") {
            return u
        }
        if let u = Bundle.main.url(forResource: name, withExtension: "svg", subdirectory: "Icons") {
            return u
        }
        if let resourcePath = Bundle.main.resourcePath {
            let fm = FileManager.default
            if let enumerator = fm.enumerator(atPath: resourcePath) {
                for case let path as String in enumerator
                where path.hasSuffix("/\(name).svg") || path == "\(name).svg" {
                    return URL(fileURLWithPath: resourcePath).appendingPathComponent(path)
                }
            }
        }
        return nil
    }

    static func loadTinted(name: String, size: CGFloat, tint: UIColor) -> UIImage? {
        let scale = UIScreen.main.scale
        let pxSize = CGSize(width: size * scale, height: size * scale)
        let key = "\(name)|\(Int(pxSize.width))x\(Int(pxSize.height))|\(tint.cgColor.components?.description ?? "x")" as NSString
        if let cached = cache.object(forKey: key) { return cached }

        guard let url = resolveURL(name),
              let svg = SVGKImage(contentsOf: url) else { return nil }
        svg.size = CGSize(width: size, height: size)
        // Force the SVG layer to a transparent backdrop. Without this, SVGKit
        // sometimes hands back a UIImage with opaque alpha across the whole
        // bounding box, which makes the `.destinationIn` blend leak the tint
        // color into the full rectangle — the "square halo" around round
        // status dots.
        svg.caLayerTree.backgroundColor = UIColor.clear.cgColor
        guard let raw = svg.uiImage else { return nil }

        // Non-opaque renderer format so the tinted output preserves alpha
        // outside the SVG path.
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        format.scale = scale
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: size, height: size),
            format: format
        )
        let tinted = renderer.image { ctx in
            let rect = CGRect(origin: .zero, size: CGSize(width: size, height: size))
            let cg = ctx.cgContext
            // Draw the raw SVG first — this establishes the alpha mask for
            // the glyph. Then fill the same rect with the tint color using
            // `.sourceIn`, which only paints where the destination already
            // has alpha. The final image has alpha=0 everywhere outside the
            // actual path, so no square outline can show through.
            raw.draw(in: rect)
            cg.setBlendMode(.sourceIn)
            cg.setFillColor(tint.cgColor)
            cg.fill(rect)
        }
        cache.setObject(tinted, forKey: key)
        return tinted
    }

    static func fallbackSymbol(for name: String) -> String {
        switch name {
        case "home":                       return "house.fill"
        case "messages", "messages-3":   return "bubble.left.and.bubble.right.fill"
        case "friends":                    return "person.2.fill"
        case "shop":                       return "bag.fill"
        case "settings":                   return "gearshape.fill"
        case "search":                     return "magnifyingglass"
        case "send":                       return "paperplane.fill"
        case "add-user":                   return "person.fill.badge.plus"
        case "remove-user":                return "person.fill.badge.minus"
        case "block-user":                 return "nosign"
        case "call":                       return "phone.fill"
        case "call-end":                   return "phone.down.fill"
        case "video-camera":               return "video.fill"
        case "microphone":                 return "mic.fill"
        case "microphone-mute":            return "mic.slash.fill"
        case "headphone":                  return "headphones"
        case "headphone-deafen":           return "headphones.circle"
        case "screenshare":                return "rectangle.on.rectangle"
        case "gif":                        return "play.rectangle.fill"
        case "emoji-react":                return "face.smiling"
        case "folder-file":                return "paperclip"
        case "copy":                       return "doc.on.doc"
        case "activity":                   return "gamecontroller.fill"
        case "status-dnd":                 return "minus.circle.fill"
        case "status-idle":                return "moon.fill"
        case "status-invisible":           return "circle"
        case "empty-pending":              return "tray"
        case "empty-blocked":              return "nosign"
        default:                             return "questionmark.circle"
        }
    }
}
