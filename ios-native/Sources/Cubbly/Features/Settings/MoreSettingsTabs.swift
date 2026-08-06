import SwiftUI

/// Settings tabs that exist on the desktop/web app, now with real, working
/// controls on iOS instead of placeholder text. Anything that genuinely only
/// exists on desktop (Gaming Mode process detection, keybinds) says so plainly
/// rather than pretending to be configurable here.
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
    @EnvironmentObject private var session: SessionStore
    @ObservedObject private var settings = AppSettingsStore.shared
    @ObservedObject private var devicesStore = DevicesStore.shared
    @ObservedObject private var social = SocialPrivacyStore.shared

    @State private var showResetConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    header
                    content
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
            .task {
                guard let uid = session.currentUserID else { return }
                if mode == .devices { await devicesStore.load(userId: uid) }
                if mode == .contentSocial || mode == .dataPrivacy {
                    await social.load(userId: uid)
                }
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

    // MARK: - Tab bodies

    @ViewBuilder
    private var content: some View {
        switch mode {
        case .accessibility:  accessibilityTab
        case .chat:           chatTab
        case .contentSocial:  contentSocialTab
        case .dataPrivacy:    dataPrivacyTab
        case .devices:        devicesTab
        case .gamingMode:     gamingModeTab
        case .keybinds:       keybindsTab
        case .languageTime:   languageTab
        case .advanced:       advancedTab
        case .updateLogs:     updateLogsTab
        }
    }

    private var accessibilityTab: some View {
        VStack(spacing: 14) {
            section("Motion & contrast") {
                toggleRow("Reduce motion", "Turns off animated themes, gradients and transitions.",
                          isOn: $settings.reduceMotion)
                toggleRow("Reduce transparency", "Replaces blurred panels with solid backgrounds.",
                          isOn: $settings.reduceTransparency)
            }
            section("Text size") {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Message text scale")
                            .font(.cubbly(14, .semibold))
                            .foregroundStyle(Theme.Colors.textPrimary)
                        Spacer()
                        Text("\(Int(settings.textScale * 100))%")
                            .font(.cubbly(13, .bold))
                            .foregroundStyle(Theme.Colors.textSecondary)
                            .monospacedDigit()
                    }
                    Slider(value: $settings.textScale, in: 0.85...1.3, step: 0.05)
                        .tint(Theme.Colors.primary)
                    Text("Cubbly also follows the system Dynamic Type, VoiceOver and Bold Text settings.")
                        .font(.cubbly(12))
                        .foregroundStyle(Theme.Colors.textMuted)
                }
            }
            systemSettingsButton("Open iOS Accessibility")
        }
    }

    private var chatTab: some View {
        VStack(spacing: 14) {
            section("Message display") {
                toggleRow("Show timestamps", "Displays the time next to every message.",
                          isOn: $settings.showTimestamps)
                toggleRow("Compact mode", "Tighter spacing so more messages fit on screen.",
                          isOn: $settings.compactMode)
                toggleRow("Show link previews", "Expands links into a preview card.",
                          isOn: $settings.showLinkPreviews)
                toggleRow("Autoplay GIFs", "Plays GIFs automatically instead of on tap.",
                          isOn: $settings.autoplayGifs)
            }
            section("Behaviour") {
                toggleRow("Send typing indicator", "Lets people see when you're typing.",
                          isOn: $settings.sendTypingIndicator)
                toggleRow("In-app sounds", "Message and notification sounds while the app is open. Call rings always play.",
                          isOn: $settings.inAppSounds)
                toggleRow("Haptics", "Vibration feedback for swipe-to-reply and other gestures.",
                          isOn: $settings.haptics)
            }
        }
    }

    private var contentSocialTab: some View {
        VStack(spacing: 14) {
            section("Who can message you") {
                VStack(spacing: 8) {
                    ForEach(SocialPrivacyStore.WhoCanDM.allCases) { option in
                        Button {
                            Task { await social.setWhoCanDM(option) }
                        } label: {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: social.whoCanDM == option ? "largecircle.fill.circle" : "circle")
                                    .foregroundStyle(social.whoCanDM == option ? Theme.Colors.primary : Theme.Colors.textMuted)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(option.label)
                                        .font(.cubbly(14, .semibold))
                                        .foregroundStyle(Theme.Colors.textPrimary)
                                    Text(option.blurb)
                                        .font(.cubbly(12))
                                        .foregroundStyle(Theme.Colors.textMuted)
                                        .multilineTextAlignment(.leading)
                                }
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            section("Profile") {
                Toggle(isOn: Binding(
                    get: { social.publicWishlist },
                    set: { v in Task { await social.setPublicWishlist(v) } }
                )) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Public wishlist")
                            .font(.cubbly(14, .semibold))
                            .foregroundStyle(Theme.Colors.textPrimary)
                        Text("Let friends see what you want from the Shop so they can gift it.")
                            .font(.cubbly(12))
                            .foregroundStyle(Theme.Colors.textMuted)
                    }
                }
                .tint(Theme.Colors.primary)
            }
            noteText("These settings sync with the web and desktop apps.")
        }
    }

    private var dataPrivacyTab: some View {
        VStack(spacing: 14) {
            section("Visibility") {
                noteText("Your activity status (what you're playing or listening to) is controlled in the Activity Privacy tab. Message privacy lives in Content & Social.")
            }
            section("Your data") {
                infoRow("Account", session.currentProfile?.username.isEmpty == false
                        ? "@\(session.currentProfile!.username)" : "—")
                infoRow("This device", SessionTracker.shared.sessionKey.prefix(8) + "…")
                noteText("Account deletion and full data export run from the web app so we can verify it's really you.")
            }
        }
    }

    private var devicesTab: some View {
        VStack(spacing: 14) {
            section("Signed-in devices") {
                if devicesStore.loading && devicesStore.devices.isEmpty {
                    ProgressView().tint(Theme.Colors.primary)
                        .frame(maxWidth: .infinity, minHeight: 60)
                } else if devicesStore.devices.isEmpty {
                    noteText("No active sessions found.")
                } else {
                    VStack(spacing: 10) {
                        ForEach(devicesStore.devices) { device in
                            deviceRow(device)
                        }
                    }
                }
            }
            noteText("Signing out a device ends its session the next time it checks in.")
        }
    }

    private func deviceRow(_ device: DevicesStore.Device) -> some View {
        let isCurrent = device.session_key == devicesStore.currentSessionKey
        return HStack(spacing: 10) {
            Image(systemName: (device.is_desktop_app ?? false) ? "desktopcomputer"
                  : ((device.is_mobile ?? false) ? "iphone" : "globe"))
                .foregroundStyle(Theme.Colors.textSecondary)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(device.device_label)
                        .font(.cubbly(13, .semibold))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .lineLimit(1)
                    if isCurrent {
                        Text("THIS DEVICE")
                            .font(.cubbly(9, .heavy))
                            .foregroundStyle(Theme.Colors.primary)
                    }
                }
                Text("Last active \(device.last_seen_at.formatted(.relative(presentation: .named)))")
                    .font(.cubbly(11))
                    .foregroundStyle(Theme.Colors.textMuted)
            }
            Spacer()
            if !isCurrent {
                Button("Sign out") {
                    Task { await devicesStore.revoke(device) }
                }
                .font(.cubbly(12, .semibold))
                .foregroundStyle(Theme.Colors.danger)
            }
        }
        .padding(10)
        .background(Theme.Colors.bgTertiary, in: RoundedRectangle(cornerRadius: 10))
    }

    private var gamingModeTab: some View {
        VStack(spacing: 14) {
            section("On this iPhone") {
                noteText("iOS can't see which games you're running, so Cubbly for iOS doesn't broadcast your own game activity. You'll still see what your friends are playing, and any activity you set on desktop keeps showing while you're on your phone.")
            }
            section("Activity privacy") {
                noteText("Use the Activity Privacy tab to control whether your desktop activity is shared at all.")
            }
        }
    }

    private var keybindsTab: some View {
        VStack(spacing: 14) {
            section("Touch controls") {
                bulletRow("Swipe a message right", "Reply")
                bulletRow("Long-press a message", "React, edit, copy or delete")
                bulletRow("Long-press a chat", "Pin, mute or hide it")
                bulletRow("Pull down in a chat list", "Refresh")
            }
            noteText("Push-to-talk and custom keyboard shortcuts are desktop-only.")
        }
    }

    private var languageTab: some View {
        VStack(spacing: 14) {
            section("Time format") {
                toggleRow("24-hour time", "Show message timestamps as 18:30 instead of 6:30 PM.",
                          isOn: $settings.use24HourTime)
            }
            section("Language") {
                infoRow("App language", Locale.current.localizedString(forIdentifier: Locale.current.identifier) ?? Locale.current.identifier)
                infoRow("Time zone", TimeZone.current.identifier)
                noteText("Cubbly follows your iOS language and time zone.")
            }
            systemSettingsButton("Open iOS Settings")
        }
    }

    private var advancedTab: some View {
        VStack(spacing: 14) {
            section("About") {
                infoRow("Version", CubblyConfig.appVersion)
                infoRow("Build", (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "—")
                infoRow("Device", UIDevice.current.systemName + " " + UIDevice.current.systemVersion)
            }
            section("Maintenance") {
                Button {
                    URLCache.shared.removeAllCachedResponses()
                } label: {
                    actionLabel("Clear image & media cache", destructive: false)
                }
                .buttonStyle(.plain)
                Button {
                    showResetConfirm = true
                } label: {
                    actionLabel("Reset local app settings", destructive: true)
                }
                .buttonStyle(.plain)
            }
            noteText("Hardware acceleration and crash-report overrides only apply to the desktop app.")
        }
        .alert("Reset local settings?", isPresented: $showResetConfirm) {
            Button("Reset", role: .destructive) { settings.resetLocalSettings() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This restores the accessibility, chat and time settings on this device. Your account, cosmetics and chats aren't touched.")
        }
    }

    private var updateLogsTab: some View {
        VStack(spacing: 14) {
            section("What's new in v\(CubblyConfig.appVersion)") {
                bulletList([
                    "Voice calls connect reliably again",
                    "Ringtone no longer cuts out after a second, and hang-up plays once",
                    "You now show as online to friends while you're on your phone",
                    "Gems, gem themes and animated name colors added",
                    "Settings tabs filled in with real, working options",
                ])
            }
        }
    }

    // MARK: - Building blocks

    private func section<Content: View>(_ title: String, @ViewBuilder _ inner: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased())
                .font(.cubbly(11, .heavy))
                .foregroundStyle(Theme.Colors.textMuted)
            inner()
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Colors.bgSecondary)
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.Colors.border, lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func toggleRow(_ title: String, _ subtitle: String, isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.cubbly(14, .semibold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(subtitle)
                    .font(.cubbly(12))
                    .foregroundStyle(Theme.Colors.textMuted)
            }
        }
        .tint(Theme.Colors.primary)
    }

    private func infoRow(_ label: String, _ value: some StringProtocol) -> some View {
        HStack {
            Text(label).font(.cubbly(13)).foregroundStyle(Theme.Colors.textSecondary)
            Spacer()
            Text(String(value)).font(.cubbly(13, .semibold)).foregroundStyle(Theme.Colors.textPrimary)
        }
    }

    private func bulletRow(_ gesture: String, _ result: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(gesture).font(.cubbly(13, .semibold)).foregroundStyle(Theme.Colors.textPrimary)
            Spacer()
            Text(result).font(.cubbly(12)).foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.trailing)
        }
    }

    private func bulletList(_ lines: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(lines, id: \.self) { line in
                HStack(alignment: .top, spacing: 8) {
                    Text("•").foregroundStyle(Theme.Colors.primary)
                    Text(line).font(.cubbly(13)).foregroundStyle(Theme.Colors.textSecondary)
                }
            }
        }
    }

    private func noteText(_ text: String) -> some View {
        Text(text)
            .font(.cubbly(12))
            .foregroundStyle(Theme.Colors.textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func actionLabel(_ title: String, destructive: Bool) -> some View {
        HStack {
            Text(title)
                .font(.cubbly(14, .semibold))
                .foregroundStyle(destructive ? Theme.Colors.danger : Theme.Colors.textPrimary)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.Colors.textMuted)
        }
        .padding(.vertical, 6)
    }

    private func systemSettingsButton(_ label: String) -> some View {
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
    }
}
