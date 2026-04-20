import Foundation
import Supabase

@MainActor
struct ProfilesRepository {
    private var client: SupabaseClient { SupabaseManager.shared.client }

    func fetchProfile(userID: UUID) async throws -> Profile {
        try await client
            .from("profiles")
            .select()
            .eq("user_id", value: userID)
            .single()
            .execute()
            .value
    }

    func searchByUsername(_ query: String, limit: Int = 20) async throws -> [Profile] {
        try await client
            .from("profiles")
            .select()
            .ilike("username", pattern: "%\(query)%")
            .limit(limit)
            .execute()
            .value
    }
}
