import SwiftUI
import UIKit

/// Re-enables UIKit's built-in left-edge interactive-pop gesture even when
/// the SwiftUI navigation bar is hidden. iOS disables that recognizer by
/// default whenever a custom delegate refuses to begin it; this helper walks
/// up to the hosting `UINavigationController`, swaps in a permissive
/// delegate that always allows the gesture when the stack has > 1 view, and
/// re-asserts on every appearance so chat threads inherit the same
/// Apple-native swipe-back feel as Personal Notes.
struct NativeEdgeSwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> EnablerVC {
        let vc = EnablerVC()
        vc.coordinator = context.coordinator
        return vc
    }
    func updateUIViewController(_ vc: EnablerVC, context: Context) { vc.enable() }
    func makeCoordinator() -> SwipeDelegate { SwipeDelegate() }
}

final class SwipeDelegate: NSObject, UIGestureRecognizerDelegate {
    weak var nav: UINavigationController?
    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        (nav?.viewControllers.count ?? 0) > 1
    }
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { false }
}

final class EnablerVC: UIViewController {
    var coordinator: SwipeDelegate?

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
        coordinator?.nav = nav
        nav.interactivePopGestureRecognizer?.isEnabled = true
        nav.interactivePopGestureRecognizer?.delegate = coordinator
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
