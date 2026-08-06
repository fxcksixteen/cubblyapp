import Foundation
import SwiftUI
import Combine
import Supabase
import Realtime

/// Built-in + shop themes for the iOS app. Mirrors the web `ThemeContext`
/// (default / onyx / white / cubbly) plus the equipped shop theme. A subtle
/// background gradient is drawn at the app root so the chosen theme is
/// visible across every screen without rewriting every view's color tokens.
@MainActor
final class ThemeStore: ObservableObject {
    static let shared = ThemeStore()

    struct Palette {
        let bgPrimary: Color
        let bgSecondary: Color
        let bgTertiary: Color
        let bgFloating: Color
        let textPrimary: Color
        let textSecondary: Color
        let textMuted: Color
        let border: Color
        let divider: Color
        let hover: Color
        let input: Color
        let primary: Color
        let primaryGlow: Color
    }

    enum Built: String, CaseIterable, Identifiable {
        case `default`, onyx, white, cubbly
        var id: String { rawValue }
        var label: String {
            switch self {
            case .default: return "Default"
            case .onyx:    return "Onyx"
            case .white:   return "Light"
            case .cubbly:  return "Cubbly"
            }
        }
        /// Gradient stops used both for the swatch and the background tint.
        var gradient: [Color] {
            switch self {
            case .default: return [Color(hex: 0x313338), Color(hex: 0x2B2D31)]
            case .onyx:    return [Color(hex: 0x0B0B0E), Color(hex: 0x16181C)]
            case .white:   return [Color(hex: 0xF2F3F5), Color(hex: 0xE3E5E8)]
            case .cubbly:  return [Color(hex: 0x3a2418), Color(hex: 0x6b3a14), Color(hex: 0xE6A833)]
            }
        }
    }

    @Published var selectedBuiltIn: Built = .default {
        didSet { UserDefaults.standard.set(selectedBuiltIn.rawValue, forKey: "cubbly.theme") }
    }
    /// Equipped shop theme id (e.g. `theme_midnight_aurora`). Wins over
    /// `selectedBuiltIn` when present.
    @Published private(set) var equippedShopThemeId: String?
    @Published private(set) var equippedShopThemeColors: [Color] = []

    private var channel: RealtimeChannelV2?
    private var userId: UUID?

    private init() {
        if let raw = UserDefaults.standard.string(forKey: "cubbly.theme"),
           let v = Built(rawValue: raw) {
            selectedBuiltIn = v
        }
        // Restore the last-known equipped shop theme so the palette is
        // correct on the very first frame, before the network call in
        // start() completes.
        if let cached = UserDefaults.standard.string(forKey: "cubbly.equippedShopTheme") {
            equippedShopThemeId = cached
            equippedShopThemeColors = Self.colors(forShopThemeId: cached)
        }
    }

    /// Background gradient to render at the app root. When no shop theme is
    /// equipped this falls back to the built-in selection.
    var backgroundGradient: [Color] {
        if !equippedShopThemeColors.isEmpty { return equippedShopThemeColors }
        return selectedBuiltIn.gradient
    }

    var currentThemeKey: String {
        if let id = equippedShopThemeId { return Self.themeKey(forShopThemeId: id) }
        return selectedBuiltIn.rawValue
    }

    var palette: Palette { Self.palette(for: currentThemeKey) }

    /// Should the chrome render in "light" mode? Currently only the built-in
    /// Light theme triggers this — shop themes are all dark-leaning.
    var isLight: Bool { equippedShopThemeId == nil && selectedBuiltIn == .white }

    func start(userId: UUID) async {
        if self.userId == userId, channel != nil { return }
        await stop()
        self.userId = userId
        await reload()
        await subscribe()
    }

    func stop() async {
        await RealtimeChannelFactory.remove(channel)
        channel = nil
        userId = nil
        equippedShopThemeId = nil
        equippedShopThemeColors = []
        UserDefaults.standard.removeObject(forKey: "cubbly.equippedShopTheme")
    }

