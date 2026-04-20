import Foundation
import Supabase

@MainActor
struct MessagesRepository {
    private var client: SupabaseClient { SupabaseManager.shared.client }

    func fetch(conversationID: UUID, limit: Int = 50) async throws -> [Message] {
        try await client
            .from("messages")
            .select()
            .eq("conversation_id", value: conversationID)
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    func send(conversationID: UUID, senderID: UUID, content: String, replyTo: UUID? = nil) async throws -> Message {
        struct NewMessage: Encodable {
            let conversation_id: UUID
            let sender_id: UUID
            let content: String
            let reply_to_id: UUID?
        }
        let inserted: Message = try await client
            .from("messages")
            .insert(NewMessage(
                conversation_id: conversationID,
                sender_id: senderID,
                content: content,
                reply_to_id: replyTo
            ))
            .select()
            .single()
            .execute()
            .value
        return inserted
    }

    func delete(messageID: UUID) async throws {
        try await client
            .from("messages")
            .delete()
            .eq("id", value: messageID)
            .execute()
    }
}
