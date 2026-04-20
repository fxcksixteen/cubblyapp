import Foundation
import Supabase

@MainActor
struct ConversationsRepository {
    private var client: SupabaseClient { SupabaseManager.shared.client }

    func listMine() async throws -> [Conversation] {
        try await client
            .from("conversations")
            .select()
            .order("updated_at", ascending: false)
            .execute()
            .value
    }

    func openOrCreateDM(with otherUserID: UUID) async throws -> UUID {
        struct Args: Encodable { let other_user_id: UUID }
        let id: UUID = try await client
            .rpc("create_dm_conversation", params: Args(other_user_id: otherUserID))
            .execute()
            .value
        return id
    }

    func createGroup(name: String, memberIDs: [UUID]) async throws -> UUID {
        struct Args: Encodable { let _name: String; let _member_ids: [UUID] }
        let id: UUID = try await client
            .rpc("create_group_conversation", params: Args(_name: name, _member_ids: memberIDs))
            .execute()
            .value
        return id
    }

    func markRead(conversationID: UUID) async throws {
        struct Args: Encodable { let _conversation_id: UUID }
        try await client
            .rpc("mark_conversation_read", params: Args(_conversation_id: conversationID))
            .execute()
    }
}
