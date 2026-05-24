import SwiftUI
import Supabase

/// Native Shop tab — mirrors the web `ShopView` so iOS users can browse the
/// full catalog, see what they own/have equipped, and buy items using the
/// same coin balance synced across web/desktop/iOS.
struct ShopView: View {
    @EnvironmentObject private var session: SessionStore
    @ObservedObject private var shop = ShopStore.shared
    @ObservedObject private var coins = CoinsStore.shared

    enum Tab: String, CaseIterable, Identifiable {
        case all, name_color, theme, badge
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return "All"
            case .name_color: return "Name Colors"
            case .theme: return "Themes"
            case .badge: return "Badges"
            }
        }
    }

    @State private var activeTab: Tab = .all
    @State private var showCoinsInfo = false
    @State private var notEnoughItem: ShopStore.Item?

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                tabsBar
                content
                    .padding(.horizontal, 14)
                    .padding(.top, 6)
                    .padding(.bottom, 80)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
        .task {
            if let uid = session.currentUserID {
                await shop.start(userId: uid)
                await coins.start(userId: uid)
            }
        }
        .refreshable {
            await shop.reload()
            await coins.refresh()
        }
        .sheet(isPresented: $showCoinsInfo) {
            CoinsInfoSheet().presentationDetents([.medium])
        }
        .alert(item: $notEnoughItem) { item in
            Alert(
                title: Text("Not enough coins"),
                message: Text("You need \((item.price - coins.balance)) more coins."),
                dismissButton: .default(Text("OK"))
            )
        }
        .onChange(of: shop.lastError) { _, msg in
            // Reset so the alert can fire again later.
            if let msg, !msg.isEmpty {
                Task {
                    try? await Task.sleep(nanoseconds: 200_000_000)
                    await MainActor.run { shop.lastError = nil }
                }
                print("[Shop] \(msg)")
            }
        }
    }

    // MARK: - Header (title + coin pill)

    private var header: some View {
        HStack(spacing: 10) {
            Text("Shop")
                .font(.cubbly(22, .heavy))
                .foregroundStyle(Theme.Colors.textPrimary)
            Spacer()
            Button {
                showCoinsInfo = true
            } label: {
                HStack(spacing: 6) {
                    Circle().fill(Theme.Colors.primary).frame(width: 16, height: 16)
                        .overlay(Text("C").font(.cubbly(10, .heavy)).foregroundStyle(.white))
                    Text("\(coins.balance)")
                        .font(.cubbly(14, .bold))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .monospacedDigit()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Theme.Colors.bgSecondary)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(Theme.Colors.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    private var tabsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Tab.allCases) { t in
                    Button { activeTab = t } label: {
                        Text(t.label)
                            .font(.cubbly(13, .semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(activeTab == t ? Theme.Colors.bgTertiary : Color.clear)
                            .foregroundStyle(activeTab == t ? Color.white : Theme.Colors.textSecondary)
                            .overlay(Capsule().stroke(
                                activeTab == t ? Theme.Colors.border : Color.clear, lineWidth: 1))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14)
        }
        .padding(.top, 4)
    }

    // MARK: - Content grid

    @ViewBuilder
    private var content: some View {
        if !shop.loaded {
            ProgressView().tint(Theme.Colors.primary)
                .frame(maxWidth: .infinity, minHeight: 160)
        } else {
            let visible = shop.items.filter {
                activeTab == .all || $0.category == activeTab.rawValue
            }
            if visible.isEmpty {
                Text("Nothing here yet — check back soon.")
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                LazyVGrid(columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10),
                ], spacing: 10) {
                    ForEach(visible) { item in
                        ShopItemCard(
                            item: item,
                            isOwned: shop.owned.contains(item.id),
                            isEquipped: shop.equipped.contains(item.id),
                            displayName: session.currentProfile?.displayName ?? "YourName",
                            purchasing: shop.purchasing == item.id,
                            onTap: { handleTap(item) }
                        )
                    }
                }
            }
        }
    }

    private func handleTap(_ item: ShopStore.Item) {
        if shop.owned.contains(item.id) {
            Task { await shop.toggleEquip(item) }
        } else {
            if coins.balance < item.price {
                notEnoughItem = item
                return
            }
            Task { _ = await shop.purchase(item) }
        }
    }
}

// MARK: - Item card

private struct ShopItemCard: View {
    let item: ShopStore.Item
    let isOwned: Bool
    let isEquipped: Bool
    let displayName: String
    let purchasing: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                ShopItemPreview(item: item, displayName: displayName)
                    .frame(height: 84)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .opacity(isOwned ? 1.0 : 0.7)
                    .overlay(alignment: .center) {
                        if !isOwned {
                            ZStack {
                                Circle().fill(Color.black.opacity(0.55)).frame(width: 30, height: 30)
                                Image(systemName: "lock.fill")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }
                    }

                HStack(spacing: 6) {
                    if isOwned {
                        ZStack {
                            Circle()
                                .strokeBorder(isEquipped ? Theme.Colors.primary : Theme.Colors.textMuted, lineWidth: 1.5)
                                .background(Circle().fill(isEquipped ? Theme.Colors.primary : Color.clear))
                                .frame(width: 14, height: 14)
                            if isEquipped {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 8, weight: .black))
                                    .foregroundStyle(.white)
                            }
                        }
                    }
                    Text(item.name)
                        .font(.cubbly(12, .semibold))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .lineLimit(1)
                    Spacer()
                }

                if !isOwned {
                    HStack(spacing: 4) {
                        Circle().fill(Theme.Colors.primary).frame(width: 9, height: 9)
                            .overlay(Text("C").font(.cubbly(6, .heavy)).foregroundStyle(.white))
                        Text("\(item.price)")
                            .font(.cubbly(11, .bold))
                            .foregroundStyle(Theme.Colors.textSecondary)
                            .monospacedDigit()
                        Text("· tap to unlock")
                            .font(.cubbly(10))
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                } else if isEquipped {
                    Text("Equipped")
                        .font(.cubbly(10, .bold))
                        .foregroundStyle(Theme.Colors.primary)
                        .textCase(.uppercase)
                } else {
                    Text("Tap to equip")
                        .font(.cubbly(10))
                        .foregroundStyle(Theme.Colors.textMuted)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Colors.bgSecondary)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(isEquipped ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(purchasing ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .disabled(purchasing)
    }
}

// MARK: - Item preview

private struct ShopItemPreview: View {
    let item: ShopStore.Item
    let displayName: String

    var body: some View {
        switch item.category {
        case "name_color":
            namePreview
        case "theme":
            themePreview
        case "badge":
            badgePreview
        default:
            Rectangle().fill(Theme.Colors.bgTertiary)
        }
    }

    private var nameToShow: String {
        displayName.isEmpty ? "YourName" : displayName
    }

    @ViewBuilder
    private var namePreview: some View {
        let cfg = item.config?.jsonDictionary ?? [:]
        let sub = item.subcategory ?? "static"
        ZStack {
            Theme.Colors.bgTertiary
            if sub == "static" {
                Text(nameToShow)
                    .font(.cubbly(16, .heavy))
                    .foregroundStyle(colorFromHex(cfg["color"] as? String) ?? .white)
                    .lineLimit(1)
            } else if sub == "gradient" {
                let from = colorFromHex(cfg["from"] as? String) ?? Color(hex: 0x22D3EE)
                let to = colorFromHex(cfg["to"] as? String) ?? Color(hex: 0xA855F7)
                Text(nameToShow)
                    .font(.cubbly(16, .heavy))
                    .foregroundStyle(
                        LinearGradient(colors: [from, to], startPoint: .leading, endPoint: .trailing)
                    )
                    .lineLimit(1)
            } else if sub == "animated" {
                let stops: [Color] = (cfg["stops"] as? [String])?.compactMap(colorFromHex)
                    ?? [Color(hex: 0x22D3EE), Color(hex: 0xA855F7), Color(hex: 0xEC4899)]
                AnimatedGradientText(name: nameToShow, colors: stops)
            } else {
                Text(nameToShow).font(.cubbly(16, .heavy)).foregroundStyle(.white)
            }
        }
    }

    @ViewBuilder
    private var themePreview: some View {
        let cfg = item.config?.jsonDictionary ?? [:]
        let preview = cfg["preview"] as? String
        let bgColor = colorFromHex(cfg["bg"] as? String)
        let primary = colorFromHex(cfg["primary"] as? String) ?? Theme.Colors.primary
        ZStack {
            if let bgColor {
                bgColor
            } else if let preview {
                themeBackgroundFromCSS(preview)
            } else {
                LinearGradient(
                    colors: [primary, Theme.Colors.primaryGlow],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            }
            VStack(spacing: 4) {
                Text(item.name)
                    .font(.cubbly(13, .bold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.4), radius: 1)
                Capsule().fill(primary).frame(width: 28, height: 4)
            }
        }
    }

    @ViewBuilder
    private var badgePreview: some View {
        let cfg = item.config?.jsonDictionary ?? [:]
        ZStack {
            Theme.Colors.bgTertiary
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(colorFromHex(cfg["bg"] as? String) ?? Theme.Colors.bgFloating)
                        .frame(width: 36, height: 36)
                    Text("★")
                        .font(.cubbly(18, .heavy))
                        .foregroundStyle(colorFromHex(cfg["fg"] as? String) ?? .white)
                }
                Text(nameToShow)
                    .font(.cubbly(13, .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
        }
    }

    // MARK: helpers

    private func colorFromHex(_ s: String?) -> Color? {
        guard var hex = s else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard let v = UInt32(hex, radix: 16) else { return nil }
        return Color(hex: v)
    }

    @ViewBuilder
    private func themeBackgroundFromCSS(_ s: String) -> some View {
        // We can't parse arbitrary CSS gradients in SwiftUI — pick a sensible
        // default backdrop and overlay the theme name. The full themed UI
        // happens once a theme is equipped server-side.
        LinearGradient(
            colors: [Theme.Colors.primary, Color(hex: 0xEC4899), Color(hex: 0x6366F1)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
        .opacity(0.85)
    }
}

private struct AnimatedGradientText: View {
    let name: String
    let colors: [Color]
    @State private var phase: CGFloat = 0
    var body: some View {
        Text(name)
            .font(.cubbly(16, .heavy))
            .foregroundStyle(
                LinearGradient(
                    colors: colors + [colors.first ?? .white],
                    startPoint: UnitPoint(x: phase, y: 0.5),
                    endPoint: UnitPoint(x: phase + 1, y: 0.5)
                )
            )
            .lineLimit(1)
            .onAppear {
                withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
                    phase = -1
                }
            }
    }
}

// MARK: - Coins info sheet

private struct CoinsInfoSheet: View {
    @ObservedObject private var coins = CoinsStore.shared
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 8) {
                    Circle().fill(Theme.Colors.primary).frame(width: 22, height: 22)
                        .overlay(Text("C").font(.cubbly(13, .heavy)).foregroundStyle(.white))
                    Text("\(coins.balance)")
                        .font(.cubbly(28, .heavy))
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Spacer()
                }
                Text("Earn coins by chatting, hanging out in voice, and gaming with friends. Spend them in the Shop on name colors, themes, and badges.")
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.textSecondary)
                Divider().background(Theme.Colors.divider)
                statRow(label: "Lifetime earned", value: coins.lifetimeEarned)
                statRow(label: "Lifetime spent", value: coins.lifetimeSpent)
                Spacer()
            }
            .padding(20)
            .navigationTitle("Coins")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Theme.Colors.primary)
                }
            }
            .background(Theme.Colors.bgPrimary)
        }
    }
    private func statRow(label: String, value: Int) -> some View {
        HStack {
            Text(label).font(.cubbly(13)).foregroundStyle(Theme.Colors.textSecondary)
            Spacer()
            Text("\(value)").font(.cubbly(14, .bold)).foregroundStyle(Theme.Colors.textPrimary).monospacedDigit()
        }
    }
}

// MARK: - AnyJSON helper



extension AnyJSON {
    /// Best-effort plain dictionary extraction for jsonb columns.
    var jsonDictionary: [String: Any]? {
        guard case .object(let obj) = self else { return nil }
        var out: [String: Any] = [:]
        for (k, v) in obj { out[k] = v.unwrap() }
        return out
    }

    fileprivate func unwrap() -> Any {
        switch self {
        case .null: return NSNull()
        case .bool(let b): return b
        case .integer(let i): return i
        case .double(let d): return d
        case .string(let s): return s
        case .array(let arr): return arr.map { $0.unwrap() }
        case .object(let obj):
            var out: [String: Any] = [:]
            for (k, v) in obj { out[k] = v.unwrap() }
            return out
        }
    }
}

// MARK: - alert(item:) requires Identifiable conformance
extension ShopStore.Item: Identifiable {}
