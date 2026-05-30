import Foundation
import SwiftUI
import Supabase
import Realtime

/// Caches each user's currently-equipped badges (joined to `shop_items.config`)
/// so DM rows, chat bubbles and profile popups can show them inline.
/// Mirrors the web `UserBadgesContext` 1:1.
@MainActor
final class UserBadgesStore: ObservableObject {
    static let shared = UserBadgesStore()

    struct BadgeData: Equatable, Identifiable {
        let id: String         // shop_items.id
        let icon: String
        let bg: String
        let fg: String
        let glow: String?
        let label: String
        let description: String?
    }

    @Published private(set) var badges: [UUID: [BadgeData]] = [:]

    private var pending: Set<UUID> = []
    private var fetchTask: Task<Void, Never>?
    private var channel: RealtimeChannelV2?

    private init() {}

    func get(_ userId: UUID?) -> [BadgeData] {
        guard let userId else { return [] }
        if let cached = badges[userId] { return cached }
        request(userId)
        return []
    }

    func request(_ userId: UUID) {
        if badges[userId] != nil || pending.contains(userId) { return }
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

        do {
            // 1) Fetch equipped badge rows for the requested users.
            struct EquippedRow: Decodable {
                let user_id: UUID
                let item_id: String
                let slot: Int?
            }
            let equipped: [EquippedRow] = try await SupabaseManager.shared.client
                .from("user_equipped")
                .select("user_id,item_id,slot")
                .eq("category", value: "badge")
                .in("user_id", values: ids.map { $0.uuidString })
                .order("slot", ascending: true)
                .execute()
                .value

            // 2) Fetch the matching shop_items in one batch.
            let itemIDs = Array(Set(equipped.map(\.item_id)))
            struct ShopItemRow: Decodable {
                let id: String
                let category: String?
                let config: AnyJSON?
                let name: String?
                let description: String?
            }
            var itemByID: [String: ShopItemRow] = [:]
            if !itemIDs.isEmpty {
                let items: [ShopItemRow] = try await SupabaseManager.shared.client
                    .from("shop_items")
                    .select("id,category,config,name,description")
                    .in("id", values: itemIDs)
                    .execute()
                    .value
                itemByID = Dictionary(uniqueKeysWithValues: items.map { ($0.id, $0) })
            }

            // 3) Build per-user badge lists.
            var update = badges
            for id in ids { update[id] = [] }
            for row in equipped {
                guard let item = itemByID[row.item_id], item.category == "badge" else { continue }
                let cfg = item.config?.jsonDictionary ?? [:]
                let badge = BadgeData(
                    id: row.item_id,
                    icon: (cfg["icon"] as? String) ?? "star",
                    bg: (cfg["bg"] as? String) ?? "#3f4147",
                    fg: (cfg["fg"] as? String) ?? "#ffffff",
                    glow: cfg["glow"] as? String,
                    label: (cfg["label"] as? String) ?? item.name ?? "Badge",
                    description: item.description ?? (cfg["description"] as? String)
                )
                update[row.user_id, default: []].append(badge)
            }
            badges = update
        } catch {
            print("[UserBadges] fetch failed:", error)
        }
    }

    private struct Joined: Decodable {
        let user_id: UUID
        let item_id: String
        let slot: Int?
        let shop_items: ShopRow?
    }
    private struct ShopRow: Decodable {
        let category: String?
        let config: AnyJSON?
        let name: String?
        let description: String?
    }

    func startRealtime() async {
        if channel != nil { return }
        let ch = await RealtimeChannelFactory.make("user-badges-global")
        let ins = ch.postgresChange(InsertAction.self, schema: "public", table: "user_equipped")
        let upd = ch.postgresChange(UpdateAction.self, schema: "public", table: "user_equipped")
        let del = ch.postgresChange(DeleteAction.self, schema: "public", table: "user_equipped")
        Task { [weak self] in for await a in ins { await self?.invalidate(from: a.record) } }
        Task { [weak self] in for await a in upd { await self?.invalidate(from: a.record) } }
        Task { [weak self] in for await a in del { await self?.invalidate(from: a.oldRecord) } }
        do { try await ch.subscribeWithError() } catch { print("[UserBadges] subscribe:", error) }
        channel = ch
    }

    private func invalidate(from record: [String: AnyJSON]) async {
        guard
            case .string(let cat)? = record["category"], cat == "badge",
            case .string(let s)? = record["user_id"], let uid = UUID(uuidString: s)
        else { return }
        await MainActor.run { self.badges.removeValue(forKey: uid) }
        request(uid)
    }
}

/// Renders the equipped-badge row for a user (uses bundled 3D artwork when
/// the badge id has a mapped asset, otherwise a coloured-chip fallback).
struct UserBadgesRow: View {
    let userID: UUID?
    var size: CGFloat = 14

    @ObservedObject private var store = UserBadgesStore.shared

    var body: some View {
        let list = userID.flatMap { store.get($0) } ?? []
        HStack(spacing: 3) {
            ForEach(list) { b in
                BadgeIcon(badge: b, size: size)
            }
        }
        .fixedSize(horizontal: true, vertical: true)
        .onAppear { if let id = userID { store.request(id) } }
    }
}

private struct BadgeIcon: View {
    let badge: UserBadgesStore.BadgeData
    let size: CGFloat

    var body: some View {
        let asset = ShopArtwork.badgeAssetName(for: badge.id)
        if let asset {
            let render = size * 1.4
            BundledAssetImage(name: asset)
                .frame(width: render, height: render)
                .shadow(color: .black.opacity(0.35), radius: 0.75, x: 0, y: 1)
        } else {
            ZStack {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(Color(hex: badge.bg) ?? Theme.Colors.bgTertiary)
                Image(systemName: systemIcon(for: badge.icon))
                    .font(.system(size: size * 0.7, weight: .bold))
                    .foregroundStyle(Color(hex: badge.fg) ?? .white)
            }
            .frame(width: size, height: size)
        }
    }

    private func systemIcon(for key: String) -> String {
        switch key {
        case "sparkles": return "sparkles"
        case "mic": return "mic.fill"
        case "crown": return "crown.fill"
        case "message_circle": return "message.fill"
        case "gamepad": return "gamecontroller.fill"
        case "moon": return "moon.fill"
        case "heart": return "heart.fill"
        case "flower": return "leaf.fill"
        default: return "star.fill"
        }
    }
}

private extension Color {
    init?(hex: String?) {
        guard var hex else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard let v = UInt32(hex, radix: 16) else { return nil }
        self = Color(hex: v)
    }
}
