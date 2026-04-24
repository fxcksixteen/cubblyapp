import Foundation
import Combine

/// Tiny @MainActor singleton driving global chrome (custom tab bar)
/// visibility. Pushed views (notably `ChatView`) flip `tabBarHidden = true`
/// in `.onAppear` and back to false in `.onDisappear`, and `MainTabView`
/// observes this to skip rendering `CubblyTabBar` while on a chat thread.
@MainActor
final class ChromeStore: ObservableObject {
    static let shared = ChromeStore()
    @Published var tabBarHidden: Bool = false
    private init() {}
}
