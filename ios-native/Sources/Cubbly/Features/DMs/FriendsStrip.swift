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
    @Published var loading: Bool = false
    private init() {}
}

struct FriendsStrip: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var presence: PresenceService
    @ObservedObject private var cache = FriendsStripCache.shared
    @ObservedObject private var convCache = ConversationsCache.shared

    var onOpen: (ConversationSummary) -> Void
    var onNoExistingDM: (Profile) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                if sorted.isEmpty && cache.loading {
                    ForEach(0..<6, id: \.self) { _ in ShimmerTile() }
                } else if sorted.isEmpty {
                    AddFriendsTile { onNoExistingDM(.placeholder) }
                } else {
                    ForEach(sorted, id: \.id) { entry in
                        FriendTile(profile: entry.profile)
                            .onTapGesture { tap(entry.profile) }
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
        }
        .frame(height: 92)
        // Lock to horizontal-only — vertical drags inside the strip must not
        // scroll/pull-to-refresh the DM sidebar underneath. The simultaneous
        // gesture eats vertical translation so it never bubbles up to the
        // List below.
        .scrollBounceBehavior(.basedOnSize, axes: .vertical)
        .scrollIndicators(.hidden)
        .simultaneousGesture(
            DragGesture(minimumDistance: 4)
                .onChanged { value in
                    let dx = abs(value.translation.width)
                    let dy = abs(value.translation.height)
                    // Vertical-dominant drag: swallow it so the parent List's
                    // pull gesture (if any) and outer scroll don't see it.
                    if dy > dx { /* swallowed */ }
                }
        )
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
        if let last = cache.lastLoaded, Date().timeIntervalSince(last) < 30 { return }
        cache.loading = true
        do {
            let list = try await FriendsRepository().listMine(currentUserID: me)
            cache.friends = list
            cache.lastLoaded = Date()
        } catch {
            print("[FriendsStrip] load failed:", error)
        }
        cache.loading = false
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

            CubblyNameText(
                userId: profile.userID,
                text: profile.displayName,
                font: .cubbly(10, .semibold),
                fallback: Theme.Colors.textSecondary
            )
            .lineLimit(1)
            .frame(width: 68)
        }
        .contentShape(Rectangle())
    }
}

private struct ShimmerTile: View {
    @State private var phase: CGFloat = 0
    var body: some View {
        VStack(spacing: 4) {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Theme.Colors.bgSecondary)
                .frame(width: 64, height: 64)
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(LinearGradient(
                            colors: [.clear, Theme.Colors.bgTertiary.opacity(0.6), .clear],
                            startPoint: .leading, endPoint: .trailing))
                        .offset(x: phase)
                        .mask(RoundedRectangle(cornerRadius: 16))
                )
            RoundedRectangle(cornerRadius: 4)
                .fill(Theme.Colors.bgSecondary)
                .frame(width: 48, height: 8)
        }
        .onAppear {
            withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) {
                phase = 80
            }
        }
    }
}

private struct AddFriendsTile: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(Theme.Colors.bgSecondary)
                        .frame(width: 64, height: 64)
                    Image(systemName: "person.crop.circle.badge.plus")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundStyle(Theme.Colors.primary)
                }
                Text("Add friends")
                    .font(.cubbly(10, .semibold))
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .lineLimit(1)
                    .frame(width: 68)
            }
        }
        .buttonStyle(.plain)
    }
}

private extension Profile {
    /// Sentinel used only to satisfy the `onNoExistingDM(Profile)` signature
    /// when invoked from the empty-state "Add friends" tile.
    static var placeholder: Profile {
        Profile(
            id: UUID(),
            userID: UUID(),
            username: "",
            displayName: "",
            avatarURL: nil,
            bannerURL: nil,
            bio: nil,
            status: "offline",
            createdAt: Date(),
            updatedAt: Date()
        )
    }
}
