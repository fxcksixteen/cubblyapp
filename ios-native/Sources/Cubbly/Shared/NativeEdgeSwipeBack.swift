import SwiftUI
import UIKit

/// Re-enables UIKit's built-in interactive-pop gesture even when the SwiftUI
/// navigation bar back button is hidden (`.navigationBarBackButtonHidden`).
///
/// **How it works:**
///   1. Walks up to the hosting `UINavigationController`.
///   2. Tries to re-enable the system's `interactivePopGestureRecognizer`.
///   3. If the system gesture is permanently disabled (iOS 26+ with hidden
///      back button), falls back to creating a new `UIPanGestureRecognizer`
///      that drives the **same** interactive pop transition as the system
///      gesture — giving identical native feel.
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
    /// Custom pan gesture added as a fallback when the system gesture is
    /// permanently disabled (iOS 26+ with hidden back button).
    weak var fallbackPan: UIPanGestureRecognizer?

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard (nav?.viewControllers.count ?? 0) > 1 else { return false }

        // For the fallback pan: only begin for predominantly horizontal-
        // rightward swipes. This lets vertical scrolls pass through to the
        // scroll view unimpeded.
        if let pan = gestureRecognizer as? UIPanGestureRecognizer,
           pan === fallbackPan {
            let vel = pan.velocity(in: pan.view)
            return vel.x > 0 && abs(vel.x) > abs(vel.y) * 1.2
        }

        return true
    }

    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { false }

    /// Our fallback pan must be evaluated before scroll views so that
    /// horizontal-rightward swipes drive the pop transition rather than
    /// being swallowed by a scroll view's pan gesture.
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                           shouldBeRequiredToFailBy other: UIGestureRecognizer) -> Bool {
        gestureRecognizer === fallbackPan && other is UIPanGestureRecognizer
    }
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

        // Standard path: re-enable the system gesture and swap in our
        // permissive delegate.
        nav.interactivePopGestureRecognizer?.isEnabled = true
        nav.interactivePopGestureRecognizer?.delegate = coordinator

        // Fallback for iOS 26+ where `.navigationBarBackButtonHidden(true)`
        // permanently disables the system gesture. Create a new pan gesture
        // that drives the exact same interactive pop transition. Only added
        // once (tracked via coordinator.fallbackPan).
        if coordinator?.fallbackPan == nil {
            installFallbackPan(nav: nav)
        }
    }

    /// Copies the system interactive-pop transition handler to a new
    /// `UIPanGestureRecognizer`. The delegate's velocity check ensures
    /// only horizontal-rightward swipes begin, so vertical scrolling
    /// is unaffected.
    private func installFallbackPan(nav: UINavigationController) {
        guard let systemGesture = nav.interactivePopGestureRecognizer,
              let targets = systemGesture.value(forKey: "targets")
        else { return }

        let pan = UIPanGestureRecognizer()
        pan.setValue(targets, forKey: "targets")
        pan.delegate = coordinator
        nav.view.addGestureRecognizer(pan)
        coordinator?.fallbackPan = pan
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
