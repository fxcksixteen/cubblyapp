import SwiftUI

/// Activity Privacy — lets the iOS user toggle whether their currently-running
/// game/app activity (broadcast from the desktop Electron client) is visible
/// to other users. iOS itself cannot scan running processes, so this only
/// controls visibility of the synced row.
struct ActivityPrivacySettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var activity = ActivityService.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("ACTIVITY")
                        .font(.cubbly(11, .bold))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .padding(.horizontal, 4)

                    VStack(spacing: 0) {
                        Toggle(isOn: Binding(
                            get: { activity.shareActivity },
                            set: { v in Task { await activity.setShareActivity(v) } }
                        )) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Share Activity Status")
                                    .font(Theme.Fonts.bodyMedium)
                                    .foregroundStyle(Theme.Colors.textPrimary)
                                Text("Show friends what you're playing or using")
                                    .font(Theme.Fonts.caption)
                                    .foregroundStyle(Theme.Colors.textMuted)
                            }
                        }
                        .tint(Theme.Colors.primary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 14)
                    }
                    .background(Theme.Colors.bgSecondary)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                    Text("iOS does not detect running games on your phone. Activity is broadcast by the Cubbly desktop app. Turn this off to hide your status everywhere.")
                        .font(Theme.Fonts.caption)
                        .foregroundStyle(Theme.Colors.textMuted)
                        .padding(.horizontal, 4)
                }
                .padding(16)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.bgPrimary.ignoresSafeArea())
            .navigationTitle("Activity Privacy")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
