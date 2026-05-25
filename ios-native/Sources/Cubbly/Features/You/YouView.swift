import SwiftUI
import PhotosUI

/// "You" tab — banner (with animated GIF support), avatar with status dot,
/// status picker, settings rows, sign out.
struct YouView: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var presence: PresenceService
    @State private var showingSignOutConfirm = false
    @State private var showingNotificationSettings = false
    @State private var showingVoiceVideoSettings = false
    @State private var showingActivityPrivacy = false
    @State private var showingAppearance = false
    @State private var showingAccount = false
    @State private var moreTab: MoreSettingsTabView.Mode?
    @State private var avatarPick: PhotosPickerItem?
    @State private var bannerPick: PhotosPickerItem?
    @State private var uploadingAvatar = false
    @State private var uploadingBanner = false

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
        .sheet(isPresented: $showingVoiceVideoSettings) {
            VoiceVideoSettingsView()
        }
        .sheet(isPresented: $showingActivityPrivacy) {
            ActivityPrivacySettingsView()
        }
        .sheet(isPresented: $showingAppearance) {
            AppearanceSettingsView()
        }
        .sheet(isPresented: $showingAccount) {
            AccountSettingsView()
        }
        .sheet(item: $moreTab) { tab in
            MoreSettingsTabView(mode: tab)
        }
        .onChange(of: avatarPick) { _, newValue in
            guard let item = newValue, let uid = session.currentUserID else { return }
            uploadingAvatar = true
            Task {
                _ = await ProfilePhotoUploader.upload(item: item, kind: .avatar, userID: uid)
                await session.reloadProfile()
                await MainActor.run { avatarPick = nil; uploadingAvatar = false }
            }
        }
        .onChange(of: bannerPick) { _, newValue in
            guard let item = newValue, let uid = session.currentUserID else { return }
            uploadingBanner = true
            Task {
                _ = await ProfilePhotoUploader.upload(item: item, kind: .banner, userID: uid)
                await session.reloadProfile()
                await MainActor.run { bannerPick = nil; uploadingBanner = false }
            }
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
                PhotosPicker(selection: $bannerPick, matching: .images, photoLibrary: .shared()) {
                    ZStack {
                        Rectangle().fill(bannerColor)
                        if let bannerURL {
                            AnimatedImageView(url: bannerURL, contentMode: .scaleAspectFill)
                                .allowsHitTesting(false)
                        }
                        // Camera affordance in the corner so users discover
                        // the tap-to-change behaviour (web/desktop has its
                        // own upload control inside My Account).
                        VStack { Spacer(); HStack { Spacer()
                            Image(systemName: uploadingBanner ? "arrow.up.circle.fill" : "camera.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(.white)
                                .padding(8)
                                .background(.black.opacity(0.45), in: Circle())
                                .padding(10)
                        } }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 132)
                    .clipped()
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                ZStack(alignment: .bottomTrailing) {
                    PhotosPicker(selection: $avatarPick, matching: .images, photoLibrary: .shared()) {
                        ZStack {
                            AvatarView(
                                url: session.currentProfile?.avatarURL.flatMap(URL.init(string:)),
                                fallbackText: displayName,
                                size: 96
                            )
                            .overlay(Circle().stroke(Theme.Colors.bgPrimary, lineWidth: 6))
                            if uploadingAvatar {
                                Circle().fill(.black.opacity(0.35))
                                ProgressView().tint(.white)
                            }
                        }
                        .contentShape(Circle())
                    }
                    .buttonStyle(.plain)

                    StatusDot(ownStatus: status, size: 18, borderColor: Theme.Colors.bgPrimary)
                        .offset(x: 2, y: 2)
                        .allowsHitTesting(false)
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
                row(icon: "headphones", label: "Voice & Video") {
                    showingVoiceVideoSettings = true
                }
                divider
                row(icon: "gamecontroller.fill", label: "Activity Privacy") {
                    showingActivityPrivacy = true
                }
                divider
                row(icon: "paintbrush.pointed.fill", label: "Appearance") {
                    showingAppearance = true
                }
                divider
                ForEach(MoreSettingsTabView.Mode.allCases) { tab in
                    row(icon: tab.icon, label: tab.title) {
                        moreTab = tab
                    }
                    divider
                }
                row(icon: "shield.fill", label: "Account") {
                    showingAccount = true
                }
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
