import Foundation
import Combine
import Supabase
import Realtime

/// Mirrors `ShopView` + `ShopItemsGrid` data plumbing from the web.
/// Loads the global `shop_items` catalog plus the current user's
/// `user_inventory` (owned) and `user_equipped` (currently active) sets,
/// and exposes purchase/equip/unequip helpers that call the existing RPCs.
@MainActor
final class ShopStore: ObservableObject {
    static let shared = ShopStore()

    struct Item: Identifiable, Hashable, Decodable {
        let id: String
        let category: String          // "name_color" | "theme" | "badge"
        let subcategory: String?
        let name: String
        let description: String?
        let price: Int
        let config: AnyJSON?
        let sort_order: Int?
        let is_active: Bool?
    }

    @Published private(set) var items: [Item] = []
    @Published private(set) var owned: Set<String> = []
    @Published private(set) var equipped: Set<String> = []
    @Published private(set) var loaded: Bool = false
    @Published var purchasing: String? = nil
    @Published var lastError: String? = nil

    private var userId: UUID?
    private var invChannel: RealtimeChannelV2?

    private init() {}

    func start(userId: UUID) async {
        if self.userId == userId, !items.isEmpty { return }
        await stop()
        self.userId = userId
        await reload()
        await subscribe()
    }

    func stop() async {
        await RealtimeChannelFactory.remove(invChannel)
        invChannel = nil
        userId = nil
        items = []
        owned = []
        equipped = []
        loaded = false
    }

    func reload() async {
        guard let uid = userId else { return }
        let client = SupabaseManager.shared.client
        do {
            async let catalogTask: [Item] = client
                .from("shop_items")
                .select("*")
                .eq("is_active", value: true)
                .order("price", ascending: true)
                .order("sort_order", ascending: true)
                .execute()
                .value
            struct IdRow: Decodable { let item_id: String }
            async let invTask: [IdRow] = client
                .from("user_inventory")
                .select("item_id")
                .eq("user_id", value: uid.uuidString)
                .execute()
                .value
            async let eqTask: [IdRow] = client
                .from("user_equipped")
                .select("item_id")
                .eq("user_id", value: uid.uuidString)
                .execute()
                .value
            let (catalog, inv, eq) = try await (catalogTask, invTask, eqTask)
            items = catalog
            owned = Set(inv.map(\.item_id))
            equipped = Set(eq.map(\.item_id))
            loaded = true
        } catch {
            print("[Shop] reload failed:", error)
            lastError = error.localizedDescription
        }
    }

    func purchase(_ item: Item) async -> Bool {
        guard purchasing == nil else { return false }
        purchasing = item.id
        defer { purchasing = nil }
        struct Args: Encodable { let _item_id: String }
        do {
            _ = try await SupabaseManager.shared.client
                .rpc("purchase_shop_item", params: Args(_item_id: item.id))
                .execute()
            owned.insert(item.id)
            SoundService.shared.play(.message)
            await CoinsStore.shared.refresh()
            return true
        } catch {
            let msg = "\(error)"
            if msg.contains("INSUFFICIENT_COINS") {
                lastError = "Not enough coins"
            } else if msg.contains("ALREADY_OWNED") {
                lastError = "Already owned"
            } else {
                lastError = "Purchase failed"
            }
            return false
        }
    }

    func toggleEquip(_ item: Item) async {
        struct Args: Encodable { let _item_id: String }
        let isEq = equipped.contains(item.id)
        let fn = isEq ? "unequip_shop_item" : "equip_shop_item"
        if !isEq && item.category == "badge" {
            let n = items.filter { $0.category == "badge" && equipped.contains($0.id) }.count
            if n >= 3 {
                lastError = "You can only equip 3 badges. Unequip one first."
                return
            }
        }
        do {
            _ = try await SupabaseManager.shared.client
                .rpc(fn, params: Args(_item_id: item.id))
                .execute()
            if isEq { equipped.remove(item.id) } else { equipped.insert(item.id) }
        } catch {
            lastError = "Couldn't update equipped item"
        }
    }

    private func subscribe() async {
        guard let uid = userId else { return }
        let ch = await RealtimeChannelFactory.make("shop-inv:\(uid.uuidString.lowercased())")
        let invIns = ch.postgresChange(
            InsertAction.self, schema: "public", table: "user_inventory",
            filter: "user_id=eq.\(uid.uuidString)")
        let eqAll = ch.postgresChange(
            UpdateAction.self, schema: "public", table: "user_equipped",
            filter: "user_id=eq.\(uid.uuidString)")
        let eqIns = ch.postgresChange(
            InsertAction.self, schema: "public", table: "user_equipped",
            filter: "user_id=eq.\(uid.uuidString)")
        let eqDel = ch.postgresChange(
            DeleteAction.self, schema: "public", table: "user_equipped",
            filter: "user_id=eq.\(uid.uuidString)")
        Task { [weak self] in
            for await action in invIns {
                if let id = action.record["item_id"]?.stringValue {
                    await MainActor.run { self?.owned.insert(id) }
                }
            }
        }
        Task { [weak self] in for await _ in eqAll { await self?.reloadEquipped() } }
        Task { [weak self] in for await _ in eqIns { await self?.reloadEquipped() } }
        Task { [weak self] in for await _ in eqDel { await self?.reloadEquipped() } }
        do { try await ch.subscribeWithError() }
        catch { print("[Shop] subscribe failed:", error) }
        invChannel = ch
    }

    private func reloadEquipped() async {
        guard let uid = userId else { return }
        struct IdRow: Decodable { let item_id: String }
        do {
            let rows: [IdRow] = try await SupabaseManager.shared.client
                .from("user_equipped")
                .select("item_id")
                .eq("user_id", value: uid.uuidString)
                .execute()
                .value
            equipped = Set(rows.map(\.item_id))
        } catch {}
    }
}

private extension AnyJSON {
    var stringValue: String? { if case .string(let s) = self { return s }; return nil }
}
