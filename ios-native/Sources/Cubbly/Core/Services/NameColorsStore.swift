import Foundation
import SwiftUI
import Supabase
import Realtime

/// Caches each user's currently-equipped name color (from `user_equipped`
/// joined to `shop_items.config`) so chat bubbles, popups and lists can
/// render colored names without each component round-tripping the DB.
/// Mirrors the web `NameColorsContext` 1:1.
@MainActor
final class NameColorsStore: ObservableObject {
    static let shared = NameColorsStore()

    enum NameColor: Equatable {
        case staticColor(Color)
        case gradient(from: Color, to: Color)
        case animated(stops: [Color])
    }

    @Published private(set) var colors: [UUID: NameColor?] = [:]

    private var pending: Set<UUID> = []
    private var fetchTask: Task<Void, Never>?
    private var channel: RealtimeChannelV2?

    private init() {}

    /// Returns the cached color for `userId`, kicking off a debounced fetch
    /// if we don't have one yet.
    func get(_ userId: UUID?) -> NameColor? {
        guard let userId else { return nil }
        if let cached = colors[userId] { return cached }
        request(userId)
        return nil
    }

    func request(_ userId: UUID) {
        if colors[userId] != nil || pending.contains(userId) { return }
        pending.insert(userId)
        fetchTask?.cancel()
        fetchTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 100_000_000)
            await self?.flush()
        }
    }

    private func flush() async {
        let ids = Array(pending)
        pending.removeAll()
        if ids.isEmpty { return }

        struct Joined: Decodable {
            let user_id: UUID
            let shop_items: ShopRow?
        }
        struct ShopRow: Decodable {
            let subcategory: String?
            let config: AnyJSON?
        }

        do {
            let rows: [Joined] = try await SupabaseManager.shared.client
                .from("user_equipped")
                .select("user_id, shop_items(subcategory, config)")
                .eq("category", value: "name_color")
                .in("user_id", values: ids.map { $0.uuidString })
                .execute()
                .value

            var update = colors
            for id in ids where update[id] == nil { update[id] = .some(nil) }
            for r in rows {
                update[r.user_id] = .some(Self.parse(sub: r.shop_items?.subcategory,
                                                    cfg: r.shop_items?.config?.jsonDictionary ?? [:]))
            }
            colors = update
        } catch {
            print("[NameColors] fetch failed:", error)
        }
    }

    /// Subscribes once to `user_equipped` changes so an equip/unequip
    /// elsewhere recolors live (matches web behaviour).
    func startRealtime() async {
        if channel != nil { return }
        let ch = await RealtimeChannelFactory.make("name-colors-global")
        let ins = ch.postgresChange(InsertAction.self, schema: "public", table: "user_equipped")
        let upd = ch.postgresChange(UpdateAction.self, schema: "public", table: "user_equipped")
        let del = ch.postgresChange(DeleteAction.self, schema: "public", table: "user_equipped")
        Task { [weak self] in for await a in ins { await self?.invalidate(from: a.record) } }
        Task { [weak self] in for await a in upd { await self?.invalidate(from: a.record) } }
        Task { [weak self] in for await a in del { await self?.invalidate(from: a.oldRecord) } }
        do { try await ch.subscribeWithError() } catch { print("[NameColors] subscribe:", error) }
        channel = ch
    }

    private func invalidate(from record: [String: AnyJSON]) async {
        guard
            case .string(let cat)? = record["category"], cat == "name_color",
            case .string(let s)? = record["user_id"], let uid = UUID(uuidString: s)
        else { return }
        await MainActor.run { self.colors.removeValue(forKey: uid) }
        request(uid)
    }

    // MARK: parsing

    private static func parse(sub: String?, cfg: [String: Any]) -> NameColor? {
        switch sub {
        case "static":
            if let s = cfg["color"] as? String, let c = colorFromHex(s) {
                return .staticColor(c)
            }
        case "gradient":
            if let f = cfg["from"] as? String, let t = cfg["to"] as? String,
               let fc = colorFromHex(f), let tc = colorFromHex(t) {
                return .gradient(from: fc, to: tc)
            }
        case "animated":
            if let arr = cfg["stops"] as? [String] {
                let parsed = arr.compactMap { colorFromHex($0) }
                if parsed.count >= 2 { return .animated(stops: parsed) }
            }
        default: break
        }
        return nil
    }

    private static func colorFromHex(_ s: String) -> Color? {
        var hex = s
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard let v = UInt32(hex, radix: 16) else { return nil }
        return Color(hex: v)
    }
}

/// Drop-in `Text` replacement that paints the display name using the user's
/// equipped shop name color (static / gradient / animated motion gradient).
struct CubblyNameText: View {
    let userId: UUID?
    let text: String
    var font: Font = Theme.Fonts.bodyMedium
    var fallback: Color = Theme.Colors.textPrimary

    @ObservedObject private var store = NameColorsStore.shared

    var body: some View {
        let color = userId.flatMap { store.colors[$0] ?? nil }
        switch color {
        case .some(.staticColor(let c)):
            Text(text).font(font).foregroundStyle(c)
        case .some(.gradient(let from, let to)):
            Text(text).font(font)
                .foregroundStyle(LinearGradient(colors: [from, to], startPoint: .leading, endPoint: .trailing))
        case .some(.animated(let stops)):
            AnimatedGradientText(name: text, colors: stops, font: font)
        default:
            Text(text).font(font).foregroundStyle(fallback)
                .onAppear { if let id = userId { store.request(id) } }
        }
    }
}

