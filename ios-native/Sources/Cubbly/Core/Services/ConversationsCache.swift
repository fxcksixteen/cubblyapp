import Foundation
import Combine

/// In-memory cache of the user's DM list so navigating into a chat and back
/// doesn't trigger a flash-of-loading every time. The DMListView shows cached
/// rows immediately and refreshes silently in the background.
@MainActor
final class ConversationsCache: ObservableObject {
    static let shared = ConversationsCache()
    @Published var conversations: [ConversationSummary] = []
    @Published var lastLoaded: Date?
    private init() {}
}
