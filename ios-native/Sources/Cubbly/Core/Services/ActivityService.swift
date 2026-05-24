import Foundation
import Combine
import Supabase
import Realtime

/// Mirrors `ActivityContext` from the web — keeps a live map of `user_id`
/// → current visible activity row from `user_activities`. iOS itself cannot
/// scan running games (only the desktop Electron app does), so this service
/// only DISPLAYS activity broadcast by desktop/web clients, plus a privacy
/// toggle so the iOS user can hide their own broadcast activity.
@MainActor
final class ActivityService: ObservableObject {
    static let shared = ActivityService()

    struct Activity: Hashable, Decodable {
        let user_id: UUID
        let activity_type: String
        let name: String?
        let details: String?
        let started_at: Date
        let privacy_visible: Bool
    }

    @Published private(set) var activities: [UUID: Activity] = [:]
    @Published var shareActivity: Bool = true

    private var userId: UUID?
    private var channel: RealtimeChannelV2?

    private init() {
        // Initialize service
    }

    func start(userId: UUID) async {
        if self.userId == userId, channel != nil { return }
        await stop()
        self.userId = userId
        await refresh()
        await subscribe()
        await loadOwnPrivacy()
    }

    func stop() async {
        await RealtimeChannelFactory.remove(channel)
        channel = nil
        userId = nil
        activities = [:]
    }

    func activity(for userID: UUID) -> Activity? { activities[userID] }

    /// Friendly label like "Playing Minecraft" / "Using VS Code".
    func label(for userID: UUID, isOnline: Bool) -> String? {
        guard isOnline, let a = activities[userID], let name = a.name, !name.isEmpty else {
            return nil
        }
        let verb: String
        if a.activity_type == "using" || a.details == "software" {
            verb = "Using"
        } else {
            verb = "Playing"
        }
        return "\(verb) \(name)"
    }

    func setShareActivity(_ enabled: Bool) async {
        shareActivity = enabled
        guard let uid = userId else { return }
        if !enabled {
            _ = try? await SupabaseManager.shared.client
                .from("user_activities")
                .delete()
                .eq("user_id", value: uid.uuidString)
                .execute()
        } else {
            // If we already have a stored row, flip its visibility back on.
            _ = try? await SupabaseManager.shared.client
                .from("user_activities")
                .update(["privacy_visible": true])
                .eq("user_id", value: uid.uuidString)
                .execute()
        }
    }

    private func refresh() async {
        do {
            let rows: [Activity] = try await SupabaseManager.shared.client
                .from("user_activities")
                .select("*")
                .eq("privacy_visible", value: true)
                .execute()
                .value
            var map: [UUID: Activity] = [:]
            for r in rows { map[r.user_id] = r }
            activities = map
        } catch {
            // Quiet — channel reload + next refresh will catch up.
        }
    }

    private func loadOwnPrivacy() async {
        guard let uid = userId else { return }
        struct Row: Decodable { let privacy_visible: Bool? }
        do {
            let row: Row = try await SupabaseManager.shared.client
                .from("user_activities")
                .select("privacy_visible")
                .eq("user_id", value: uid.uuidString)
                .single()
                .execute()
                .value
            shareActivity = row.privacy_visible ?? true
        } catch {
            shareActivity = true
        }
    }

    private func subscribe() async {
        let ch = await RealtimeChannelFactory.make("user-activities-global")
        let changes = ch.postgresChange(
            AnyAction.self, schema: "public", table: "user_activities")
        Task { [weak self] in
            for await _ in changes {
                await self?.refresh()
            }
        }
        do { try await ch.subscribeWithError() }
        catch { print("[Activity] subscribe failed:", error) }
        channel = ch
    }
}
