import SwiftUI

/// Posted when the user taps Voice/Video Call from the Friends tab. ChatView
/// listens and auto-starts the corresponding call once it appears.
extension Notification.Name {
    static let cubblyAutoStartCall = Notification.Name("cubbly.autoStartCall")
}
struct AutoStartCallPayload {
    let conversationID: UUID
    let video: Bool
}

/// Friends tab — mirrors the web app: Online / All / Pending / Blocked / Add.
struct FriendsView: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var presence: PresenceService

    enum Tab: String, CaseIterable, Identifiable {
        case online, all, pending, blocked, add
        var id: String { rawValue }
        var title: String {
            switch self {
            case .online: return "Online"
            case .all: return "All"
            case .pending: return "Pending"
            case .blocked: return "Blocked"
            case .add: return "Add Friend"
            }
        }
    }

    @State private var tab: Tab = .online
    @State private var entries: [FriendEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var search: String = ""
    @State private var addUsername: String = ""
    @State private var addStatus: (ok: Bool, msg: String)?
    @State private var openConversation: ConversationSummary?
    @State private var confirmRemove: FriendEntry?
    @State private var confirmBlock: FriendEntry?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                tabBar

                if tab == .add {
                    addFriendView
                } else {
                    searchBar
                        .padding(.horizontal, 12)
                        .padding(.bottom, 6)
                    listForTab
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.bgPrimary)
            .navigationDestination(item: $openConversation) { conv in
                ChatView(conversation: conv)
                    .environmentObject(session)
                    .environmentObject(presence)
            }
            .task { await load() }
            .refreshable { await load() }
            .alert("Remove Friend?", isPresented: Binding(
                get: { confirmRemove != nil },
                set: { if !$0 { confirmRemove = nil } }
            )) {
                Button("Remove", role: .destructive) {
                    if let e = confirmRemove { Task { await remove(e) } }
                    confirmRemove = nil
                }
                Button("Cancel", role: .cancel) { confirmRemove = nil }
            } message: {
                Text("You can always send another friend request later.")
            }
            .alert("Block User?", isPresented: Binding(
                get: { confirmBlock != nil },
                set: { if !$0 { confirmBlock = nil } }
            )) {
                Button("Block", role: .destructive) {
                    if let e = confirmBlock { Task { await block(e) } }
                    confirmBlock = nil
                }
                Button("Cancel", role: .cancel) { confirmBlock = nil }
            } message: {
                Text("They won't be able to message or call you.")
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            SVGIcon(name: "friends", size: 18, tint: Theme.Colors.textSecondary)
            Text("Friends")
                .font(Theme.Fonts.title)
                .foregroundStyle(Theme.Colors.textPrimary)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Tab.allCases) { t in
                    Button { tab = t } label: {
                        HStack(spacing: 6) {
                            Text(t.title)
                                .font(.system(size: 13, weight: .semibold))
                            if t == .pending {
                                let n = pendingIncomingCount
                                if n > 0 {
                                    Text("\(n)")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 5)
                                        .padding(.vertical, 1)
                                        .background(Capsule().fill(Theme.Colors.danger))
                                }
                            }
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            (tab == t)
                                ? Theme.Colors.bgTertiary
                                : (t == .add ? Theme.Colors.success.opacity(0.85) : Color.clear)
                        )
                        .foregroundStyle(
                            t == .add && tab != t ? .white :
                                (tab == t ? Theme.Colors.textPrimary : Theme.Colors.textSecondary)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            SVGIcon(name: "search", size: 14, tint: Theme.Colors.textMuted)
            TextField(searchPlaceholder, text: $search)
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textPrimary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 12)
        .background(Theme.Colors.bgTertiary)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private var searchPlaceholder: String {
        switch tab {
        case .online: return "Search online friends"
        case .all: return "Search all friends"
        case .pending: return "Search pending requests"
        case .blocked: return "Search blocked users"
        case .add: return ""
        }
    }

    // MARK: - List

    @ViewBuilder
    private var listForTab: some View {
        if isLoading {
            ProgressView().tint(Theme.Colors.primary).frame(maxHeight: .infinity)
        } else if let errorMessage {
            Text(errorMessage)
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.danger)
                .padding()
        } else {
            let list = filtered
            VStack(alignment: .leading, spacing: 4) {
                Text(sectionLabel(for: list.count))
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .padding(.horizontal, 16)
                    .padding(.top, 6)

                if list.isEmpty {
                    VStack(spacing: 8) {
                        SVGIcon(name: emptyIcon, size: 40, tint: Theme.Colors.textMuted)
                        Text(emptyMessage)
                            .font(Theme.Fonts.bodySmall)
                            .foregroundStyle(Theme.Colors.textSecondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .padding(.top, 60)
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(list) { entry in
                                FriendRow(
                                    entry: entry,
                                    tab: tab,
                                    currentUserID: session.currentUserID,
                                    onAccept: { Task { await accept(entry) } },
                                    onDecline: { Task { await remove(entry) } },
                                    onMessage: { Task { await openDM(with: entry, video: nil) } },
                                    onVoiceCall: { Task { await openDM(with: entry, video: false) } },
                                    onVideoCall: { Task { await openDM(with: entry, video: true) } },
                                    onRemove: { confirmRemove = entry },
                                    onBlock: { confirmBlock = entry },
                                    onUnblock: { Task { await remove(entry) } }
                                )
                                Divider().background(Theme.Colors.divider).padding(.leading, 68)
                            }
                        }
                    }
                }
            }
        }
    }

    private var addFriendView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Add Friend")
                    .font(Theme.Fonts.heading)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text("You can add friends with their Cubbly username.")
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.textSecondary)

                HStack {
                    TextField("Enter a username...", text: $addUsername)
                        .font(Theme.Fonts.body)
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(.vertical, 12)
                        .padding(.horizontal, 12)
                        .background(Theme.Colors.bgTertiary)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                    Button {
                        Task { await sendRequest() }
                    } label: {
                        Text("Send")
                            .font(Theme.Fonts.bodyMedium)
                            .foregroundStyle(.white)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(addUsername.isEmpty ? Color.gray.opacity(0.4) : Theme.Colors.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .disabled(addUsername.isEmpty)
                }

                if let s = addStatus {
                    Text(s.msg)
                        .font(Theme.Fonts.bodySmall)
                        .foregroundStyle(s.ok ? Theme.Colors.success : Theme.Colors.danger)
                }
            }
            .padding(16)
        }
    }

    // MARK: - Filtering & data

    private var filtered: [FriendEntry] {
        let scoped: [FriendEntry]
        switch tab {
        case .online: scoped = entries.filter { $0.friendship.status == "accepted" && presence.isOnline($0.profile.userID) }
        case .all:    scoped = entries.filter { $0.friendship.status == "accepted" }
        case .pending: scoped = entries.filter { $0.friendship.status == "pending" }
        case .blocked: scoped = entries.filter { $0.friendship.status == "blocked" }
        case .add: return []
        }
        guard !search.isEmpty else { return scoped }
        let q = search.lowercased()
        return scoped.filter {
            $0.profile.displayName.lowercased().contains(q) ||
            $0.profile.username.lowercased().contains(q)
        }
    }

    private var pendingIncomingCount: Int {
        guard let me = session.currentUserID else { return 0 }
        return entries.filter { $0.friendship.status == "pending" && $0.friendship.addresseeID == me }.count
    }

    private func sectionLabel(for count: Int) -> String {
        switch tab {
        case .online: return "ONLINE — \(count)"
        case .all: return "ALL FRIENDS — \(count)"
        case .pending: return "PENDING — \(count)"
        case .blocked: return "BLOCKED — \(count)"
        case .add: return ""
        }
    }

    private var emptyIcon: String {
        tab == .blocked ? "empty-blocked" : "empty-pending"
    }

    private var emptyMessage: String {
        switch tab {
        case .online:  return "No one's around right now — perfect time for a cozy break."
        case .all:     return "Your friend list is waiting for its first addition."
        case .pending: return "No friend requests right now."
        case .blocked: return "Your block list is squeaky clean."
        case .add:     return ""
        }
    }

    // MARK: - Actions

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let me = session.currentUserID else { return }
        do {
            entries = try await FriendsRepository().listMine(currentUserID: me)
            errorMessage = nil
        } catch is CancellationError {
            errorMessage = nil
        } catch let urlError as URLError where urlError.code == .cancelled {
            errorMessage = nil
        } catch {
            errorMessage = "Couldn't load friends: \(error.localizedDescription)"
        }
    }

    private func sendRequest() async {
        guard let me = session.currentUserID else { return }
        addStatus = nil
        do {
            try await FriendsRepository().sendRequest(toUsername: addUsername, fromUserID: me)
            addStatus = (true, "Friend request sent to \(addUsername)!")
            addUsername = ""
            await load()
        } catch {
            addStatus = (false, error.localizedDescription)
        }
    }

    private func accept(_ entry: FriendEntry) async {
        try? await FriendsRepository().accept(friendshipID: entry.friendship.id)
        await load()
    }
    private func remove(_ entry: FriendEntry) async {
        try? await FriendsRepository().remove(friendshipID: entry.friendship.id)
        await load()
    }
    private func block(_ entry: FriendEntry) async {
        try? await FriendsRepository().block(friendshipID: entry.friendship.id)
        await load()
    }

    /// Opens (or creates) the DM with this friend. If `video` is non-nil, posts
    /// a notification once the chat appears so it can auto-start the call.
    private func openDM(with entry: FriendEntry, video: Bool?) async {
        do {
            let convID = try await ConversationsRepository().openOrCreateDM(with: entry.profile.userID)
            let summary = ConversationSummary(
                id: convID,
                isGroup: false,
                name: nil,
                pictureURL: nil,
                members: [entry.profile],
                lastMessage: nil,
                lastMessageAt: nil,
                updatedAt: Date()
            )
            openConversation = summary
            if let video {
                try? await Task.sleep(nanoseconds: 300_000_000)
                NotificationCenter.default.post(
                    name: .cubblyAutoStartCall,
                    object: AutoStartCallPayload(conversationID: convID, video: video)
                )
            }
        } catch {
            // Surface as an inline message on the friends tab.
            errorMessage = "Couldn't open DM: \(error.localizedDescription)"
        }
    }
}

