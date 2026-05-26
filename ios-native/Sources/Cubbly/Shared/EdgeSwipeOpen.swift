import SwiftUI

/// A thin right-edge gesture surface that fires `action` when the user flicks
/// inward from the edge. Visual hint bar fades in while dragging so the user
/// has a discoverable handle (Discord-style). Use inside an `.overlay(alignment: .trailing)`.
struct EdgeSwipeOpen: View {
    let action: () -> Void
    @State private var dragX: CGFloat = 0
    @State private var active = false

    var body: some View {
        ZStack(alignment: .trailing) {
            // Subtle vertical accent strip that fades in while pulling.
            RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                .fill(Theme.Colors.primary.opacity(0.55))
                .frame(width: 3)
                .padding(.vertical, 80)
                .opacity(active ? 1 : 0)
                .offset(x: max(-12, dragX * 0.25))
                .animation(.easeOut(duration: 0.15), value: active)

            Color.clear
                .contentShape(Rectangle())
        }
        .gesture(
            DragGesture(minimumDistance: 8)
                .onChanged { v in
                    // Only treat as horizontal pull if mostly horizontal.
                    guard abs(v.translation.width) > abs(v.translation.height) else {
                        active = false; dragX = 0; return
                    }
                    active = true
                    dragX = v.translation.width
                }
                .onEnded { v in
                    defer { active = false; dragX = 0 }
                    guard abs(v.translation.width) > abs(v.translation.height) else { return }
                    let dx = v.translation.width
                    let predicted = v.predictedEndTranslation.width
                    if dx < -55 || predicted < -120 {
                        action()
                    }
                }
        )
    }
}
