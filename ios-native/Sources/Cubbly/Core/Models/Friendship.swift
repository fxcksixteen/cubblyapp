import Foundation

struct Friendship: Codable, Identifiable, Hashable {
    let id: UUID
    let requesterID: UUID
    let addresseeID: UUID
    var status: String   // 'pending' | 'accepted' | 'blocked'
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, status
        case requesterID = "requester_id"
        case addresseeID = "addressee_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// Friendship plus the OTHER user's profile (denormalised for the UI).
struct FriendEntry: Identifiable, Hashable {
    let friendship: Friendship
    let profile: Profile

    var id: UUID { friendship.id }
}
