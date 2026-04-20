import Foundation
import Supabase

@MainActor
struct FriendsRepository {
    private var client: SupabaseClient { SupabaseManager.shared.client }

    func listMine() async throws -> [Friendship] {
        try await client
            .from("friendships")
            .select()
            .execute()
            .value
    }

    func sendRequest(toUserID: UUID, fromUserID: UUID) async throws {
        struct NewFriendship: Encodable {
            let requester_id: UUID
            let addressee_id: UUID
        }
        try await client
            .from("friendships")
            .insert(NewFriendship(requester_id: fromUserID, addressee_id: toUserID))
            .execute()
    }

    func accept(friendshipID: UUID) async throws {
        try await client
            .from("friendships")
            .update(["status": "accepted"])
            .eq("id", value: friendshipID)
            .execute()
    }

    func remove(friendshipID: UUID) async throws {
        try await client
            .from("friendships")
            .delete()
            .eq("id", value: friendshipID)
            .execute()
    }

    func block(addresseeID: UUID, fromUserID: UUID) async throws {
        struct Block: Encodable {
            let requester_id: UUID
            let addressee_id: UUID
            let status: String
        }
        try await client
            .from("friendships")
            .upsert(Block(requester_id: fromUserID, addressee_id: addresseeID, status: "blocked"))
            .execute()
    }
}
