import SwiftUI

/// Status indicator overlay matching the PWA `StatusIndicator` exactly:
/// - online   → solid green dot
/// - idle     → orange tinted moon SVG inside a bordered bubble
/// - dnd      → red tinted "do not disturb" SVG inside a bordered bubble
/// - invisible/offline → muted grey "invisible" SVG inside a bordered bubble
struct StatusDot: View {
    enum Status: String { case online, idle, dnd, invisible, offline }

    let status: Status
    var size: CGFloat = 14
    var borderColor: Color = Theme.Colors.bgPrimary

    init(status: Status, size: CGFloat = 14, borderColor: Color = Theme.Colors.bgPrimary) {
        self.status = status
        self.size = size
        self.borderColor = borderColor
    }

    /// Convenience for raw strings coming from the database.
    init(rawStatus: String, isOnline: Bool, size: CGFloat = 14, borderColor: Color = Theme.Colors.bgPrimary) {
        if !isOnline {
            self.status = .offline
        } else if rawStatus == "invisible" {
            self.status = .online
        } else {
            self.status = Status(rawValue: rawStatus) ?? .online
        }
        self.size = size
        self.borderColor = borderColor
    }

    var body: some View {
        ZStack {
            // Outer ring (matches PWA's border-color trick on the indicator).
            Circle()
                .fill(borderColor)
                .frame(width: size + 4, height: size + 4)
            inner
        }
    }

    @ViewBuilder
    private var inner: some View {
        switch status {
        case .online:
            Circle().fill(Color(hex: 0x3BA55C))
                .frame(width: size, height: size)
        case .idle:
            iconBubble(name: "status-idle", tint: Color(hex: 0xFAA61A))
        case .dnd:
            iconBubble(name: "status-dnd", tint: Color(hex: 0xED4245))
        case .invisible, .offline:
            iconBubble(name: "status-invisible", tint: Color(hex: 0x747F8D))
        }
    }

    /// Mirrors the PWA's bubble-with-icon layout (svg sits inside a small
    /// circle whose background matches the surrounding border color).
    private func iconBubble(name: String, tint: Color) -> some View {
        ZStack {
            Circle().fill(borderColor).frame(width: size, height: size)
            SVGIcon(name: name, size: size * 0.92, tint: tint)
        }
    }
}
