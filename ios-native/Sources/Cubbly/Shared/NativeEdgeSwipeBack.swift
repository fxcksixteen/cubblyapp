import SwiftUI
import UIKit

/// Re-enables UIKit's built-in left-edge interactive-pop gesture even when
/// the SwiftUI navigation bar is hidden. iOS disables that recognizer by
/// default whenever the top bar is hidden; this helper walks up to the
/// hosting `UINavigationController` and forces it back on so chat threads
/// inherit the same Apple-native swipe-back feel as Personal Notes —
/// without us writing any custom DragGesture/page transition code.
struct NativeEdgeSwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> EnablerVC { EnablerVC() }
    func updateUIViewController(_ vc: EnablerVC, context: Context) { vc.enable() }
}

final class EnablerVC: UIViewController, UIGestureRecognizerDelegate {
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        enable()
    }
    func enable() {
        guard let nav = findNav() else { return }
        nav.interactivePopGestureRecognizer?.isEnabled = true
        // Setting delegate to a permissive one (or nil) lets the recognizer
        // fire even when the navigation bar is hidden.
        nav.interactivePopGestureRecognizer?.delegate = self
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
    // Allow the edge-pop gesture to begin unconditionally (subject only to
    // there being something to pop) and to coexist with our content gestures.
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        (findNav()?.viewControllers.count ?? 0) > 1
    }
    func gestureRecognizer(_ g: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        false
    }
}

extension View {
    /// Attach inside a pushed `NavigationStack` destination to keep the
    /// native left-edge swipe-back active even when the nav bar is hidden.
    func nativeEdgeSwipeBack() -> some View {
        background(NativeEdgeSwipeBackEnabler().frame(width: 0, height: 0))
    }
}
