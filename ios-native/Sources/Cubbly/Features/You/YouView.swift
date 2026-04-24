import SwiftUI

/// "You" tab — banner (with animated GIF support), avatar with status dot,
/// status picker, settings rows, sign out.
struct YouView: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var presence: PresenceService
    @State private var showingSignOutConfirm = false
    @State private var showingNotificationSettings = false

    /// Read directly from the session profile so we never get stuck on a
    /// stale snapshot when the view re-appears. Falls back to "online" until
    /// the profile loads.
    private var status: String {
        session.currentProfile?.status ?? "online"
    }

    private let statusOptions: [(id: String, label: String)] = [
        ("online", "Online"),
        ("idle", "Idle"),
        ("dnd", "Do Not Disturb"),
        ("invisible", "Invisible"),
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                bannerAndAvatar
                statusPicker
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                settingsList
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                signOutButton
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                Text("Cubbly iOS v\(CubblyConfig.appVersion)")
                    .font(Theme.Fonts.caption)
                    .foregroundStyle(Theme.Colors.textMuted)
                    .padding(.top, 24)
                    .padding(.bottom, 80)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
        .task { await session.reloadProfile() }
        .sheet(isPresented: $showingNotificationSettings) {
            NotificationsSettingsView()
        }
    }

    private var bannerAndAvatar: some View {
        let displayName = session.currentProfile?.displayName ?? "You"
        let username = session.currentProfile?.username ?? "user"
        let bannerColor = AvatarView.color(for: displayName)
        let bannerURL = session.currentProfile?.bannerURL.flatMap(URL.init(string:))
        // For the user's own avatar we always want to show the literal status
        // they picked — including "invisible". `effectiveStatus` masks
        // invisible → online (that's the right thing for other people's
        // views), so on this screen we bypass it and use the raw value.

        return VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                ZStack {
                    Rectangle().fill(bannerColor)
                    if let bannerURL {
                        AnimatedImageView(url: bannerURL, contentMode: .scaleAspectFill)
                            .allowsHitTesting(false)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 132)
                .clipped()

                ZStack(alignment: .bottomTrailing) {
                    AvatarView(
                        url: session.currentProfile?.avatarURL.flatMap(URL.init(string:)),
                        fallbackText: displayName,
                        size: 96
                    )
                    .overlay(Circle().stroke(Theme.Colors.bgPrimary, lineWidth: 6))

                    StatusDot(ownStatus: status, size: 18, borderColor: Theme.Colors.bgPrimary)
                        .offset(x: 2, y: 2)
                }
                .offset(x: 16, y: 48)
            }
            .frame(height: 132)
            .padding(.bottom, 60)

            VStack(alignment: .leading, spacing: 2) {
                Text(displayName)
                    .font(Theme.Fonts.title)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text("@\(username)")
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
            .padding(.horizontal, 16)
        }
    }

    private var statusPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("STATUS")
                .font(.cubbly(11, .bold))
                .foregroundStyle(Theme.Colors.textSecondary)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                ForEach(statusOptions, id: \.id) { opt in
                    Button { Task { await updateStatus(opt.id) } } label: {
                        HStack(spacing: 8) {
                            // Preview dots show exactly what each option
                            // looks like — use `ownStatus` so "invisible"
                            // keeps its grey icon here too.
                            StatusDot(ownStatus: opt.id, size: 10,
                                      borderColor: status == opt.id ? Theme.Colors.bgTertiary : Theme.Colors.bgSecondary)
                            Text(opt.label)
                                .font(Theme.Fonts.bodySmall)
                                .foregroundStyle(Theme.Colors.textPrimary)
                            Spacer()
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .background(status == opt.id ? Theme.Colors.bgTertiary : Theme.Colors.bgSecondary)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .stroke(status == opt.id ? Theme.Colors.primary : Theme.Colors.border, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var settingsList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SETTINGS")
                .font(.cubbly(11, .bold))
                .foregroundStyle(Theme.Colors.textSecondary)

            VStack(spacing: 0) {
                row(icon: "bell.fill", label: "Notifications") {
                    showingNotificationSettings = true
                }
                divider
                row(icon: "headphones", label: "Voice & Video")
                divider
                row(icon: "gamecontroller.fill", label: "Activity Privacy")
                divider
                row(icon: "paintpalette.fill", label: "Appearance")
                divider
                row(icon: "shield.fill", label: "Account")
                divider
                row(icon: "gearshape.fill", label: "All Settings")
            }
            .background(Theme.Colors.bgSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private var divider: some View {
        Rectangle().fill(Theme.Colors.border).frame(height: 1).padding(.leading, 50)
    }

    private func row(icon: String, label: String, action: (() -> Void)? = nil) -> some View {
        Button { action?() } label: {
            HStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .frame(width: 22)
                Text(label)
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textMuted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var signOutButton: some View {
        Button { showingSignOutConfirm = true } label: {
            HStack(spacing: 8) {
                Image(systemName: "rectangle.portrait.and.arrow.right")
                    .font(.system(size: 16, weight: .semibold))
                Text("Sign Out")
                    .font(Theme.Fonts.bodyMedium)
            }
            .foregroundStyle(Theme.Colors.danger)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.Colors.bgSecondary)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Theme.Colors.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .confirmationDialog("Sign out of Cubbly?", isPresented: $showingSignOutConfirm, titleVisibility: .visible) {
            Button("Sign Out", role: .destructive) { Task { await session.signOut() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    private func updateStatus(_ next: String) async {
        guard let userID = session.currentUserID else { return }
        // Optimistically update the shared session profile so this view —
        // and every other view that reads `currentProfile?.status` — reflects
        // the change instantly. Re-entering the You tab no longer snaps back.
        session.setLocalStatus(next)
        do {
            try await SupabaseManager.shared.client
                .from("profiles")
                .update(["status": next])
                .eq("user_id", value: userID)
                .execute()
            // Re-fetch to pick up server-side `updated_at` and stay in sync.
            await session.reloadProfile()
        } catch {
            print("[YouView] failed to update status:", error)
            // Roll back on failure by reloading the truth from the server.
            await session.reloadProfile()
        }
    }
}
