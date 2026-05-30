import SwiftUI
import Foundation

/// Tiny helper: turn a plain-text string into a SwiftUI `Text` that highlights
/// http(s) URLs and `www.` links, matching how the web/desktop note viewer
/// renders links inside note bodies. URLs use the theme's primary color and
/// underline. The host view should wrap the result in something that calls
/// `openURL` when the user taps a link — see `LinkifiedNoteBody` below.
enum LinkifyHelper {
    static let urlRegex: NSRegularExpression = {
        // http://, https://, or bare www.* — same rules used in src/lib/linkify.tsx.
        let pattern = #"\b((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?'\"])"#
        return (try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])) ?? NSRegularExpression()
    }()

    struct Hit {
        let range: NSRange
        let raw: String
        let url: URL
    }

    static func findLinks(in text: String) -> [Hit] {
        let ns = text as NSString
        let matches = urlRegex.matches(in: text, options: [],
                                       range: NSRange(location: 0, length: ns.length))
        return matches.compactMap { m -> Hit? in
            let raw = ns.substring(with: m.range)
            let normalized = raw.lowercased().hasPrefix("http") ? raw : "https://\(raw)"
            guard let u = URL(string: normalized) else { return nil }
            return Hit(range: m.range, raw: raw, url: u)
        }
    }

    /// Build an `AttributedString` with link styling so a single `Text` view
    /// can render mixed prose + tappable hyperlinks.
    static func attributed(_ text: String, linkColor: Color) -> AttributedString {
        var attr = AttributedString(text)
        let hits = findLinks(in: text)
        let ns = text as NSString
        for hit in hits {
            let raw = ns.substring(with: hit.range)
            // Locate the same substring inside the AttributedString. Anchoring
            // by NSRange is unsafe across grapheme clusters, so use the raw
            // substring search anchored at the start.
            if let r = attr.range(of: raw) {
                attr[r].link = hit.url
                attr[r].foregroundColor = linkColor
                attr[r].underlineStyle = .single
            }
        }
        return attr
    }
}
