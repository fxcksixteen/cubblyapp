import Foundation

struct Message: Codable, Identifiable, Hashable {
    let id: UUID
    let conversationID: UUID
    let senderID: UUID
    var content: String
    var replyToID: UUID?
    let createdAt: Date
    var updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, content
        case conversationID = "conversation_id"
        case senderID = "sender_id"
        case replyToID = "reply_to_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
