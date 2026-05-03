import SwiftUI
import UIKit

/// Re-enables the native left-edge interactive pop gesture on a SwiftUI view
/// even when the navigation bar is hidden (`.navigationBarHidden(true)`
/// disables it by default on `UINavigationController`).
///
/// Drop this in via `.enableEdgeSwipeBack()` and the system handles the
/// left-edge swipe-back transition for you — no custom DragGesture stealing
/// vertical touches from the chat ScrollView.
struct EdgeSwipeBackEnabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ vc: Controller, context: Context) {}

    final class Controller: UIViewController, UIGestureRecognizerDelegate {
        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard let nav = navigationController,
                  let g = nav.interactivePopGestureRecognizer else { return }
            g.isEnabled = true
            // Setting delegate = self (always returning true) re-arms the
            // gesture even when the navigation bar is hidden.
            g.delegate = self
        }
        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            // Only fire when there's actually somewhere to pop back to.
            (navigationController?.viewControllers.count ?? 0) > 1
        }
    }
}

extension View {
    /// Enables the system left-edge swipe-back gesture, even when the host
    /// view hides its navigation bar. Safe to apply repeatedly.
    func enableEdgeSwipeBack() -> some View {
        background(EdgeSwipeBackEnabler().frame(width: 0, height: 0).allowsHitTesting(false))
    }
}
