import SwiftUI
import UIKit

/// Edge-friendly horizontal swipe that **interactively tracks the finger** —
/// you can half-swipe, 75%-swipe, pause, reverse, or commit. Snaps back on
/// release unless the translation clears `threshold`, in which case the
/// matching callback fires and the underlying nav transition takes over.
///
/// Also rejects drags that are mostly vertical, so `ScrollView` content inside
/// the wrapped view can still scroll normally.
///
/// Optional `leftPreview` / `rightPreview` builders let the caller render a
/// visual stand-in of the destination screen. The preview stays anchored to
/// the edge the finger is dragging towards and slides in in lock-step with
/// the content, so a half-swipe reveals the next screen instead of a plain
/// black void — matching Discord's side-peek feel.
struct HorizontalSwipe<LeftPreview: View, RightPreview: View>: ViewModifier {
    var onLeft: (() -> Void)?
    var onRight: (() -> Void)?
    var threshold: CGFloat = 80
    let leftPreview: LeftPreview
    let rightPreview: RightPreview

    /// Live drag distance. Using `@GestureState` means SwiftUI resets it to
    /// zero for us the instant the finger lifts, and we animate that reset
    /// via a spring so non-committed swipes snap back smoothly.
    @GestureState private var dragX: CGFloat = 0

    func body(content: Content) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                // Destination revealed when dragging RIGHT (reveals on LEFT edge).
                // Starts fully off-screen to the left and slides in lock-step
                // with the content.
                rightPreview
                    .frame(width: geo.size.width, height: geo.size.height)
                    .offset(x: -geo.size.width + max(dragX, 0))
                    .allowsHitTesting(false)

                // Destination revealed when dragging LEFT (reveals on RIGHT edge).
                // Starts fully off-screen to the right and slides in lock-step
                // with the content.
                leftPreview
                    .frame(width: geo.size.width, height: geo.size.height)
                    .offset(x: geo.size.width + min(dragX, 0))
                    .allowsHitTesting(false)

                content
                    .frame(width: geo.size.width, height: geo.size.height)
                    .offset(x: dragX)
            }
            .animation(.interactiveSpring(response: 0.32, dampingFraction: 0.86), value: dragX)
            .simultaneousGesture(
                DragGesture(minimumDistance: 10, coordinateSpace: .global)
                    .updating($dragX) { value, state, _ in
                        let dx = value.translation.width
                        let dy = value.translation.height

                        // Heavily favour horizontal intent — keeps vertical
                        // scrolling smooth even when the user's thumb drifts.
                        guard abs(dx) > abs(dy) * 1.5 else { return }

                        // Only track the direction the parent actually has a
                        // handler for (drags the other way stay anchored).
                        if dx > 0, onRight != nil {
                            state = Self.rubberband(dx)
                        } else if dx < 0, onLeft != nil {
                            state = -Self.rubberband(-dx)
                        }
                    }
                    .onEnded { value in
                        let dx = value.translation.width
                        let dy = value.translation.height
                        guard abs(dx) > abs(dy) * 1.5 else { return }
                        if dx > threshold, let onRight { onRight() }
                        else if dx < -threshold, let onLeft { onLeft() }
                    }
            )
        }
    }

    /// Soft rubber-band so a finger dragging past the screen edge still shows
    /// some movement without exploding out of frame. Mirrors the feel of
    /// UIKit's interactive-pop gesture when you pull past the limit.
    private static func rubberband(_ x: CGFloat) -> CGFloat {
        let limit = max(UIScreen.main.bounds.width, 1)
        let factor: CGFloat = 0.55
        return limit * (1 - 1 / (x / limit * factor + 1))
    }
}

extension View {
    /// Plain variant — no destination preview (the area behind the content
    /// shows through as-is). Kept for call sites that don't want a peek.
    func horizontalSwipe(left: (() -> Void)? = nil,
                         right: (() -> Void)? = nil) -> some View {
        modifier(HorizontalSwipe(
            onLeft: left,
            onRight: right,
            leftPreview: Color.clear,
            rightPreview: Color.clear
        ))
    }

    /// Preview-enabled variant. `leftPreview` is revealed from the right edge
    /// while dragging left; `rightPreview` is revealed from the left edge
    /// while dragging right. Either can be `Color.clear` / `EmptyView` when
    /// that direction doesn't need a peek.
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
