import SwiftUI

/// Horizontal strip of friend tiles shown at the top of the DM sidebar,
/// directly under the search bar — mirrors the Discord iOS layout. Tapping
/// a tile opens the existing DM with that friend if one exists, otherwise
/// falls back to the new-chat sheet.
@MainActor
final class FriendsStripCache: ObservableObject {
    static let shared = FriendsStripCache()
    @Published var friends: [FriendEntry] = []
    @Published var lastLoaded: Date?
    private init() {}
}

struct FriendsStrip: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var presence: PresenceService
    @ObservedObject private var cache = FriendsStripCache.shared
    @ObservedObject private var convCache = ConversationsCache.shared

    /// Called with the conversation to open. If the friend has no existing
    /// DM, `onNoExistingDM` is invoked so the host can show the new-chat sheet.
    var onOpen: (ConversationSummary) -> Void
    var onNoExistingDM: (Profile) -> Void

    var body: some View {
        Group {
            if !sorted.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(sorted, id: \.id) { entry in
                            FriendTile(profile: entry.profile)
                                .onTapGesture { tap(entry.profile) }
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                }
            }
        }
        .task { await load() }
    }

    private var accepted: [FriendEntry] {
        cache.friends.filter { $0.friendship.status == "accepted" }
    }

    private var sorted: [FriendEntry] {
        accepted.sorted { a, b in
            let oa = presence.isOnline(a.profile.userID)
            let ob = presence.isOnline(b.profile.userID)
            if oa != ob { return oa && !ob }
            return a.profile.displayName.localizedCaseInsensitiveCompare(b.profile.displayName) == .orderedAscending
        }
    }

    private func tap(_ profile: Profile) {
        if let conv = convCache.conversations.first(where: { !$0.isGroup && $0.otherUser?.userID == profile.userID }) {
            onOpen(conv)
        } else {
            onNoExistingDM(profile)
        }
    }

    private func load() async {
        guard let me = session.currentUserID else { return }
        // Show cached instantly; refresh silently in the background.
        if let last = cache.lastLoaded, Date().timeIntervalSince(last) < 30 { return }
        if let list = try? await FriendsRepository().listMine(currentUserID: me) {
            cache.friends = list
            cache.lastLoaded = Date()
        }
    }
}

private struct FriendTile: View {
    let profile: Profile
    @EnvironmentObject private var presence: PresenceService

    var body: some View {
        VStack(spacing: 4) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(
                    url: profile.avatarURL.flatMap(URL.init(string:)),
                    fallbackText: profile.displayName,
                    size: 52
                )
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                StatusDot(
                    rawStatus: presence.effectiveStatus(for: profile.userID, storedStatus: profile.status),
                    isOnline: presence.isOnline(profile.userID),
                    size: 14,
                    borderColor: Theme.Colors.bgSecondary
                )
                .offset(x: 2, y: 2)
            }
            .frame(width: 64, height: 64)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Theme.Colors.bgSecondary)
            )

            Text(profile.displayName)
                .font(.cubbly(10, .semibold))
                .foregroundStyle(Theme.Colors.textSecondary)
                .lineLimit(1)
                .frame(width: 68)
        }
        .contentShape(Rectangle())
    }
}
