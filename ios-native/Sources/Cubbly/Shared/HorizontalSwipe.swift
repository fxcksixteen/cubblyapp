import SwiftUI

/// Axis-locked horizontal swipe with light interactive movement. It avoids
/// fighting vertical scroll and never throws the screen far enough to expose
/// black gaps underneath.
struct HorizontalSwipe: ViewModifier {
    var onSwipeLeft: (() -> Void)?
    var onSwipeRight: (() -> Void)?
    var isActive: Binding<Bool>? = nil
    var threshold: CGFloat = 92
    var velocityThreshold: CGFloat = 140
    var maxPerpendicular: CGFloat = 42
    var maxOffset: CGFloat = 96

    @State private var dragX: CGFloat = 0
    @State private var lockedAxis: Axis? = nil

    func body(content: Content) -> some View {
        content
            .offset(x: dragX)
            .highPriorityGesture(
                DragGesture(minimumDistance: 6, coordinateSpace: .local)
                    .onChanged { value in
                        let dx = value.translation.width
                        let dy = value.translation.height

                        if lockedAxis == nil {
                            if abs(dx) > 10, abs(dx) > abs(dy) * 1.2 {
                                lockedAxis = .horizontal
                                isActive?.wrappedValue = true
                            } else if abs(dy) > 10, abs(dy) > abs(dx) {
                                lockedAxis = .vertical
                            } else {
                                return
                            }
                        }

                        guard lockedAxis == .horizontal, abs(dy) <= maxPerpendicular else {
                            dragX = 0
                            isActive?.wrappedValue = false
                            return
                        }

                        let raw = dx
                        let limited = min(max(raw, -maxOffset), maxOffset)
                        let overshoot = raw - limited
                        dragX = limited + overshoot * 0.12
                    }
                    .onEnded { value in
                        defer {
                            lockedAxis = nil
                            isActive?.wrappedValue = false
                        }

                        guard lockedAxis == .horizontal else {
                            dragX = 0
                            return
                        }

                        let dx = value.translation.width
                        let dy = value.translation.height
                        let vx = value.predictedEndTranslation.width - value.translation.width

                        let commitRight = dx >= threshold || (dx > 24 && vx >= velocityThreshold)
                        let commitLeft = dx <= -threshold || (dx < -24 && vx <= -velocityThreshold)

                        guard abs(dy) <= maxPerpendicular else {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.88)) { dragX = 0 }
                            return
                        }

                        if commitRight {
                            withAnimation(.spring(response: 0.22, dampingFraction: 0.92)) { dragX = maxOffset }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.04) {
                                onSwipeRight?()
                                dragX = 0
                            }
                        } else if commitLeft {
                            withAnimation(.spring(response: 0.22, dampingFraction: 0.92)) { dragX = -maxOffset }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.04) {
                                onSwipeLeft?()
                                dragX = 0
                            }
                        } else {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.88)) { dragX = 0 }
                        }
                    }
            )
    }
}

extension View {
    func horizontalSwipe(left: (() -> Void)? = nil, right: (() -> Void)? = nil, isActive: Binding<Bool>? = nil) -> some View {
        modifier(HorizontalSwipe(onSwipeLeft: left, onSwipeRight: right, isActive: isActive))
    }
}
