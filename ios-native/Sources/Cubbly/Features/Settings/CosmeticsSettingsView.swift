import SwiftUI

/// Cosmetics settings — lets users browse Name Colors / Themes / Badges
/// they own and equip/unequip without going through the Shop tab. Locked
/// items show a "Visit Shop" hint matching the web settings panel.
struct CosmeticsSettingsView: View {
    enum Mode: String { case name_color, theme, badge
        var title: String {
            switch self {
            case .name_color: return "Name Colors"
            case .theme: return "Themes"
            case .badge: return "Badges"
            }
        }
    }

    let mode: Mode
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: SessionStore
    @ObservedObject private var shop = ShopStore.shared

    private var items: [ShopStore.Item] {
        shop.items.filter { $0.category == mode.rawValue }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                if items.isEmpty {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Loading catalog…")
                            .font(Theme.Fonts.caption)
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                    .frame(maxWidth: .infinity, minHeight: 200)
                } else {
                    LazyVStack(spacing: 8) {
                        ForEach(items) { item in
                            row(for: item)
                        }
                    }
                    .padding(16)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.bgPrimary.ignoresSafeArea())
            .navigationTitle(mode.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                if let uid = session.currentUserID {
                    await shop.start(userId: uid)
                }
            }
        }
    }

    @ViewBuilder
    private func row(for item: ShopStore.Item) -> some View {
        let isOwned = shop.owned.contains(item.id)
        let isEquipped = shop.equipped.contains(item.id)
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                if let d = item.description, !d.isEmpty {
                    Text(d)
                        .font(Theme.Fonts.caption)
                        .foregroundStyle(Theme.Colors.textMuted)
                        .lineLimit(2)
                }
            }
            Spacer()
            if !isOwned {
                HStack(spacing: 4) {
                    Image(systemName: "lock.fill").font(.system(size: 11))
                    Text("\(item.price)")
                }
                .font(.cubbly(12, .semibold))
                .foregroundStyle(Theme.Colors.textMuted)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Theme.Colors.bgTertiary)
                .clipShape(Capsule())
            } else {
                Button {
                    Task { await shop.toggleEquip(item) }
                } label: {
                    Text(isEquipped ? "Unequip" : "Equip")
                        .font(.cubbly(12, .semibold))
                        .foregroundStyle(isEquipped ? Theme.Colors.textPrimary : .white)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(isEquipped ? Theme.Colors.bgTertiary : Theme.Colors.primary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(Theme.Colors.bgSecondary)
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isEquipped ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}
