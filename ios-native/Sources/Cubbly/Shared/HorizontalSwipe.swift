import SwiftUI
import UIKit

/// Native-feeling horizontal swipe with **axis lock**.
///
/// Behaviour:
/// - On the first ~10pt of finger movement the gesture commits to either the
///   horizontal or vertical axis. If vertical wins, this gesture aborts for
///   the rest of the touch so the underlying `ScrollView` keeps the
///   interaction (no diagonal sliding).
/// - If horizontal wins, only the horizontal component of subsequent
///   movement drives `dragX` — vertical finger drift is ignored entirely.
/// - Release combines distance + predicted velocity (Discord/iOS swipe-back
///   feel): a flick clears the commit threshold even on a short drag.
/// - On commit we animate `dragX` all the way off-screen before firing the
///   callback so the destination peek slides into place instead of cutting.
///
/// Optional `leftPreview` / `rightPreview` builders let the caller render a
/// stand-in of the destination screen that tracks the finger.
struct HorizontalSwipe<LeftPreview: View, RightPreview: View>: ViewModifier {
    var onLeft: (() -> Void)?
    var onRight: (() -> Void)?
    var threshold: CGFloat = 80
    let leftPreview: LeftPreview
    let rightPreview: RightPreview

    /// Current drag offset (positive = dragging right, negative = dragging left).
    @State private var dragX: CGFloat = 0

    /// Per-touch axis decision. nil while still undecided.
    /// .horizontal = we own the gesture; .vertical = we let go for the rest of this touch.
    @State private var lockedAxis: Axis?

    private enum Axis { case horizontal, vertical }

    func body(content: Content) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                // Right-drag destination, revealed from the LEFT edge.
                rightPreview
                    .frame(width: geo.size.width, height: geo.size.height)
                    .offset(x: -geo.size.width + max(dragX, 0))
                    .allowsHitTesting(false)

                // Left-drag destination, revealed from the RIGHT edge.
                leftPreview
                    .frame(width: geo.size.width, height: geo.size.height)
                    .offset(x: geo.size.width + min(dragX, 0))
                    .allowsHitTesting(false)

                content
                    .frame(width: geo.size.width, height: geo.size.height)
                    .offset(x: dragX)
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 6, coordinateSpace: .local)
                    .onChanged { value in
                        let dx = value.translation.width
                        let dy = value.translation.height

                        // Decide axis once, after enough movement to judge intent.
                        if lockedAxis == nil {
                            let total = max(abs(dx), abs(dy))
                            guard total > 10 else { return }
                            if abs(dy) > abs(dx) * 1.1 {
                                lockedAxis = .vertical
                                return
                            }
                            // Honour direction availability — if the parent
                            // didn't provide a handler in this direction,
                            // bail so we don't fight the scroll view.
                            if dx > 0 && onRight == nil { lockedAxis = .vertical; return }
                            if dx < 0 && onLeft == nil  { lockedAxis = .vertical; return }
                            lockedAxis = .horizontal
                        }
                        guard lockedAxis == .horizontal else { return }

                        // Apply rubber-band when dragging into a direction
                        // we can't commit, otherwise track 1:1 then soften
                        // past the screen edge.
                        let limit = geo.size.width
                        let raw = dx
                        let eased: CGFloat
                        if abs(raw) < limit * 0.6 {
                            eased = raw
                        } else {
                            let sign: CGFloat = raw < 0 ? -1 : 1
                            let excess = abs(raw) - limit * 0.6
                            eased = sign * (limit * 0.6 + Self.rubberband(excess, limit: limit * 0.6))
                        }
                        dragX = eased
                    }
                    .onEnded { value in
                        defer {
                            lockedAxis = nil
                        }
                        guard lockedAxis == .horizontal else {
                            dragX = 0
                            return
                        }
                        let dx = value.translation.width
                        let predicted = value.predictedEndTranslation.width
                        let velocity = predicted - dx
                        let commitDistance: CGFloat = threshold
                        let commitVelocity: CGFloat = 250

                        let goRight = (dx > commitDistance || (dx > 24 && velocity > commitVelocity)) && onRight != nil
                        let goLeft  = (dx < -commitDistance || (dx < -24 && velocity < -commitVelocity)) && onLeft != nil

                        if goRight {
                            withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.86)) {
                                dragX = geo.size.width
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                                onRight?()
                                dragX = 0
                            }
                        } else if goLeft {
                            withAnimation(.interactiveSpring(response: 0.28, dampingFraction: 0.86)) {
                                dragX = -geo.size.width
                            }
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                                onLeft?()
                                dragX = 0
                            }
                        } else {
                            withAnimation(.interactiveSpring(response: 0.34, dampingFraction: 0.82)) {
                                dragX = 0
                            }
                        }
                    }
            )
        }
    }

    /// Soft rubber-band past the screen edge. Mirrors the feel of UIKit's
    /// interactive-pop gesture when you pull past the limit.
    private static func rubberband(_ x: CGFloat, limit: CGFloat) -> CGFloat {
        let factor: CGFloat = 0.55
        return limit * (1 - 1 / (x / limit * factor + 1))
    }
}

extension View {
    /// Plain variant — no destination preview.
    func horizontalSwipe(left: (() -> Void)? = nil,
                         right: (() -> Void)? = nil) -> some View {
        modifier(HorizontalSwipe(
            onLeft: left,
            onRight: right,
            leftPreview: Color.clear,
            rightPreview: Color.clear
        ))
    }

    /// Preview-enabled variant. `leftPreview` is revealed from the right
    /// edge while dragging left; `rightPreview` is revealed from the left
    /// edge while dragging right.
    func horizontalSwipe<L: View, R: View>(
        left: (() -> Void)? = nil,
        right: (() -> Void)? = nil,
        @ViewBuilder leftPreview: () -> L,
        @ViewBuilder rightPreview: () -> R
    ) -> some View {
        modifier(HorizontalSwipe(
            onLeft: left,
            onRight: right,
            leftPreview: leftPreview(),
            rightPreview: rightPreview()
        ))
    }
}
