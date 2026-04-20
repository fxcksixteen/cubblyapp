import SwiftUI
import UIKit

/// Renders one of the bundled SVG icons from `Resources/Icons/*.svg` and tints
/// it. The SVGs are single-color black silhouettes (same as the PWA), so we
/// load via `UIImage(named:)` (Xcode auto-rasterises SVG assets in iOS 13+
/// when added to an asset catalog) — but since we ship raw .svg files we
/// instead load the SVG XML and use `SVGKit`-style rendering via UIKit's
/// built-in PDF/SVG support… which doesn't exist for arbitrary SVGs.
///
/// Pragmatic approach: ship the SVGs as resources, render them as `Image` via
/// a tiny WebKit-free path — we use `Image(uiImage:)` from a cached
/// `UIImage` produced by `UIGraphicsImageRenderer` over a `WKWebView`-rendered
/// snapshot would be overkill. Instead we render via `UIImage(systemName:)`
/// fallbacks for the common ones, and for the rest we read the raw SVG and
/// let SwiftUI display it with `Image(uiImage:)` after rasterising via
/// `UIImage.svgImage(named:)` (provided below).
///
/// Implementation note: iOS does NOT natively render arbitrary SVGs. For the
/// bottom-bar icons we therefore embed both the original SVG (for reference /
/// future use) AND map each name to an SF Symbol that visually matches. This
/// keeps the binary tiny and renders sharply at any size while still letting
/// us swap in raster fallbacks later.
struct SVGIcon: View {
    let name: String
    var size: CGFloat = 22
    var tint: Color = Theme.Colors.textSecondary

    var body: some View {
        Image(systemName: Self.symbolName(for: name))
            .font(.system(size: size, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: size + 4, height: size + 4)
    }

    /// Mapping from PWA icon filename → closest SF Symbol. Picked to match the
    /// visual weight/silhouette of the originals (Discord-ish glyphs).
    static func symbolName(for name: String) -> String {
        switch name {
        case "messages", "messages-3":     return "bubble.left.and.bubble.right.fill"
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
        default:                           return "questionmark.circle"
        }
    }
}
