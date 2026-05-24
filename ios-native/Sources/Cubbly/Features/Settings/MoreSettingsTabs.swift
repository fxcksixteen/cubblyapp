import SwiftUI

/// Settings tabs that exist on the desktop/web app and are now surfaced on
/// iOS so users have full parity in navigation. Most settings here are
/// either iOS-managed (Language/Devices/Keybinds) or live primarily on
/// desktop (Gaming Mode, Advanced) — in those cases we explain that and
/// link the user back to the relevant native iOS settings where possible.
struct MoreSettingsTabView: View {
    enum Mode: String, Identifiable, CaseIterable {
        case accessibility, chat, contentSocial, dataPrivacy, devices
        case gamingMode, keybinds, languageTime, advanced, updateLogs
        var id: String { rawValue }
        var title: String {
            switch self {
            case .accessibility: return "Accessibility"
            case .chat:          return "Chat"
            case .contentSocial: return "Content & Social"
            case .dataPrivacy:   return "Data & Privacy"
            case .devices:       return "Devices"
            case .gamingMode:    return "Gaming Mode"
            case .keybinds:      return "Keybinds"
            case .languageTime:  return "Language & Time"
            case .advanced:      return "Advanced"
            case .updateLogs:    return "What's New"
            }
        }
        var icon: String {
            switch self {
            case .accessibility: return "accessibility"
            case .chat:          return "bubble.left.and.bubble.right.fill"
            case .contentSocial: return "person.2.fill"
            case .dataPrivacy:   return "lock.shield.fill"
            case .devices:       return "iphone"
            case .gamingMode:    return "gamecontroller.fill"
            case .keybinds:      return "keyboard"
            case .languageTime:  return "globe"
            case .advanced:      return "wrench.adjustable.fill"
            case .updateLogs:    return "sparkles"
            }
        }
    }

    let mode: Mode
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    body(for: mode)
                }
                .padding(16)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.bgPrimary.ignoresSafeArea())
            .navigationTitle(mode.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: mode.icon)
                .font(.system(size: 22))
                .foregroundStyle(Theme.Colors.primary)
                .frame(width: 40, height: 40)
                .background(Theme.Colors.bgSecondary, in: Circle())
            Text(mode.title)
                .font(.cubbly(20, .heavy))
                .foregroundStyle(Theme.Colors.textPrimary)
            Spacer()
        }
    }

    @ViewBuilder
    private func body(for mode: Mode) -> some View {
        switch mode {
        case .accessibility:
            card("System control",
                 "Cubbly inherits iOS accessibility settings: dynamic type, bold text, reduce motion, VoiceOver and increase contrast all apply automatically.",
                 systemSettingsLabel: "Open iOS Accessibility")
        case .chat:
            card("Coming soon",
                 "Per-chat sound, message grouping and emoji-style settings are managed on desktop & web for now and roll out to iOS in a follow-up.",
                 systemSettingsLabel: nil)
        case .contentSocial:
            card("Friend requests & DM filtering",
                 "Blocking, friend-request filtering and content sensitivity controls sync from desktop/web. Edit them on the web app and your iOS device will follow.",
                 systemSettingsLabel: nil)
        case .dataPrivacy:
            card("Your data",
                 "Activity-status privacy lives in the Activity Privacy tab. Account deletion and full data export run from the desktop/web app.",
                 systemSettingsLabel: nil)
        case .devices:
            card("Signed-in devices",
                 "Manage active sessions and sign out other devices from desktop/web. Push notifications for this iPhone are configured in the Notifications tab.",
                 systemSettingsLabel: nil)
        case .gamingMode:
            card("Desktop only",
                 "Gaming Mode integrates with Discord-style overlay and process detection that only the desktop app can access. iOS shows activity broadcast by your friends but doesn't broadcast its own games.",
                 systemSettingsLabel: nil)
        case .keybinds:
            card("Desktop only",
                 "Push-to-talk and other keybinds live on the desktop app. iOS uses touch controls during calls.",
                 systemSettingsLabel: nil)
        case .languageTime:
            card("System control",
                 "Cubbly follows your iOS language and time zone. Change them in iOS Settings → General.",
                 systemSettingsLabel: "Open iOS Settings")
        case .advanced:
            card("Diagnostics",
                 "Crash reports, hardware acceleration and developer overrides only apply to the desktop app. iOS automatically uses the optimal pipeline.",
                 systemSettingsLabel: nil)
        case .updateLogs:
            card("What's new in v\(CubblyConfig.appVersion)",
                 "• Fixed in-call speaker / mute / deafen buttons\n• Purchase confirmation modal in the Shop\n• Built-in & Shop themes selectable from Appearance\n• Friend activity (Playing/Using) now visible from profile popup\n• Settings tabs expanded to match web/desktop",
                 systemSettingsLabel: nil)
        }
    }

    private func card(_ title: String, _ body: String, systemSettingsLabel: String?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.cubbly(15, .heavy)).foregroundStyle(Theme.Colors.textPrimary)
            Text(body).font(.cubbly(13)).foregroundStyle(Theme.Colors.textSecondary)
            if let label = systemSettingsLabel {
                Button {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    Text(label)
                        .font(.cubbly(13, .semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .background(Theme.Colors.primary, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Colors.bgSecondary)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.Colors.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
