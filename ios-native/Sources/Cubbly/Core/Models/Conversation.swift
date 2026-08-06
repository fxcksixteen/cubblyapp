import Foundation

struct Conversation: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String?
    var isGroup: Bool
    var ownerID: UUID?
    var pictureURL: String?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, name
        case isGroup = "is_group"
        case ownerID = "owner_id"
        case pictureURL = "picture_url"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
