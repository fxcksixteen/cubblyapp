import SwiftUI

/// Small colored circle used as an avatar overlay, matching the PWA
/// `StatusIndicator` component (online/idle/dnd/invisible/offline).
struct StatusDot: View {
    enum Status: String { case online, idle, dnd, invisible, offline }

    let status: Status
    var size: CGFloat = 12
    var borderColor: Color = Theme.Colors.bgPrimary

    init(status: Status, size: CGFloat = 12, borderColor: Color = Theme.Colors.bgPrimary) {
        self.status = status
        self.size = size
        self.borderColor = borderColor
    }

    /// Convenience for raw strings coming from the database.
    init(rawStatus: String, isOnline: Bool, size: CGFloat = 12, borderColor: Color = Theme.Colors.bgPrimary) {
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
            Circle().fill(borderColor)
                .frame(width: size + 4, height: size + 4)
            shape
                .frame(width: size, height: size)
        }
    }

    @ViewBuilder
    private var shape: some View {
        switch status {
        case .online:
            Circle().fill(Theme.Colors.success)
        case .idle:
            Circle().fill(Color(hex: 0xFAA61A))
        case .dnd:
            Circle().fill(Theme.Colors.danger)
                .overlay(
                    Capsule()
                        .fill(Theme.Colors.bgPrimary)
                        .frame(width: size * 0.55, height: size * 0.2)
                )
        case .invisible, .offline:
            Circle().stroke(Theme.Colors.textMuted, lineWidth: max(2, size * 0.18))
                .background(Circle().fill(Theme.Colors.bgPrimary))
        }
    }
}
