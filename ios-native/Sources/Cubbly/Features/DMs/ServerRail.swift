import SwiftUI

/// Far-left vertical rail (Discord-style). Cubbly home pill + unread DM
/// avatars with red message-count bubbles, mirroring the web server sidebar.
struct ServerRail: View {
    @ObservedObject private var unread = UnreadCountsStore.shared
    @ObservedObject private var theme = ThemeStore.shared
    @State private var showComingSoon = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 10) {
                if let wm = UIImage(named: "cubbly-wordmark") {
                    Image(uiImage: wm)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 56, height: 22)
                        .padding(.bottom, 2)
                }

                // Home pill
                ZStack {
                    if let img = UIImage(named: "cubbly-logo") {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 48, height: 48)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .shadow(color: .black.opacity(0.25), radius: 6, x: 0, y: 4)
                    } else {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(LinearGradient(
                                colors: [Theme.Colors.primary, Theme.Colors.primaryGlow],
                                startPoint: .topLeading, endPoint: .bottomTrailing))
                            .frame(width: 48, height: 48)
                            .overlay(Text("🧸").font(.system(size: 22)))
                    }
                }

                if !unreadAvatars.isEmpty {
                    Rectangle().fill(Theme.Colors.divider).frame(width: 24, height: 1)
                    ForEach(unreadAvatars, id: \.conversationID) { info in
                        UnreadAvatarBubble(info: info)
                    }
                }

                Rectangle().fill(Theme.Colors.divider).frame(width: 24, height: 1)
                Button {
                    showComingSoon = true
                } label: {
                    ZStack {
                        Circle().fill(Theme.Colors.bgSecondary).frame(width: 44, height: 44)
                        Image(systemName: "plus")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(Theme.Colors.success)
                    }
                }
                .buttonStyle(.plain)

                Spacer(minLength: 16)
            }
            .padding(.top, 14)
        }
        .frame(width: 64)
        .background(
            // When a Shop theme is equipped, let the animated theme
            // background show through the rail so we don't get a flat
            // Cubbly-colored bar on top of (e.g.) Space / Sky Dusk.
            Group {
                if theme.equippedShopThemeId != nil {
                    Theme.Colors.bgTertiary.opacity(0.45)
                } else {
                    Theme.Colors.bgTertiary
                }
            }
            .ignoresSafeArea(edges: .vertical)
        )
        .sheet(isPresented: $showComingSoon) {
            ServerComingSoonSheet()
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }

    struct UnreadAvatarItem {
        let conversationID: UUID
        let info: UnreadCountsStore.Info
    }

    private var unreadAvatars: [UnreadAvatarItem] {
        unread.byConversation
            .map { UnreadAvatarItem(conversationID: $0.key, info: $0.value) }
            .sorted { $0.info.count > $1.info.count }
            .prefix(6)
            .map { $0 }
    }
}

private struct UnreadAvatarBubble: View {
    let info: ServerRail.UnreadAvatarItem
    var body: some View {
        ZStack(alignment: .topTrailing) {
            AvatarView(url: avatarURL, fallbackText: fallbackText, size: 44)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            ZStack {
                Capsule().fill(Theme.Colors.danger)
                Text(info.info.count > 99 ? "99+" : "\(info.info.count)")
                    .font(.cubbly(10, .heavy))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 4)
            }
            .frame(minWidth: 18, idealWidth: 18, maxHeight: 18)
            .overlay(Capsule().stroke(Theme.Colors.bgTertiary, lineWidth: 2))
            .offset(x: 4, y: -4)
        }
        .frame(width: 48, height: 48)
    }

    private var avatarURL: URL? {
        if info.info.isGroup, let p = info.info.groupPicture, let u = URL(string: p) { return u }
        if let a = info.info.lastSenderAvatar, let u = URL(string: a) { return u }
        return nil
    }
    private var fallbackText: String {
        if info.info.isGroup, let n = info.info.groupName, !n.isEmpty { return n }
        return info.info.lastSenderName ?? "?"
    }
}
