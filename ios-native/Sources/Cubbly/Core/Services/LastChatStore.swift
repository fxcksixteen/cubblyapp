import Foundation
import Combine

/// Tracks which DM was opened most recently for the highlight + edge-swipe-back
/// feature on the Home tab. Persisted to UserDefaults so it survives launches.
@MainActor
final class LastChatStore: ObservableObject {
    static let shared = LastChatStore()
    private let key = "cubbly.lastOpenedConversationID"

    @Published var lastConversationID: UUID? {
        didSet {
            if let id = lastConversationID {
                UserDefaults.standard.set(id.uuidString, forKey: key)
            } else {
                UserDefaults.standard.removeObject(forKey: key)
            }
        }
    }

    private init() {
        if let s = UserDefaults.standard.string(forKey: key),
           let id = UUID(uuidString: s) {
            lastConversationID = id
        }
    }
}
