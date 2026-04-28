import SwiftUI

/// Discord-style mini profile sheet shown when tapping a user's avatar in
/// a chat thread. Mirrors the `UserProfileCard` from the desktop/web app:
/// banner, big avatar, display name + @username, bio, status, and a
/// "Send Message" CTA (no-op for now since we're already in their thread).
struct ProfilePopupView: View {
    let userID: UUID
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var presence: PresenceService

    @State private var profile: Profile?
    @State private var loading = true

    var body: some View {
        ZStack {
            Theme.Colors.bgTertiary.ignoresSafeArea()
            if loading {
                ProgressView().tint(Theme.Colors.primary)
            } else if let p = profile {
                profileContent(p)
            } else {
                Text("Couldn't load profile")
                    .font(.cubbly(14)).foregroundStyle(Theme.Colors.textSecondary)
            }
        }
        .task { await load() }
    }

    private func profileContent(_ p: Profile) -> some View {
        VStack(spacing: 0) {
            // Banner
            ZStack(alignment: .bottomLeading) {
                if let banner = p.bannerURL.flatMap(URL.init) {
                    if Self.isAnimated(url: banner) {
                        AnimatedImageView(url: banner, contentMode: .scaleAspectFill)
                            .frame(height: 120)
                            .clipped()
                    } else {
                        AsyncImage(url: banner) { img in
                            img.resizable().scaledToFill()
                        } placeholder: {
                            Rectangle().fill(Theme.Colors.bgSecondary)
                        }
                        .frame(height: 120)
                        .clipped()
                    }
                } else {
                    Rectangle()
                        .fill(AvatarView.color(for: p.username))
                        .frame(height: 120)
                }
                profileAvatar(p)
                    .overlay(Circle().stroke(Theme.Colors.bgTertiary, lineWidth: 6))
                    .offset(x: 16, y: 44)
            }

            VStack(alignment: .leading, spacing: 12) {
                Spacer().frame(height: 44)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(p.displayName)
                        .font(.cubbly(20, .bold))
                        .foregroundStyle(.white)
                    let live = presence.effectiveStatus(for: p.userID, storedStatus: p.status)
                    StatusDot(rawStatus: live, isOnline: presence.isOnline(p.userID),
                              size: 10, borderColor: Theme.Colors.bgTertiary)
                    Spacer()
                }
                Text("@\(p.username)")
                    .font(.cubbly(13))
                    .foregroundStyle(Theme.Colors.textSecondary)

                if let bio = p.bio, !bio.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("ABOUT ME")
                            .font(.cubbly(10, .bold))
                            .foregroundStyle(Theme.Colors.textMuted)
                        Text(bio)
                            .font(.cubbly(13))
                            .foregroundStyle(Theme.Colors.textPrimary)
                    }
                    .padding(.top, 6)
                }

                Spacer()

                Button { dismiss() } label: {
                    Text("Close")
                        .font(.cubbly(14, .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(RoundedRectangle(cornerRadius: 12).fill(Theme.Colors.primary))
                }
                .padding(.bottom, 8)
            }
            .padding(.horizontal, 16)
        }
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            profile = try await ProfilesRepository().fetchProfile(userID: userID)
        } catch {
            print("[ProfilePopup] failed:", error)
        }
    }
}
