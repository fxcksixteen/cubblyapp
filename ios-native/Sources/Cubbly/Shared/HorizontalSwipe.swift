import SwiftUI

/// Drag-to-dismiss modifier for Discord-style horizontal swipe gestures.
/// Wrap any view and supply `onSwipeRight` / `onSwipeLeft` callbacks.
struct HorizontalSwipe: ViewModifier {
    var onSwipeLeft: (() -> Void)? = nil
    var onSwipeRight: (() -> Void)? = nil
    var threshold: CGFloat = 60
    var maxPerpendicular: CGFloat = 75

    func body(content: Content) -> some View {
        content
            .gesture(
                DragGesture(minimumDistance: 20, coordinateSpace: .local)
                    .onEnded { v in
                        let dx = v.translation.width
                        let dy = v.translation.height
                        guard abs(dy) <= maxPerpendicular else { return }
                        if dx >= threshold { onSwipeRight?() }
                        else if dx <= -threshold { onSwipeLeft?() }
                    }
            )
    }
}

extension View {
    func horizontalSwipe(left: (() -> Void)? = nil, right: (() -> Void)? = nil) -> some View {
        modifier(HorizontalSwipe(onSwipeLeft: left, onSwipeRight: right))
    }
}
