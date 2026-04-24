import SwiftUI

/// Status indicator overlay matching the PWA `StatusIndicator`:
/// - online   → solid green dot
/// - idle     → orange moon icon
/// - dnd      → red "do not disturb" icon
/// - invisible/offline → muted grey "invisible" icon
///
/// Every variant sits inside the same outer "border" ring so the dot punches
/// a consistent hole in whatever backdrop it overlays.
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

    /// Convenience for status strings coming from the database + live presence.
    /// When the target user chose "invisible", we deliberately show them as
    /// online to third parties (the PWA does the same thing).
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

    /// Dedicated init for rendering the **current user's own** status — unlike
    /// `rawStatus:isOnline:`, this keeps `invisible` visible so the user can
    /// actually tell which status they've selected on the You tab.
    init(ownStatus: String, size: CGFloat = 14, borderColor: Color = Theme.Colors.bgPrimary) {
        self.status = Status(rawValue: ownStatus) ?? .online
        self.size = size
        self.borderColor = borderColor
    }

    var body: some View {
        ZStack {
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
            // The status SVGs only fill ~83% of their 24×24 viewBox, so we
            // render them a touch larger than `size` to visually match the
            // solid online dot.
            SVGIcon(name: "status-idle", size: size * 1.18, tint: Color(hex: 0xFAA61A))
        case .dnd:
            SVGIcon(name: "status-dnd", size: size * 1.18, tint: Color(hex: 0xED4245))
        case .invisible, .offline:
            SVGIcon(name: "status-invisible", size: size * 1.18, tint: Color(hex: 0x747F8D))
        }
    }
}
