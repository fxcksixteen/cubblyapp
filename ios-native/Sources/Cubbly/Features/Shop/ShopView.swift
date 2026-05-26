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
    @State private var confirmPurchaseItem: ShopStore.Item?

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
        .sheet(item: $confirmPurchaseItem) { item in
            PurchaseConfirmSheet(
                item: item,
                balance: coins.balance,
                displayName: session.currentProfile?.displayName ?? "YourName",
                onConfirm: {
                    confirmPurchaseItem = nil
                    Task { _ = await shop.purchase(item) }
                },
                onCancel: { confirmPurchaseItem = nil }
            )
            .presentationDetents([.medium])
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
                    BundledAssetImage(name: "coin-stack")
                        .frame(width: 20, height: 20)
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
            // Discord-style confirmation modal before spending coins.
            confirmPurchaseItem = item
        }
    }
}

// MARK: - Purchase confirmation sheet (Cubbly-branded)

private struct PurchaseConfirmSheet: View {
    let item: ShopStore.Item
    let balance: Int
    let displayName: String
    let onConfirm: () -> Void
    let onCancel: () -> Void

    var body: some View {
        ZStack {
            Theme.Colors.bgTertiary.ignoresSafeArea()
            VStack(spacing: 16) {
                ShopItemPreview(item: item, displayName: displayName)
                    .frame(height: 110)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 20)
                    .padding(.top, 18)

                VStack(spacing: 4) {
                    Text("Confirm purchase")
                        .font(.cubbly(18, .heavy))
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text(item.name)
                        .font(.cubbly(15, .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)
                    if let d = item.description, !d.isEmpty {
                        Text(d)
                            .font(.cubbly(12))
                            .foregroundStyle(Theme.Colors.textMuted)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }
                }

                HStack(spacing: 8) {
                    HStack(spacing: 5) {
                        BundledAssetImage(name: "coin-stack")
                            .frame(width: 18, height: 18)
                        Text("\(item.price)")
                            .font(.cubbly(15, .heavy))
                            .foregroundStyle(Theme.Colors.textPrimary)
                            .monospacedDigit()
                    }
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Theme.Colors.bgSecondary, in: Capsule())
                    Text("After: \(balance - item.price) coins")
                        .font(.cubbly(11))
                        .foregroundStyle(Theme.Colors.textMuted)
                        .monospacedDigit()
                }

                Spacer()

                VStack(spacing: 10) {
                    Button(action: onConfirm) {
                        Text("Buy for \(item.price) coins")
                            .font(.cubbly(15, .heavy))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity).padding(.vertical, 13)
                            .background(Theme.Colors.primary, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                    Button(action: onCancel) {
                        Text("Cancel")
                            .font(.cubbly(14, .semibold))
                            .foregroundStyle(Theme.Colors.textSecondary)
                            .frame(maxWidth: .infinity).padding(.vertical, 11)
                            .background(Theme.Colors.bgSecondary, in: RoundedRectangle(cornerRadius: 12))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 18)
            }
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
                        BundledAssetImage(name: "coin-stack")
                            .frame(width: 14, height: 14)
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
        let bgColor = colorFromHex(cfg["bg"] as? String)
        let primary = colorFromHex(cfg["primary"] as? String) ?? Theme.Colors.primary
        let isAnimated = (item.subcategory == "animated") || (cfg["animated"] as? Bool == true)
        ZStack {
            if item.id == "theme_space" {
                SpaceThemePreview()
            } else if let bgColor {
                bgColor
            } else {
                let stops = Self.previewColors(forThemeId: item.id, fallback: primary)
                if isAnimated {
                    AnimatedThemeGradient(colors: stops)
                } else {
                    LinearGradient(colors: stops,
                                   startPoint: .topLeading, endPoint: .bottomTrailing)
                }
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
        let bg = colorFromHex(cfg["bg"] as? String) ?? Theme.Colors.bgFloating
        let fg = colorFromHex(cfg["fg"] as? String) ?? .white
        let glow = colorFromHex(cfg["glow"] as? String) ?? bg
        let iconName = (cfg["icon"] as? String) ?? "star"
        ZStack {
            Theme.Colors.bgTertiary
            HStack(spacing: 10) {
                if let asset = ShopArtwork.badgeAssetName(for: item.id) {
                    BundledAssetImage(name: asset)
                        .frame(width: 56, height: 56)
                        .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
                } else {
                    ZStack {
                        Circle().fill(bg).frame(width: 44, height: 44).shadow(color: glow.opacity(0.55), radius: 6)
                        Image(systemName: Self.sfSymbol(forLucide: iconName))
                            .font(.system(size: 20, weight: .heavy))
                            .foregroundStyle(fg)
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(nameToShow)
                        .font(.cubbly(13, .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(item.name)
                        .font(.cubbly(10, .semibold))
                        .foregroundStyle(Theme.Colors.textMuted)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
        }
    }

    /// Maps Lucide icon names used by the web shop catalog onto the closest
    /// SF Symbol so badges render correctly on iOS without bundling extra
    /// SVG assets per badge.
    static func sfSymbol(forLucide name: String) -> String {
        switch name {
        case "flower":          return "camera.macro"
        case "sparkles":        return "sparkles"
        case "mic":             return "mic.fill"
        case "message_circle":  return "message.fill"
        case "crown":           return "crown.fill"
        case "gamepad":         return "gamecontroller.fill"
        case "moon":            return "moon.stars.fill"
        case "heart":           return "heart.fill"
        case "star":            return "star.fill"
        default:                return "star.fill"
        }
    }

    // MARK: helpers

    private func colorFromHex(_ s: String?) -> Color? {
        guard var hex = s else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard let v = UInt32(hex, radix: 16) else { return nil }
        return Color(hex: v)
    }

    private static func previewColors(forThemeId id: String, fallback: Color) -> [Color] {
        let mapped = ThemeStore.colors(forShopThemeId: id)
        if !mapped.isEmpty { return mapped }
        return [fallback, Theme.Colors.primaryGlow]
    }
}

private struct SpaceThemePreview: View {
    var body: some View {
        ZStack {
            RadialGradient(colors: [Color(hex: 0x0D1224), Color(hex: 0x07080C), Color(hex: 0x04050A)],
                           center: .topLeading, startRadius: 2, endRadius: 150)
            ForEach(0..<22, id: \.self) { i in
                Circle()
                    .fill(Color.white.opacity(i % 3 == 0 ? 0.85 : 0.55))
                    .frame(width: i % 5 == 0 ? 2 : 1, height: i % 5 == 0 ? 2 : 1)
                    .offset(x: CGFloat((i * 37) % 150) - 75, y: CGFloat((i * 23) % 90) - 45)
            }
            Capsule()
                .fill(LinearGradient(colors: [.white.opacity(0), .white.opacity(0.85), .white.opacity(0)], startPoint: .leading, endPoint: .trailing))
                .frame(width: 54, height: 2)
                .rotationEffect(.degrees(-28))
                .offset(x: 32, y: -22)
        }
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
                    BundledAssetImage(name: "coin-stack")
                        .frame(width: 34, height: 34)
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

// (ShopStore.Item already conforms to Identifiable via its `id: String`.)

