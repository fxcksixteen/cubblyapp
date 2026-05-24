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
    }

    /// Background gradient to render at the app root. When no shop theme is
    /// equipped this falls back to the built-in selection.
    var backgroundGradient: [Color] {
        if !equippedShopThemeColors.isEmpty { return equippedShopThemeColors }
        return selectedBuiltIn.gradient
    }

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
            } else {
                equippedShopThemeId = nil
                equippedShopThemeColors = []
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
        default: return []
        }
    }
}
