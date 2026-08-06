import Foundation
import Combine
import Supabase

/// Backs the "Content & Social" settings tab with the real profile columns
/// web/desktop use: who can DM you, and whether your wishlist is public.
@MainActor
final class SocialPrivacyStore: ObservableObject {
    static let shared = SocialPrivacyStore()

    enum WhoCanDM: String, CaseIterable, Identifiable {
        case everyone, friends, nobody
        var id: String { rawValue }
        var label: String {
            switch self {
            case .everyone: return "Everyone"
            case .friends:  return "Friends only"
            case .nobody:   return "No one"
            }
        }
        var blurb: String {
            switch self {
            case .everyone: return "Anyone can start a chat with you."
            case .friends:  return "Only friends and people you share a server with."
            case .nobody:   return "New messages become requests you approve."
            }
        }
    }

    @Published var whoCanDM: WhoCanDM = .everyone
    @Published var publicWishlist: Bool = false
    @Published private(set) var loaded = false
    @Published var lastError: String?

    private var userId: UUID?
    private init() {}

    func load(userId: UUID) async {
        self.userId = userId
        struct Row: Decodable {
            let who_can_dm: String?
            let public_wishlist: Bool?
        }
        do {
            let row: Row = try await SupabaseManager.shared.client
                .from("profiles")
                .select("who_can_dm,public_wishlist")
                .eq("user_id", value: userId.uuidString)
                .single()
                .execute()
                .value
            whoCanDM = WhoCanDM(rawValue: row.who_can_dm ?? "everyone") ?? .everyone
            publicWishlist = row.public_wishlist ?? false
            loaded = true
        } catch {
            lastError = "Couldn't load privacy settings"
        }
    }

    func setWhoCanDM(_ value: WhoCanDM) async {
        let previous = whoCanDM
        whoCanDM = value
        struct Patch: Encodable { let who_can_dm: String }
        await patch(Patch(who_can_dm: value.rawValue), revert: { self.whoCanDM = previous })
    }

    func setPublicWishlist(_ value: Bool) async {
        let previous = publicWishlist
        publicWishlist = value
        struct Patch: Encodable { let public_wishlist: Bool }
        await patch(Patch(public_wishlist: value), revert: { self.publicWishlist = previous })
    }

    private func patch<T: Encodable>(_ body: T, revert: @escaping () -> Void) async {
        guard let uid = userId else { return }
        do {
            _ = try await SupabaseManager.shared.client
                .from("profiles")
                .update(body)
                .eq("user_id", value: uid.uuidString)
                .execute()
        } catch {
            revert()
            lastError = "Couldn't save that change"
        }
    }
}
