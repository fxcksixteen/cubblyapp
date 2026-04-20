import Foundation
import Supabase

@MainActor
struct FriendsRepository {
    private var client: SupabaseClient { SupabaseManager.shared.client }

    /// Returns all friendships involving the current user, with the OTHER
    /// user's profile attached.
    func listMine(currentUserID: UUID) async throws -> [FriendEntry] {
        let rows: [Friendship] = try await client
            .from("friendships")
            .select()
            .execute()
            .value

        let otherIDs = rows.map { $0.requesterID == currentUserID ? $0.addresseeID : $0.requesterID }
        guard !otherIDs.isEmpty else { return [] }

        let profiles: [Profile] = try await client
            .from("profiles")
            .select()
            .in("user_id", values: otherIDs)
            .execute()
            .value

        let byUser = Dictionary(uniqueKeysWithValues: profiles.map { ($0.userID, $0) })
        return rows.compactMap { f in
            let other = f.requesterID == currentUserID ? f.addresseeID : f.requesterID
            guard let profile = byUser[other] else { return nil }
            return FriendEntry(friendship: f, profile: profile)
        }
    }

    func sendRequest(toUsername username: String, fromUserID: UUID) async throws {
        struct ProfileLookup: Decodable { let user_id: UUID }
        let target: ProfileLookup = try await client
            .from("profiles")
            .select("user_id")
            .eq("username", value: username.trimmingCharacters(in: .whitespaces))
            .single()
            .execute()
            .value

        if target.user_id == fromUserID {
            throw NSError(domain: "Friends", code: 1, userInfo: [NSLocalizedDescriptionKey: "You can't add yourself."])
        }

        struct NewFriendship: Encodable {
            let requester_id: UUID
            let addressee_id: UUID
        }
        try await client
            .from("friendships")
            .insert(NewFriendship(requester_id: fromUserID, addressee_id: target.user_id))
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

    func block(friendshipID: UUID) async throws {
        try await client
            .from("friendships")
            .update(["status": "blocked"])
            .eq("id", value: friendshipID)
            .execute()
    }
}
