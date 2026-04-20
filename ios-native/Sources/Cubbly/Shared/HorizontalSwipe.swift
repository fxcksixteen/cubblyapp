import SwiftUI

/// Smooth, continuous horizontal-swipe modifier with rubber-band feedback and
/// velocity-aware commit (matches Discord/iMessage feel). Wrap any view and
/// supply `left:` / `right:` callbacks. The view is offset live during the
/// drag and snaps back unless the user crosses the threshold OR flicks fast.
struct HorizontalSwipe: ViewModifier {
    var onSwipeLeft: (() -> Void)?
    var onSwipeRight: (() -> Void)?
    var threshold: CGFloat = 80
    var velocityThreshold: CGFloat = 600
    var maxPerpendicular: CGFloat = 90

    @State private var dragX: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .offset(x: dragX)
            .gesture(
                DragGesture(minimumDistance: 12, coordinateSpace: .local)
                    .onChanged { v in
                        let dy = v.translation.height
                        guard abs(dy) <= maxPerpendicular * 1.5 else { return }
                        // Rubber-band: progressively resist past 120pt.
                        let raw = v.translation.width
                        if abs(raw) <= 120 {
                            dragX = raw
                        } else {
                            let extra = abs(raw) - 120
                            let damped = 120 + extra * 0.35
                            dragX = raw < 0 ? -damped : damped
                        }
                    }
                    .onEnded { v in
                        let dx = v.translation.width
                        let dy = v.translation.height
                        let vx = v.predictedEndTranslation.width - v.translation.width
                        let commit: Bool
                        let direction: CGFloat
                        if abs(dy) > maxPerpendicular {
                            commit = false
                            direction = 0
                        } else if dx >= threshold || vx >= velocityThreshold {
                            commit = true; direction = 1
                        } else if dx <= -threshold || vx <= -velocityThreshold {
                            commit = true; direction = -1
                        } else {
                            commit = false; direction = 0
                        }
                        if commit {
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                                dragX = direction > 0 ? 600 : -600
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                                if direction > 0 { onSwipeRight?() } else { onSwipeLeft?() }
                                dragX = 0
                            }
                        } else {
                            withAnimation(.spring(response: 0.42, dampingFraction: 0.78)) {
                                dragX = 0
                            }
                        }
                    }
            )
    }
}

extension View {
    func horizontalSwipe(left: (() -> Void)? = nil, right: (() -> Void)? = nil) -> some View {
        modifier(HorizontalSwipe(onSwipeLeft: left, onSwipeRight: right))
    }
}
