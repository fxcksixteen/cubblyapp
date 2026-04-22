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

        // Register the presence listener *before* subscribing — supabase-swift
        // v2 enforces that all callbacks are wired up prior to subscribe().
        let stream = ch.presenceChange()
        listenTask = Task { [weak self] in
            for await change in stream {
                guard let self else { return }
                var current = await MainActor.run { self.onlineUserIDs }
                for key in change.joins.keys {
                    if let id = UUID(uuidString: key) { current.insert(id) }
                }
                for key in change.leaves.keys {
                    if let id = UUID(uuidString: key) { current.remove(id) }
                }
                let snapshot = current
                await MainActor.run { self.onlineUserIDs = snapshot }
            }
        }

        // Now subscribe, then track our presence — this order silences both
        // "track presence after subscribing" warnings.
        do {
            try await ch.subscribeWithError()
        } catch {
            print("[Presence] subscribe failed:", error)
            return
        }
        await ch.track(state: ["online_at": .string(ISO8601DateFormatter().string(from: Date()))])

        // CRITICAL: hydrate initial state. presenceChange() only fires for
        // *future* joins/leaves — without this, users already online when we
        // connect never appear, so all friends look "offline" until they
        // refresh. Mirrors the web app's initial sync.
        let initialState = ch.presenceState()
        var initial: Set<UUID> = []
        for key in initialState.keys {
            if let id = UUID(uuidString: key) { initial.insert(id) }
        }
        self.onlineUserIDs = initial

        self.channel = ch
    }

    func stop() async {
        listenTask?.cancel()
        listenTask = nil
        if let ch = channel {
            await ch.untrack()
            await ch.unsubscribe()
        }
        channel = nil
        trackedUserID = nil
        onlineUserIDs = []
    }

    // MARK: - Helpers

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
