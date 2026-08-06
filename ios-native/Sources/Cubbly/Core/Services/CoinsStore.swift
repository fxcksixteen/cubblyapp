import Foundation
import Combine
import Supabase
import Realtime

/// Tracks the current user's coin balance, mirroring `CoinsContext` from web.
/// Reads `user_coins.balance` and live-subscribes to balance changes so the
/// Shop pill, settings, and any other UI stay in sync with what desktop/web
/// already show for the same account.
@MainActor
final class CoinsStore: ObservableObject {
    static let shared = CoinsStore()

    @Published private(set) var balance: Int = 0
    @Published private(set) var lifetimeEarned: Int = 0
    @Published private(set) var lifetimeSpent: Int = 0
    @Published private(set) var loaded: Bool = false

    private var userId: UUID?
    private var channel: RealtimeChannelV2?
    private var refreshTask: Task<Void, Never>?

    private init() {}

    func start(userId: UUID) async {
        if self.userId == userId, channel != nil { return }
        await stop()
        self.userId = userId
        await refresh()
        await subscribe()
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 90_000_000_000)
                await self?.refresh()
            }
        }
    }

    func stop() async {
        refreshTask?.cancel(); refreshTask = nil
        await RealtimeChannelFactory.remove(channel)
        channel = nil
        userId = nil
        balance = 0
        lifetimeEarned = 0
        lifetimeSpent = 0
        loaded = false
    }

    func refresh() async {
        guard let uid = userId else { return }
        struct Row: Decodable {
            let balance: Int
            let lifetime_earned: Int?
            let lifetime_spent: Int?
        }
        do {
            let row: Row = try await SupabaseManager.shared.client
                .from("user_coins")
                .select("balance,lifetime_earned,lifetime_spent")
                .eq("user_id", value: uid.uuidString)
                .single()
                .execute()
                .value
            balance = row.balance
            lifetimeEarned = row.lifetime_earned ?? 0
            lifetimeSpent = row.lifetime_spent ?? 0
            loaded = true
        } catch {
            // First-load: row may not exist yet for brand-new users until
            // signup_bonus trigger runs. Stay quiet; periodic refresh + the
            // realtime subscription below will pick it up.
        }
    }

    private func subscribe() async {
        guard let uid = userId else { return }
        let ch = await RealtimeChannelFactory.make("coins:\(uid.uuidString.lowercased())")
        let updates = ch.postgresChange(
            UpdateAction.self, schema: "public", table: "user_coins",
            filter: "user_id=eq.\(uid.uuidString)")
        let inserts = ch.postgresChange(
            InsertAction.self, schema: "public", table: "user_coins",
            filter: "user_id=eq.\(uid.uuidString)")
        Task { [weak self] in
            for await _ in updates { await self?.refresh() }
        }
        Task { [weak self] in
            for await _ in inserts { await self?.refresh() }
        }
        do { try await ch.subscribeWithError() }
        catch { print("[Coins] subscribe failed:", error) }
        channel = ch
    }
}