// MARK: - Friend row

private struct FriendRow: View {
    let entry: FriendEntry
    let tab: FriendsView.Tab
    let currentUserID: UUID?
    let onAccept: () -> Void
    let onDecline: () -> Void
    let onMessage: () -> Void
    let onVoiceCall: () -> Void
    let onVideoCall: () -> Void
    let onRemove: () -> Void
    let onBlock: () -> Void
    let onUnblock: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(
                    url: entry.profile.avatarURL.flatMap(URL.init(string:)),
                    fallbackText: entry.profile.displayName,
                    size: 40
                )
                let live = PresenceService.shared.effectiveStatus(for: entry.profile.userID, storedStatus: entry.profile.status)
                StatusDot(rawStatus: live,
                          isOnline: PresenceService.shared.isOnline(entry.profile.userID),
                          size: 11, borderColor: Theme.Colors.bgPrimary)
                    .offset(x: 2, y: 2)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.profile.displayName)
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }

            Spacer()

            actions
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture {
            // Tapping a row (outside the action buttons) opens the DM, matching
            // the web app's behaviour.
            if tab == .online || tab == .all { onMessage() }
        }
    }

    private var subtitle: String {
        switch tab {
        case .pending:
            let isIncoming = entry.friendship.addresseeID == currentUserID
            return isIncoming ? "Incoming Friend Request" : "Outgoing Friend Request"
        case .blocked:
            return "Blocked"
        default:
            return entry.profile.status.capitalized
        }
    }

    @ViewBuilder
    private var actions: some View {
        switch tab {
        case .pending:
            HStack(spacing: 8) {
                if entry.friendship.addresseeID == currentUserID {
                    iconButton(systemName: "checkmark", color: Theme.Colors.success, action: onAccept)
                }
                iconButton(systemName: "xmark", color: Theme.Colors.danger, action: onDecline)
            }
        case .blocked:
            iconButton(systemName: "arrow.uturn.backward", color: Theme.Colors.textSecondary, action: onUnblock)
        default:
            HStack(spacing: 8) {
                iconButton(systemName: "bubble.left.fill", color: Theme.Colors.textSecondary, action: onMessage)
                Menu {
                    Button {
                        onMessage()
                    } label: {
                        Label("Message", systemImage: "bubble.left.fill")
                    }
                    Button {
                        onVoiceCall()
                    } label: {
                        Label("Voice Call", systemImage: "phone.fill")
                    }
                    Button {
                        onVideoCall()
                    } label: {
                        Label("Video Call", systemImage: "video.fill")
                    }
                    Divider()
                    Button(role: .destructive) {
                        onRemove()
                    } label: {
                        Label("Remove Friend", systemImage: "person.fill.badge.minus")
                    }
                    Button(role: .destructive) {
                        onBlock()
                    } label: {
                        Label("Block", systemImage: "nosign")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Theme.Colors.bgSecondary))
                }
            }
        }
    }

    private func iconButton(systemName: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 32, height: 32)
                .background(Circle().fill(Theme.Colors.bgSecondary))
        }
        .buttonStyle(.plain)
    }
}
