import Foundation
import Supabase

@MainActor
struct MessagesRepository {
    private var client: SupabaseClient { SupabaseManager.shared.client }

    /// Latest page (descending) — caller reverses for ascending render.
    func fetchPage(conversationID: UUID, before: Date? = nil, limit: Int = 50) async throws -> [ChatMessageRow] {
        var q = client.from("messages")
            .select()
            .eq("conversation_id", value: conversationID)
        if let before {
            q = q.lt("created_at", value: ISO8601DateFormatter().string(from: before))
        }
        return try await q
            .order("created_at", ascending: false)
            .limit(limit)
            .execute()
            .value
    }

    func send(conversationID: UUID, senderID: UUID, content: String, replyTo: UUID? = nil) async throws -> ChatMessageRow {
        struct NewMessage: Encodable {
            let conversation_id: UUID
            let sender_id: UUID
            let content: String
            let reply_to_id: UUID?
        }
        return try await client
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
    }

    func delete(messageID: UUID) async throws {
        try await client
            .from("messages")
            .delete()
            .eq("id", value: messageID)
            .execute()
    }

    /// Profiles for a set of sender IDs.
    func loadSenderProfiles(_ ids: [UUID]) async throws -> [UUID: Profile] {
        guard !ids.isEmpty else { return [:] }
        let rows: [Profile] = try await client.from("profiles")
            .select()
            .in("user_id", values: ids)
            .execute()
            .value
        return Dictionary(uniqueKeysWithValues: rows.map { ($0.userID, $0) })
    }

    /// Reply previews for a set of message IDs.
    func loadReplyPreviews(_ ids: [UUID]) async throws -> [UUID: ChatMessageRow] {
        guard !ids.isEmpty else { return [:] }
        let rows: [ChatMessageRow] = try await client.from("messages")
            .select()
            .in("id", values: ids)
            .execute()
            .value
        return Dictionary(uniqueKeysWithValues: rows.map { ($0.id, $0) })
    }
}
