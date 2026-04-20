import SwiftUI

struct YouView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("You")
                    .font(Theme.Fonts.title)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            ScrollView {
                VStack(spacing: 16) {
                    AvatarView(
                        url: session.currentProfile?.avatarURL.flatMap(URL.init(string:)),
                        fallbackText: session.currentProfile?.displayName ?? "?",
                        size: 96
                    )
                    .padding(.top, 24)

                    VStack(spacing: 4) {
                        Text(session.currentProfile?.displayName ?? "—")
                            .font(Theme.Fonts.title)
                            .foregroundStyle(Theme.Colors.textPrimary)
                        if let username = session.currentProfile?.username {
                            Text("@\(username)")
                                .font(Theme.Fonts.bodySmall)
                                .foregroundStyle(Theme.Colors.textSecondary)
                        }
                    }

                    Button(role: .destructive) {
                        Task { await session.signOut() }
                    } label: {
                        Text("Sign out")
                            .font(Theme.Fonts.bodyMedium)
                            .foregroundStyle(Theme.Colors.danger)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Theme.Colors.bgSecondary)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 24)

                    Text("Cubbly v\(CubblyConfig.appVersion)")
                        .font(Theme.Fonts.caption)
                        .foregroundStyle(Theme.Colors.textMuted)
                        .padding(.top, 12)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary)
    }
}
