import Foundation
import Combine
import Supabase
import Realtime

/// Tracks the current user's gem balance, mirroring `GemsContext` on web.
/// Gems are the premium currency: they're earned through Honey and used to
/// buy the gem-only themes and animated name colors. iOS previously had no
/// notion of them at all, so gem-priced items were unbuyable on the phone.
@MainActor
final class GemsStore: ObservableObject {
    static let shared = GemsStore()

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
                .from("gems_balances")
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
            // No row yet for users who've never received gems — treat as zero
            // and let the realtime insert below light it up.
            loaded = true
        }
    }

    /// Buys a gem-priced shop item. Returns the new balance on success.
    @discardableResult
    func purchase(itemId: String) async throws -> Int {
        struct Params: Encodable { let _item_id: String }
        struct Result: Decodable { let balance: Int? }
        let result: Result = try await SupabaseManager.shared.client
            .rpc("purchase_shop_item_gems", params: Params(_item_id: itemId))
            .execute()
            .value
        await refresh()
        return result.balance ?? balance
    }

    /// Claims the monthly Honey gem drop, if one is available.
    @discardableResult
    func claimMonthlyDrop() async -> Bool {
        struct Result: Decodable { let claimed: Bool? }
        let result: Result? = try? await SupabaseManager.shared.client
            .rpc("claim_honey_monthly_gems")
            .execute()
            .value
        await refresh()
        return result?.claimed ?? false
    }

    private func subscribe() async {
        guard let uid = userId else { return }
        let ch = await RealtimeChannelFactory.make("gems:\(uid.uuidString.lowercased())")
        let updates = ch.postgresChange(
            UpdateAction.self, schema: "public", table: "gems_balances",
            filter: "user_id=eq.\(uid.uuidString)")
        let inserts = ch.postgresChange(
            InsertAction.self, schema: "public", table: "gems_balances",
            filter: "user_id=eq.\(uid.uuidString)")
        Task { [weak self] in
            for await _ in updates { await self?.refresh() }
        }
        Task { [weak self] in
            for await _ in inserts { await self?.refresh() }
        }
        do { try await ch.subscribeWithError() }
        catch { print("[Gems] subscribe failed:", error) }
        channel = ch
    }
}
