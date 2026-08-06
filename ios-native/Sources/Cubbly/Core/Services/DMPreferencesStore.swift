import Foundation
import Combine
import Supabase

/// Per-user DM preferences (pin / mute) backed by the `dm_preferences` table.
/// Mirrors the eventual web behavior: each row keys off (user_id, peer_user_id)
/// so the same preference follows the user across conversations with the same
/// person regardless of conversation id.
@MainActor
final class DMPreferencesStore: ObservableObject {
    static let shared = DMPreferencesStore()

    struct Pref: Codable, Hashable {
        var pinned: Bool
        var muted: Bool
        var hidden: Bool
        var pinnedAt: Date?
        var mutedUntil: Date?
    }

    @Published private(set) var byPeer: [UUID: Pref] = [:]
    private var loaded = false

    private struct Row: Decodable {
        let peer_user_id: UUID
        let pinned: Bool
        let muted: Bool
        let hidden: Bool
        let pinned_at: Date?
        let muted_until: Date?
    }

    private struct Upsert: Encodable {
        let user_id: String
        let peer_user_id: String
        let pinned: Bool
        let muted: Bool
        let hidden: Bool
        let pinned_at: String?
    }

    private var client: SupabaseClient { SupabaseManager.shared.client }

    func loadIfNeeded(userID: UUID) async {
        guard !loaded else { return }
        await load(userID: userID)
    }

    func load(userID: UUID) async {
        do {
            let rows: [Row] = try await client
                .from("dm_preferences")
                .select("peer_user_id,pinned,muted,hidden,pinned_at,muted_until")
                .eq("user_id", value: userID.uuidString)
                .execute()
                .value
            var map: [UUID: Pref] = [:]
            for r in rows {
                map[r.peer_user_id] = Pref(
                    pinned: r.pinned, muted: r.muted, hidden: r.hidden,
                    pinnedAt: r.pinned_at, mutedUntil: r.muted_until)
            }
            byPeer = map
            loaded = true
        } catch {
            print("[DMPrefs] load failed:", error)
        }
    }

    func pref(for peer: UUID) -> Pref {
        byPeer[peer] ?? Pref(pinned: false, muted: false, hidden: false, pinnedAt: nil, mutedUntil: nil)
    }

    func isPinned(_ peer: UUID) -> Bool { pref(for: peer).pinned }
    func isMuted(_ peer: UUID) -> Bool { pref(for: peer).muted }
    func isHidden(_ peer: UUID) -> Bool { pref(for: peer).hidden }

    func togglePin(userID: UUID, peer: UUID) async {
        var current = pref(for: peer)
        current.pinned.toggle()
        current.pinnedAt = current.pinned ? Date() : nil
        byPeer[peer] = current
        await upsert(userID: userID, peer: peer, pref: current)
    }

    func toggleMute(userID: UUID, peer: UUID) async {
        var current = pref(for: peer)
        current.muted.toggle()
        byPeer[peer] = current
        await upsert(userID: userID, peer: peer, pref: current)
    }

    func setHidden(userID: UUID, peer: UUID, hidden: Bool) async {
        var current = pref(for: peer)
        current.hidden = hidden
        byPeer[peer] = current
        await upsert(userID: userID, peer: peer, pref: current)
    }

    private func upsert(userID: UUID, peer: UUID, pref: Pref) async {
        let iso = ISO8601DateFormatter()
        let payload = Upsert(
            user_id: userID.uuidString,
            peer_user_id: peer.uuidString,
            pinned: pref.pinned,
            muted: pref.muted,
            hidden: pref.hidden,
            pinned_at: pref.pinnedAt.map { iso.string(from: $0) }
        )
        do {
            try await client
                .from("dm_preferences")
                .upsert(payload, onConflict: "user_id,peer_user_id")
                .execute()
        } catch {
            print("[DMPrefs] upsert failed:", error)
        }
    }
}
