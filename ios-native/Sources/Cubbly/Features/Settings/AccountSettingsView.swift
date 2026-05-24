import SwiftUI

/// My Account settings parity: profile cosmetics that belong to the account
/// panel on web/desktop (Name Colors + Badges).
struct AccountSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: SessionStore
    @ObservedObject private var shop = ShopStore.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    section("NAME COLORS", category: "name_color")
                    section("BADGES", category: "badge")
                }
                .padding(16)
            }
            .background(Theme.Colors.bgPrimary.ignoresSafeArea())
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
            .task { if let uid = session.currentUserID { await shop.start(userId: uid) } }
        }
    }

    private func section(_ title: String, category: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.cubbly(11, .bold)).foregroundStyle(Theme.Colors.textSecondary)
            ForEach(shop.items.filter { $0.category == category }) { item in row(item) }
        }
    }

    private func row(_ item: ShopStore.Item) -> some View {
        let owned = shop.owned.contains(item.id)
        let equipped = shop.equipped.contains(item.id)
        return HStack(spacing: 12) {
            preview(item)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name).font(Theme.Fonts.bodyMedium).foregroundStyle(Theme.Colors.textPrimary)
                Text(owned ? (equipped ? "Equipped" : "Unlocked") : "Locked")
                    .font(Theme.Fonts.caption).foregroundStyle(Theme.Colors.textMuted)
            }
            Spacer()
            if owned {
                Button(equipped ? "Unequip" : "Equip") { Task { await shop.toggleEquip(item) } }
                    .font(.cubbly(12, .semibold))
                    .foregroundStyle(equipped ? Theme.Colors.textPrimary : .white)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(equipped ? Theme.Colors.bgTertiary : Theme.Colors.primary, in: Capsule())
            } else {
                HStack(spacing: 4) { BundledAssetImage(name: "coin-stack").frame(width: 14, height: 14); Text("\(item.price)") }
                    .font(.cubbly(12, .semibold)).foregroundStyle(Theme.Colors.textMuted)
            }
        }
        .padding(12)
        .background(Theme.Colors.bgSecondary)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(equipped ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    @ViewBuilder private func preview(_ item: ShopStore.Item) -> some View {
        if let asset = ShopArtwork.badgeAssetName(for: item.id) {
            BundledAssetImage(name: asset).frame(width: 42, height: 42)
        } else {
            let cfg = item.config?.jsonDictionary ?? [:]
            let c = (cfg["color"] as? String).flatMap(hexColor) ?? (cfg["from"] as? String).flatMap(hexColor) ?? Theme.Colors.primary
            Circle().fill(c).frame(width: 34, height: 34)
        }
    }

    private func hexColor(_ s: String) -> Color? {
        var h = s; if h.hasPrefix("#") { h.removeFirst() }
        guard let v = UInt32(h, radix: 16) else { return nil }
        return Color(hex: v)
    }
}