    func reload() async {
        guard let uid = userId else { return }
        struct Row: Decodable { let item_id: String }
        do {
            let rows: [Row] = try await SupabaseManager.shared.client
                .from("user_equipped")
                .select("item_id")
                .eq("user_id", value: uid.uuidString)
                .eq("category", value: "theme")
                .execute()
                .value
            if let id = rows.first?.item_id {
                equippedShopThemeId = id
                equippedShopThemeColors = Self.colors(forShopThemeId: id)
                UserDefaults.standard.set(id, forKey: "cubbly.equippedShopTheme")
            } else {
                equippedShopThemeId = nil
                equippedShopThemeColors = []
                UserDefaults.standard.removeObject(forKey: "cubbly.equippedShopTheme")
            }
        } catch {
            print("[Theme] reload failed:", error)
        }
    }

    private func subscribe() async {
        guard let uid = userId else { return }
        let ch = await RealtimeChannelFactory.make("equipped-theme:\(uid.uuidString.lowercased())")
        let all = ch.postgresChange(AnyAction.self, schema: "public", table: "user_equipped",
                                    filter: "user_id=eq.\(uid.uuidString)")
        Task { [weak self] in for await _ in all { await self?.reload() } }
        do { try await ch.subscribeWithError() } catch { print("[Theme] subscribe failed:", error) }
        channel = ch
    }

    /// Lookup table mirroring `EquippedThemeBridge` on the web — maps a
    /// shop theme id to its background colors.
    static func colors(forShopThemeId id: String) -> [Color] {
        switch id {
        case "theme_midnight_aurora": return [Color(hex: 0x0f172a), Color(hex: 0x1e1b4b), Color(hex: 0x312e81), Color(hex: 0x0f172a)]
        case "theme_sunset_cozy":     return [Color(hex: 0xf59e0b), Color(hex: 0xef4444), Color(hex: 0xec4899)]
        case "theme_space":           return [Color(hex: 0x000010), Color(hex: 0x0b0f2a), Color(hex: 0x1a1052)]
        case "theme_ocean_depths":    return [Color(hex: 0x0b1d2e), Color(hex: 0x0a263d), Color(hex: 0x144064)]
        case "theme_cherry_blossom":  return [Color(hex: 0x2a1721), Color(hex: 0x3a2030), Color(hex: 0xf59ec4)]
        case "theme_evergreen":       return [Color(hex: 0x0f1d14), Color(hex: 0x163020), Color(hex: 0x1c4029)]
        case "theme_synthwave":       return [Color(hex: 0x150a2e), Color(hex: 0x2a0e5e), Color(hex: 0x5b1f8e), Color(hex: 0x150a2e)]
        case "theme_lava_flow":       return [Color(hex: 0x1f0a06), Color(hex: 0x5a1408), Color(hex: 0xb03a14), Color(hex: 0x5a1408)]
        case "theme_borealis":        return [Color(hex: 0x08131c), Color(hex: 0x0e3a4a), Color(hex: 0x1e7a6e), Color(hex: 0x6ee7b7), Color(hex: 0x0e3a4a)]
        case "theme_sky_dusk":        return [Color(hex: 0x1B2658), Color(hex: 0x4B3A78), Color(hex: 0xE48A5E), Color(hex: 0xF5BE7A)]
        case "theme_snowy_drift":     return [Color(hex: 0x0E1A2C), Color(hex: 0x1B2B45), Color(hex: 0x2C4063)]
        case "theme_moonlit_hills":   return [Color(hex: 0x070A1A), Color(hex: 0x0E1438), Color(hex: 0x1C2455), Color(hex: 0x14213D)]
        // Gem themes (purchased with gems, not coins)
        case "theme_cosmic_nebula":   return [Color(hex: 0x4C1D95), Color(hex: 0x1E0B3B), Color(hex: 0x05030F)]
        case "theme_cyber_grid":      return [Color(hex: 0x050014), Color(hex: 0x0F0330), Color(hex: 0xFF2FBF)]
        case "theme_volcanic":        return [Color(hex: 0xFF5B1F), Color(hex: 0x7A1502), Color(hex: 0x1A0503)]
        case "theme_bioluminescent":  return [Color(hex: 0x062A5C), Color(hex: 0x021030), Color(hex: 0x01050F)]
        case "theme_aurora_borealis": return [Color(hex: 0x01102A), Color(hex: 0x03215A), Color(hex: 0x0B6B6B), Color(hex: 0x0A3F45)]
        case "theme_sakura_storm":    return [Color(hex: 0x2A0E30), Color(hex: 0x5C1846), Color(hex: 0xC86E94), Color(hex: 0xF4C1A6)]
        default: return []
        }
    }

