import Foundation

/// A chat message as it appears in the UI. Mirrors `Message` from
/// `src/hooks/useMessages.ts`. The DB row is decoded into `ChatMessageRow`
/// then enriched with sender + reply previews on the client.
struct ChatMessage: Identifiable, Hashable {
    enum Status: String { case sending, sent, delivered, failed }

    let id: String                // UUID string OR "temp-<n>" for optimistic
    let conversationID: UUID
    let senderID: UUID
    var content: String
    var createdAt: Date
    var replyToID: UUID?
    var replyTo: ReplyPreview?
    var senderName: String?
    var senderAvatarURL: String?
    var status: Status = .delivered

    var isOptimistic: Bool { id.hasPrefix("temp-") }

    struct ReplyPreview: Hashable {
        let id: UUID
        let senderID: UUID
        let senderName: String
        let content: String
    }
}

/// Raw DB row.
struct ChatMessageRow: Codable, Identifiable, Hashable {
    let id: UUID
    let conversationID: UUID
    let senderID: UUID
    let content: String
    let replyToID: UUID?
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, content
        case conversationID = "conversation_id"
        case senderID = "sender_id"
        case replyToID = "reply_to_id"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
