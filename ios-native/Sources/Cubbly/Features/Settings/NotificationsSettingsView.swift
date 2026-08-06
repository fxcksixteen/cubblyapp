import SwiftUI
import UserNotifications

/// Settings sheet for notifications. Mirrors the desktop `NotificationsSettings`
/// panel: master toggle, message-sound toggle, and message-preview toggle.
struct NotificationsSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var prefs = NotificationPreferences.shared
    @ObservedObject private var notif = NotificationService.shared
    @State private var systemAuthorized: Bool = false
    @State private var systemDenied: Bool = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    permissionCard
                    togglesCard
                }
                .padding(16)
            }
            .background(Theme.Colors.bgPrimary)
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundStyle(Theme.Colors.primary)
                }
            }
            .task { await refreshSystemStatus() }
        }
    }

    // MARK: - Permission

    @ViewBuilder
    private var permissionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: systemAuthorized ? "bell.badge.fill" : "bell.slash.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(systemAuthorized ? Theme.Colors.primary : Theme.Colors.textMuted)
                Text(systemAuthorized ? "Notifications enabled" : "Notifications off")
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
            }

            Text(systemAuthorized
                 ? "Cubbly can show banners and play sounds when you receive messages."
                 : (systemDenied
                    ? "You denied notifications earlier. Open the iOS Settings app to re-enable them for Cubbly."
                    : "Allow notifications so you don't miss messages from your friends."))
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .fixedSize(horizontal: false, vertical: true)

            if !systemAuthorized {
                Button {
                    if systemDenied {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    } else {
                        Task {
                            _ = await notif.requestPermission()
                            await refreshSystemStatus()
                        }
                    }
                } label: {
                    Text(systemDenied ? "Open iOS Settings" : "Allow Notifications")
                        .font(Theme.Fonts.bodyMedium)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Theme.Colors.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .background(Theme.Colors.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.Colors.border, lineWidth: 1)
        )
    }

    // MARK: - Toggles

    @ViewBuilder
    private var togglesCard: some View {
        VStack(spacing: 0) {
            toggleRow(
                title: "Show banners",
                subtitle: "Display a notification when you get a new message.",
                isOn: Binding(get: { prefs.bannersEnabled }, set: { prefs.bannersEnabled = $0 })
            )
            divider
            toggleRow(
                title: "Message sound",
                subtitle: "Play a sound when you receive a message.",
                isOn: Binding(get: { prefs.messageSoundEnabled }, set: { prefs.messageSoundEnabled = $0 })
            )
            divider
            toggleRow(
                title: "Show message preview",
                subtitle: "Include the message text in the banner. Turn off for privacy.",
                isOn: Binding(get: { prefs.showMessagePreview }, set: { prefs.showMessagePreview = $0 })
            )
        }
        .background(Theme.Colors.bgSecondary)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Theme.Colors.border, lineWidth: 1)
        )
    }

    private var divider: some View {
        Rectangle().fill(Theme.Colors.border).frame(height: 1).padding(.leading, 14)
    }

    private func toggleRow(title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(subtitle)
                    .font(Theme.Fonts.caption)
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Theme.Colors.primary)
        }
        .padding(14)
    }

    private func refreshSystemStatus() async {
        let s = await UNUserNotificationCenter.current().notificationSettings()
        systemAuthorized = (s.authorizationStatus == .authorized || s.authorizationStatus == .provisional)
        systemDenied = (s.authorizationStatus == .denied)
        await notif.refreshPermission()
    }
}
