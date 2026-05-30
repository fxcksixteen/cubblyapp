import SwiftUI
import UIKit

/// Re-enables UIKit's built-in left-edge interactive-pop gesture even when
/// the SwiftUI navigation bar is hidden. iOS disables that recognizer by
/// default whenever a custom delegate refuses to begin it; this helper walks
/// up to the hosting `UINavigationController` and forces it back on so chat
/// threads inherit the same Apple-native swipe-back feel as Personal Notes —
/// without us writing any custom DragGesture / page-transition code.
///
/// Implementation notes:
///   * We do NOT install our own delegate. The previous version proxied the
///     delegate, which actually blocks UIKit's native pop on iOS 17/18/26 in
///     certain layouts (the system refuses to begin the recognizer when our
///     delegate doesn't implement every optional method UIKit expects).
///   * We re-assert `isEnabled = true` from both `viewDidAppear` and
///     `updateUIViewController` because SwiftUI re-hosts the representable
///     across navigation transitions.
struct NativeEdgeSwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> EnablerVC { EnablerVC() }
    func updateUIViewController(_ vc: EnablerVC, context: Context) { vc.enable() }
}

final class EnablerVC: UIViewController {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        enable()
    }
    override func didMove(toParent parent: UIViewController?) {
        super.didMove(toParent: parent)
        enable()
    }
    func enable() {
        guard let nav = findNav() else { return }
        nav.interactivePopGestureRecognizer?.isEnabled = true
        // Leave the recognizer's original delegate in place. UIKit's default
        // delegate already knows how to honour a hidden nav bar as long as
        // `isEnabled` is true and the stack has something to pop.
    }
    private func findNav() -> UINavigationController? {
        var p: UIViewController? = self.parent
        while let cur = p {
            if let nav = cur as? UINavigationController { return nav }
            if let nav = cur.navigationController { return nav }
            p = cur.parent
        }
        return navigationController
    }
}

extension View {
    /// Attach inside a pushed `NavigationStack` destination to keep the
    /// native left-edge swipe-back active even when the nav bar is hidden.
    func nativeEdgeSwipeBack() -> some View {
        background(NativeEdgeSwipeBackEnabler().frame(width: 0, height: 0))
    }
}