    static func themeKey(forShopThemeId id: String) -> String {
        switch id {
        case "theme_midnight_aurora": return "onyx"
        case "theme_sunset_cozy":     return "cubbly"
        case "theme_space":           return "space"
        case "theme_ocean_depths":    return "ocean"
        case "theme_cherry_blossom":  return "blossom"
        case "theme_evergreen":       return "forest"
        case "theme_synthwave":       return "synthwave"
        case "theme_lava_flow":       return "lava"
        case "theme_borealis":        return "borealis"
        case "theme_sky_dusk":        return "sky"
        case "theme_snowy_drift":     return "snowy"
        case "theme_moonlit_hills":   return "hills"
        case "theme_cosmic_nebula":   return "nebula"
        case "theme_cyber_grid":      return "cyber"
        case "theme_volcanic":        return "volcanic"
        case "theme_bioluminescent":  return "biolume"
        case "theme_aurora_borealis": return "northern"
        case "theme_sakura_storm":    return "sakura"
        default: return "default"
        }
    }

    static func palette(for key: String) -> Palette {
        switch key {
        case "onyx": return Palette(bgPrimary: Color(hex: 0x0A0A0A), bgSecondary: Color(hex: 0x111111), bgTertiary: Color(hex: 0x000000), bgFloating: Color(hex: 0x0D0D0D), textPrimary: Color(hex: 0xE0E0E0), textSecondary: Color(hex: 0x888888), textMuted: Color(hex: 0x555555), border: Color.white.opacity(0.10), divider: Color.white.opacity(0.06), hover: Color(hex: 0x1A1A1A), input: Color(hex: 0x1A1A1A), primary: Color.white, primaryGlow: Color(hex: 0xCFCFCF))
        case "white": return Palette(bgPrimary: Color(hex: 0xFFFFFF), bgSecondary: Color(hex: 0xF2F3F5), bgTertiary: Color(hex: 0xE3E5E8), bgFloating: Color(hex: 0xEBEDEF), textPrimary: Color(hex: 0x060607), textSecondary: Color(hex: 0x4E5058), textMuted: Color(hex: 0x80848E), border: Color.black.opacity(0.10), divider: Color.black.opacity(0.06), hover: Color(hex: 0xEBEDEF), input: Color(hex: 0xEBEDEF), primary: Color(hex: 0x5865F2), primaryGlow: Color(hex: 0x7B83F5))
        case "cubbly": return Palette(bgPrimary: Color(hex: 0x2A1F14), bgSecondary: Color(hex: 0x1E1610), bgTertiary: Color(hex: 0x140E08), bgFloating: Color(hex: 0x241A10), textPrimary: Color(hex: 0xE8DDD0), textSecondary: Color(hex: 0xA08B72), textMuted: Color(hex: 0x6B5A45), border: Color(hex: 0x3D2A18), divider: Color(hex: 0x3D2A18).opacity(0.65), hover: Color(hex: 0x3D2A18), input: Color(hex: 0x3D2A18), primary: Color(hex: 0xF79348), primaryGlow: Color(hex: 0xF2C062))
        case "space": return Palette(bgPrimary: Color(hex: 0x07080C), bgSecondary: Color(hex: 0x0C0E14), bgTertiary: Color(hex: 0x050609), bgFloating: Color(hex: 0x10131C), textPrimary: Color(hex: 0xE8ECF5), textSecondary: Color(hex: 0x8A93A8), textMuted: Color(hex: 0x565D70), border: Color(hex: 0x1A1E2A), divider: Color(hex: 0x1A1E2A).opacity(0.7), hover: Color(hex: 0x141826), input: Color(hex: 0x141826), primary: Color(hex: 0x6C7CFF), primaryGlow: Color(hex: 0x9AA5FF))
        case "ocean": return Palette(bgPrimary: Color(hex: 0x0B1D2E), bgSecondary: Color(hex: 0x0A263D), bgTertiary: Color(hex: 0x061522), bgFloating: Color(hex: 0x0E2C45), textPrimary: Color(hex: 0xDCEAF5), textSecondary: Color(hex: 0x7FA6C4), textMuted: Color(hex: 0x4F7894), border: Color(hex: 0x103048), divider: Color(hex: 0x103048).opacity(0.7), hover: Color(hex: 0x103048), input: Color(hex: 0x103048), primary: Color(hex: 0x38BDF8), primaryGlow: Color(hex: 0x7DD3FC))
        case "blossom": return Palette(bgPrimary: Color(hex: 0x2A1721), bgSecondary: Color(hex: 0x20121A), bgTertiary: Color(hex: 0x160B11), bgFloating: Color(hex: 0x2F1A26), textPrimary: Color(hex: 0xF6DDE7), textSecondary: Color(hex: 0xC89BB1), textMuted: Color(hex: 0x8A6A7A), border: Color(hex: 0x3A2030), divider: Color(hex: 0x3A2030).opacity(0.7), hover: Color(hex: 0x3A2030), input: Color(hex: 0x3A2030), primary: Color(hex: 0xF472B6), primaryGlow: Color(hex: 0xF9A8D4))
        case "forest": return Palette(bgPrimary: Color(hex: 0x0F1D14), bgSecondary: Color(hex: 0x0A1810), bgTertiary: Color(hex: 0x06110A), bgFloating: Color(hex: 0x112317), textPrimary: Color(hex: 0xD6E8D8), textSecondary: Color(hex: 0x8EB094), textMuted: Color(hex: 0x5D7A62), border: Color(hex: 0x163020), divider: Color(hex: 0x163020).opacity(0.7), hover: Color(hex: 0x163020), input: Color(hex: 0x163020), primary: Color(hex: 0x4ADE80), primaryGlow: Color(hex: 0x86EFAC))
        case "synthwave": return Palette(bgPrimary: Color(hex: 0x150A2E), bgSecondary: Color(hex: 0x1C0D3A), bgTertiary: Color(hex: 0x0C0520), bgFloating: Color(hex: 0x210F44), textPrimary: Color(hex: 0xF4E8FF), textSecondary: Color(hex: 0xC0A8E8), textMuted: Color(hex: 0x7E6AA8), border: Color(hex: 0x2A1455), divider: Color(hex: 0x2A1455).opacity(0.7), hover: Color(hex: 0x2A1455), input: Color(hex: 0x2A1455), primary: Color(hex: 0xD946EF), primaryGlow: Color(hex: 0xF0ABFC))
        case "lava": return Palette(bgPrimary: Color(hex: 0x1F0A06), bgSecondary: Color(hex: 0x2A0C06), bgTertiary: Color(hex: 0x150603), bgFloating: Color(hex: 0x2E110A), textPrimary: Color(hex: 0xF7E1D2), textSecondary: Color(hex: 0xD09077), textMuted: Color(hex: 0x8E5A45), border: Color(hex: 0x3A160C), divider: Color(hex: 0x3A160C).opacity(0.7), hover: Color(hex: 0x3A160C), input: Color(hex: 0x3A160C), primary: Color(hex: 0xFF7A3A), primaryGlow: Color(hex: 0xFDBA74))
        case "borealis": return Palette(bgPrimary: Color(hex: 0x08131C), bgSecondary: Color(hex: 0x0A1A26), bgTertiary: Color(hex: 0x050D14), bgFloating: Color(hex: 0x0E2230), textPrimary: Color(hex: 0xE0F5EE), textSecondary: Color(hex: 0x7FB9B0), textMuted: Color(hex: 0x4D7D77), border: Color(hex: 0x122A36), divider: Color(hex: 0x122A36).opacity(0.7), hover: Color(hex: 0x122A36), input: Color(hex: 0x122A36), primary: Color(hex: 0x6EE7B7), primaryGlow: Color(hex: 0xA7F3D0))
        case "sky": return Palette(bgPrimary: Color(hex: 0x1B2658), bgSecondary: Color(hex: 0x14204A), bgTertiary: Color(hex: 0x0E1736), bgFloating: Color(hex: 0x213069), textPrimary: Color(hex: 0xF7ECDA), textSecondary: Color(hex: 0xC9B59A), textMuted: Color(hex: 0x8A7E6A), border: Color(hex: 0x2A3870), divider: Color(hex: 0x2A3870).opacity(0.65), hover: Color(hex: 0x2A3870), input: Color(hex: 0x2A3870), primary: Color(hex: 0xF5BE7A), primaryGlow: Color(hex: 0xF8D7A8))
        case "snowy": return Palette(bgPrimary: Color(hex: 0x0E1A2C), bgSecondary: Color(hex: 0x142440), bgTertiary: Color(hex: 0x081020), bgFloating: Color(hex: 0x172A48), textPrimary: Color(hex: 0xE6EEFA), textSecondary: Color(hex: 0x9AB0CC), textMuted: Color(hex: 0x5F7493), border: Color(hex: 0x1F3458), divider: Color(hex: 0x1F3458).opacity(0.65), hover: Color(hex: 0x1F3458), input: Color(hex: 0x1F3458), primary: Color(hex: 0x7CC0FF), primaryGlow: Color(hex: 0xBDDFFF))
        case "hills": return Palette(bgPrimary: Color(hex: 0x070A1A), bgSecondary: Color(hex: 0x0E1438), bgTertiary: Color(hex: 0x05081A), bgFloating: Color(hex: 0x121A45), textPrimary: Color(hex: 0xE6E8F5), textSecondary: Color(hex: 0x95A0C4), textMuted: Color(hex: 0x5C6890), border: Color(hex: 0x1C2455), divider: Color(hex: 0x1C2455).opacity(0.7), hover: Color(hex: 0x1C2455), input: Color(hex: 0x1C2455), primary: Color(hex: 0xF6F1D5), primaryGlow: Color(hex: 0xF9E9B0))
        case "nebula": return Palette(bgPrimary: Color(hex: 0x140A2E), bgSecondary: Color(hex: 0x1E0B3B), bgTertiary: Color(hex: 0x05030F), bgFloating: Color(hex: 0x241046), textPrimary: Color(hex: 0xEDE4FF), textSecondary: Color(hex: 0xB29ADB), textMuted: Color(hex: 0x7A66A3), border: Color(hex: 0x30165C), divider: Color(hex: 0x30165C).opacity(0.7), hover: Color(hex: 0x30165C), input: Color(hex: 0x30165C), primary: Color(hex: 0xA855F7), primaryGlow: Color(hex: 0xD8B4FE))
        case "cyber": return Palette(bgPrimary: Color(hex: 0x08021C), bgSecondary: Color(hex: 0x0F0330), bgTertiary: Color(hex: 0x050014), bgFloating: Color(hex: 0x15063F), textPrimary: Color(hex: 0xFDE7FA), textSecondary: Color(hex: 0xC08ADA), textMuted: Color(hex: 0x7E5B9C), border: Color(hex: 0x24084F), divider: Color(hex: 0x24084F).opacity(0.7), hover: Color(hex: 0x24084F), input: Color(hex: 0x24084F), primary: Color(hex: 0xFF2FBF), primaryGlow: Color(hex: 0xFF8AD9))
        case "volcanic": return Palette(bgPrimary: Color(hex: 0x1A0503), bgSecondary: Color(hex: 0x2A0A04), bgTertiary: Color(hex: 0x110301), bgFloating: Color(hex: 0x330D06), textPrimary: Color(hex: 0xFFE3D2), textSecondary: Color(hex: 0xD08C6C), textMuted: Color(hex: 0x8E543C), border: Color(hex: 0x45130A), divider: Color(hex: 0x45130A).opacity(0.7), hover: Color(hex: 0x45130A), input: Color(hex: 0x45130A), primary: Color(hex: 0xFF5B1F), primaryGlow: Color(hex: 0xFFA06B))
        case "biolume": return Palette(bgPrimary: Color(hex: 0x01050F), bgSecondary: Color(hex: 0x021030), bgTertiary: Color(hex: 0x010309), bgFloating: Color(hex: 0x04173F), textPrimary: Color(hex: 0xDDF7FF), textSecondary: Color(hex: 0x76B9CF), textMuted: Color(hex: 0x497D95), border: Color(hex: 0x062A5C), divider: Color(hex: 0x062A5C).opacity(0.7), hover: Color(hex: 0x062A5C), input: Color(hex: 0x062A5C), primary: Color(hex: 0x22D3EE), primaryGlow: Color(hex: 0x8FF3FF))
        case "northern": return Palette(bgPrimary: Color(hex: 0x01102A), bgSecondary: Color(hex: 0x03215A), bgTertiary: Color(hex: 0x010A1C), bgFloating: Color(hex: 0x052A63), textPrimary: Color(hex: 0xDFFBF3), textSecondary: Color(hex: 0x78BFB6), textMuted: Color(hex: 0x4A8079), border: Color(hex: 0x0A3F45), divider: Color(hex: 0x0A3F45).opacity(0.7), hover: Color(hex: 0x0A3F45), input: Color(hex: 0x0A3F45), primary: Color(hex: 0x34E7C4), primaryGlow: Color(hex: 0x9BF6E4))
        case "sakura": return Palette(bgPrimary: Color(hex: 0x2A0E30), bgSecondary: Color(hex: 0x3D1339), bgTertiary: Color(hex: 0x1B0820), bgFloating: Color(hex: 0x4A1741), textPrimary: Color(hex: 0xFFE6EE), textSecondary: Color(hex: 0xD79CB4), textMuted: Color(hex: 0x996B81), border: Color(hex: 0x5C1846), divider: Color(hex: 0x5C1846).opacity(0.7), hover: Color(hex: 0x5C1846), input: Color(hex: 0x5C1846), primary: Color(hex: 0xF472B6), primaryGlow: Color(hex: 0xF9C6DC))
        default: return Palette(bgPrimary: Color(hex: 0x313338), bgSecondary: Color(hex: 0x2B2D31), bgTertiary: Color(hex: 0x1E1F22), bgFloating: Color(hex: 0x111214), textPrimary: Color(hex: 0xF2F3F5), textSecondary: Color(hex: 0xB5BAC1), textMuted: Color(hex: 0x80848E), border: Color.white.opacity(0.06), divider: Color.white.opacity(0.04), hover: Color.white.opacity(0.05), input: Color(hex: 0x383A40), primary: Color(hex: 0xE6A833), primaryGlow: Color(hex: 0xF2C062))
        }
    }
}
