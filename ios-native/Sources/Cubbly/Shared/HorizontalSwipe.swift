import SwiftUI

/// Edge-friendly horizontal swipe gesture that does NOT swallow vertical
/// scrolling. Used for swipe-back in ChatView and swipe-left-to-last-DM in
/// the home tab.
struct HorizontalSwipe: ViewModifier {
    var onLeft: (() -> Void)?
    var onRight: (() -> Void)?
    var threshold: CGFloat = 60

    @State private var startX: CGFloat?

    func body(content: Content) -> some View {
        content.simultaneousGesture(
            DragGesture(minimumDistance: 12, coordinateSpace: .global)
                .onChanged { v in
                    if startX == nil { startX = v.startLocation.x }
                }
                .onEnded { v in
                    defer { startX = nil }
                    let dx = v.translation.width
                    let dy = v.translation.height
                    guard abs(dx) > abs(dy) * 1.5 else { return }
                    if dx > threshold { onRight?() }
                    else if dx < -threshold { onLeft?() }
                }
        )
    }
}

extension View {
    func horizontalSwipe(left: (() -> Void)? = nil,
                         right: (() -> Void)? = nil) -> some View {
        modifier(HorizontalSwipe(onLeft: left, onRight: right))
    }
}
