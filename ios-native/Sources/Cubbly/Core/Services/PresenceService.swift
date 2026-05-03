import Foundation
import Supabase
import Realtime

/// Joins the global Supabase Realtime presence channel ("global:online") that
/// web/desktop also use, and exposes the live set of online user IDs plus a
/// cached `status` per user (online / idle / dnd / invisible) pulled from
/// the `profiles` table. Mirrors the web app exactly so iOS sees the same
/// status indicators in real time.
@MainActor
final class PresenceService: ObservableObject {
    static let shared = PresenceService()

    @Published private(set) var onlineUserIDs: Set<UUID> = []
    /// Last known DB `profiles.status` per user, keyed by lowercase UUID
    /// string. Refreshed in bulk on start + every 30s + on foreground, and
    /// also nudged whenever a presence diff brings someone new online.
    @Published private(set) var profileStatuses: [String: String] = [:]

    private var channel: RealtimeChannelV2?
    private var presenceSubscription: RealtimeSubscription?
    private var trackedUserID: UUID?
    private var statusRefreshTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var profileStatusChannel: RealtimeChannelV2?

    private init() {}

    // MARK: - Lifecycle

    func start(userID: UUID, force: Bool = false) async {
        if !force, trackedUserID == userID, channel != nil { return }
        await stop()
        trackedUserID = userID

        // Web uses lowercase UUID strings as the presence key. Match exactly
        // so we land in the same presence keyspace.
        let presenceKey = userID.uuidString.lowercased()
        let ch = await RealtimeChannelFactory.make("global:online") { config in
            config.presence.key = presenceKey
        }

        // CRITICAL: register the presence callback BEFORE subscribing.
        // supabase-swift refuses to attach presence callbacks once the
        // channel is subscribing/subscribed.
        let sub = ch.onPresenceChange { [weak self] action in
            guard let self else { return }
            let joinKeys = Array(action.joins.keys)
            let leaveKeys = Array(action.leaves.keys)
            Task { @MainActor in
                self.applyPresence(joins: joinKeys, leaves: leaveKeys)
            }
        }
        presenceSubscription = sub

        do {
            try await ch.subscribeWithError()
        } catch {
            print("[Presence] subscribe failed:", error)
            return
        }

        await ch.track(state: [
            "user_id": .string(presenceKey),
            "online_at": .string(ISO8601DateFormatter().string(from: Date()))
        ])

        self.channel = ch

        // Pull current profile statuses so the dot color is accurate even
        // before we get our first realtime update.
        await refreshProfileStatuses()
        await subscribeProfileStatusUpdates()

        // Periodic safety net: re-track presence + refresh statuses so the
        // app recovers if the websocket silently dropped while suspended.
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 25_000_000_000)
                guard let self else { return }
                await self.retrack()
            }
        }
        statusRefreshTask?.cancel()
        statusRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                // Tighter poll (10s) so DND/Idle/Invisible flips on the
                // web/desktop side reflect on iOS within seconds even if the
                // postgres_changes subscription on profiles silently drops.
                try? await Task.sleep(nanoseconds: 10_000_000_000)
                guard let self else { return }
                await self.refreshProfileStatuses()
            }
        }
    }

    func stop() async {
        statusRefreshTask?.cancel(); statusRefreshTask = nil
        heartbeatTask?.cancel(); heartbeatTask = nil
        presenceSubscription?.cancel(); presenceSubscription = nil
        if let ch = channel {
            await ch.untrack()
            await RealtimeChannelFactory.remove(ch)
        }
        channel = nil
        if let pc = profileStatusChannel {
            await RealtimeChannelFactory.remove(pc)
        }
        profileStatusChannel = nil
        trackedUserID = nil
        onlineUserIDs = []
    }

    /// Re-broadcast our presence so the server resets our TTL. If the channel
    /// is missing OR a track() throws, fully restart so status indicators
    /// auto-recover from network blips, sleep/resume, and silent socket drops
    /// — without the user having to relaunch the app.
    func retrack() async {
        guard let uid = trackedUserID else { return }
        let key = uid.uuidString.lowercased()
        guard let ch = channel else {
            await start(userID: uid, force: true)
            return
        }
        await ch.track(state: [
            "user_id": .string(key),
            "online_at": .string(ISO8601DateFormatter().string(from: Date()))
        ])
    }

    /// Force-restart the presence channel. Called from app foreground +
    /// network-came-back observers so a dead socket recovers immediately
    /// instead of waiting for the 25s heartbeat tick.
    func forceReconnect() async {
        guard let uid = trackedUserID else { return }
        await start(userID: uid, force: true)
    }

    // MARK: - Presence application

    private func applyPresence(joins: [String], leaves: [String]) {
        var current = onlineUserIDs
        var newJoins: [UUID] = []
        for key in joins {
            if let id = UUID(uuidString: key) {
                if current.insert(id).inserted { newJoins.append(id) }
            }
        }
        for key in leaves {
            if let id = UUID(uuidString: key) {
                current.remove(id)
            }
        }
        onlineUserIDs = current
        let missing = newJoins.filter { profileStatuses[$0.uuidString.lowercased()] == nil }
        if !missing.isEmpty {
            Task { await self.fetchStatuses(for: missing) }
        }
    }

    // MARK: - Profile status snapshot

    private func refreshProfileStatuses() async {
        struct Row: Decodable { let user_id: UUID; let status: String? }
        do {
            let rows: [Row] = try await SupabaseManager.shared.client
                .from("profiles")
                .select("user_id,status")
                .execute()
                .value
            var dict = profileStatuses
            for r in rows {
                dict[r.user_id.uuidString.lowercased()] = r.status ?? "online"
            }
            profileStatuses = dict
        } catch {
            // Silent — the next tick will retry. Don't spam the console.
        }
    }

    private func fetchStatuses(for ids: [UUID]) async {
        struct Row: Decodable { let user_id: UUID; let status: String? }
        guard !ids.isEmpty else { return }
        let strings = ids.map { $0.uuidString }
        do {
            let rows: [Row] = try await SupabaseManager.shared.client
                .from("profiles")
                .select("user_id,status")
                .in("user_id", values: strings)
                .execute()
                .value
            var dict = profileStatuses
            for r in rows {
                dict[r.user_id.uuidString.lowercased()] = r.status ?? "online"
            }
            profileStatuses = dict
        } catch {}
    }

    /// Listen for live status changes on the profiles table so when a friend
    /// flips to DND/Idle/Invisible we update instantly without a poll.
    private func subscribeProfileStatusUpdates() async {
        let ch = await RealtimeChannelFactory.make("profiles-status-global")
        let stream = ch.postgresChange(
            UpdateAction.self, schema: "public", table: "profiles")
        Task { [weak self] in
            for await action in stream {
                guard let self else { return }
                let dict = action.record
                guard
                    let uidJSON = dict["user_id"], let uidStr = uidJSON.stringValue,
                    let uid = UUID(uuidString: uidStr)
                else { continue }
                let status = dict["status"]?.stringValue ?? "online"
                await MainActor.run {
                    var d = self.profileStatuses
                    d[uid.uuidString.lowercased()] = status
                    self.profileStatuses = d
                }
            }
        }
        do { try await ch.subscribeWithError() }
        catch { print("[Presence] profile-status subscribe failed:", error) }
        profileStatusChannel = ch
    }

    // MARK: - Helpers

    func effectiveStatus(for userID: UUID, storedStatus: String?) -> String {
        if userID.uuidString == "00000000-0000-0000-0000-000000000001" { return "online" }
        if !onlineUserIDs.contains(userID) { return "offline" }
        // Prefer the live cached profile status (always up to date), then
        // fall back to the stale snapshot the caller had.
        let live = profileStatuses[userID.uuidString.lowercased()] ?? storedStatus ?? "online"
        if live == "invisible" { return "online" }
        return live
    }

    func isOnline(_ userID: UUID) -> Bool {
        onlineUserIDs.contains(userID) || userID.uuidString == "00000000-0000-0000-0000-000000000001"
    }
}
