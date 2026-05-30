import Foundation
import Combine

/// Tracks how many "full-screen" pushed routes (ChatView, NotesView editor)
/// are currently visible. The custom bottom tab bar in `MainTabView` hides
/// while this is > 0. Using a counter (incremented in `onAppear`, decremented
/// in `onDisappear`) is more resilient than a single boolean: if iOS skips
/// `onDisappear` during a rapid pop, the next push/pop will rebalance, and
/// `DMListView.onAppear` performs a defensive reset to zero whenever the DM
/// sidebar reappears so the tab bar is never permanently stuck hidden.
@MainActor
final class ChromeStore: ObservableObject {
    static let shared = ChromeStore()
    @Published private(set) var pushedRouteCount: Int = 0
    private init() {}

    var tabBarHidden: Bool { pushedRouteCount > 0 }

    func pushHidden() { pushedRouteCount += 1 }
    func popHidden() { pushedRouteCount = max(0, pushedRouteCount - 1) }
    /// Defensive reset called from the DM sidebar's `onAppear` — guarantees
    /// the tab bar comes back even if a previous `onDisappear` was skipped.
    func resetForRoot() { pushedRouteCount = 0 }
}
