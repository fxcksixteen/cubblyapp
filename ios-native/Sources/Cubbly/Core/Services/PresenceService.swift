import Foundation
import Supabase
import Realtime

/// Joins a single global Supabase Realtime presence channel ("global:online")
/// and exposes the live set of online user IDs. Mirrors the web app's
/// presence behaviour (any open client = considered online).
@MainActor
final class PresenceService: ObservableObject {
    static let shared = PresenceService()

    @Published private(set) var onlineUserIDs: Set<UUID> = []

    private var channel: RealtimeChannelV2?
    private var trackedUserID: UUID?
    private var listenTask: Task<Void, Never>?

    private init() {}

    // MARK: - Lifecycle

    func start(userID: UUID) async {
        if trackedUserID == userID, channel != nil { return }
        await stop()
        trackedUserID = userID

        let client = SupabaseManager.shared.client
        let ch = client.channel("global:online") { config in
            config.presence.key = userID.uuidString
        }

        // Subscribe to presence state diffs.
        listenTask = Task { [weak self] in
            await ch.subscribe()
            guard let self else { return }

            // Initial sync
            let syncStream = ch.presenceChange()
            for await change in syncStream {
                let state = change.joins.merging(ch.presenceState(), uniquingKeysWith: { a, _ in a })
                let ids: Set<UUID> = Set(state.keys.compactMap { UUID(uuidString: $0) })
                await MainActor.run { self.onlineUserIDs = ids }
            }
        }

        // Track our own presence
        do {
            try await ch.track(state: ["online_at": ISO8601DateFormatter().string(from: Date())])
        } catch {
            print("[Presence] track failed:", error)
        }

        self.channel = ch
    }

    func stop() async {
        listenTask?.cancel()
        listenTask = nil
        if let ch = channel {
            try? await ch.untrack()
            await ch.unsubscribe()
        }
        channel = nil
        trackedUserID = nil
        onlineUserIDs = []
    }

    // MARK: - Helpers

    /// Mirrors `getEffectivePresenceStatus` from src/lib/presence.ts.
    func effectiveStatus(for userID: UUID, storedStatus: String?) -> String {
        if userID.uuidString == "00000000-0000-0000-0000-000000000001" { return "online" }
        if !onlineUserIDs.contains(userID) { return "offline" }
        if storedStatus == "invisible" { return "online" }
        return storedStatus ?? "online"
    }

    func isOnline(_ userID: UUID) -> Bool {
        onlineUserIDs.contains(userID) || userID.uuidString == "00000000-0000-0000-0000-000000000001"
    }
}
