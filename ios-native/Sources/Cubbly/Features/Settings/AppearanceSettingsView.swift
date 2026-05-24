import SwiftUI

/// Appearance / Themes panel — mirrors the desktop/web Appearance settings:
/// the four built-in themes (Default, Onyx, Light, Cubbly) plus an "Owned
/// from Shop" list of equipped/equippable shop themes. Selection persists
/// via ThemeStore and re-tints the app background instantly.
struct AppearanceSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: SessionStore
    @ObservedObject private var theme = ThemeStore.shared
    @ObservedObject private var shop = ShopStore.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    section("BUILT-IN THEMES") {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                            ForEach(ThemeStore.Built.allCases) { t in
                                builtInCard(t)
                            }
                        }
                    }

                    let ownedThemes = shop.items.filter { $0.category == "theme" && shop.owned.contains($0.id) }
                    if !ownedThemes.isEmpty {
                        section("YOUR SHOP THEMES") {
                            VStack(spacing: 8) {
                                ForEach(ownedThemes) { item in
                                    shopThemeRow(item)
                                }
                            }
                        }
                    }
                }
                .padding(16)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.bgPrimary.ignoresSafeArea())
            .navigationTitle("Appearance")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
            .task {
                if let uid = session.currentUserID {
                    await shop.start(userId: uid)
                    await theme.start(userId: uid)
                }
            }
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.cubbly(11, .bold)).foregroundStyle(Theme.Colors.textSecondary)
            content()
        }
    }

    private func builtInCard(_ t: ThemeStore.Built) -> some View {
        let selected = theme.equippedShopThemeId == nil && theme.selectedBuiltIn == t
        return Button {
            Task {
                // Unequip any shop theme so the built-in takes effect.
                if let id = theme.equippedShopThemeId,
                   let item = shop.items.first(where: { $0.id == id }) {
                    await shop.toggleEquip(item)
                }
                theme.selectedBuiltIn = t
            }
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                LinearGradient(colors: t.gradient, startPoint: .topLeading, endPoint: .bottomTrailing)
                    .frame(height: 64)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                HStack {
                    Text(t.label).font(.cubbly(13, .bold)).foregroundStyle(Theme.Colors.textPrimary)
                    Spacer()
                    if selected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Theme.Colors.primary)
                    }
                }
            }
            .padding(10)
            .background(Theme.Colors.bgSecondary)
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(
                selected ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private func shopThemeRow(_ item: ShopStore.Item) -> some View {
        let colors = ThemeStore.colors(forShopThemeId: item.id)
        let isEquipped = shop.equipped.contains(item.id)
        return Button {
            Task { await shop.toggleEquip(item) }
        } label: {
            HStack(spacing: 10) {
                LinearGradient(colors: colors.isEmpty ? [Theme.Colors.primary] : colors,
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: 56, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                Text(item.name).font(.cubbly(14, .bold)).foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                Text(isEquipped ? "Equipped" : "Equip")
                    .font(.cubbly(12, .semibold))
                    .foregroundStyle(isEquipped ? .white : Theme.Colors.textPrimary)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(isEquipped ? Theme.Colors.primary : Theme.Colors.bgTertiary, in: Capsule())
            }
            .padding(10)
            .background(Theme.Colors.bgSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
    }
}
