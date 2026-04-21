import SwiftUI

/// Home tab — Discord-style DM list with a server rail on the left. Uses a
/// shared ConversationsCache so navigating into a chat and back doesn't
/// trigger a flash-of-loading; the cached list shows immediately and a
/// silent background refresh updates last-message previews.
struct DMListView: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var presence: PresenceService
    @ObservedObject private var lastChat = LastChatStore.shared
    @ObservedObject private var cache = ConversationsCache.shared

    @State private var errorMessage: String?
    @State private var search: String = ""
    @State private var openConversation: ConversationSummary?
    @State private var showNewChat = false
    @State private var didInitialLoad = false

    var body: some View {
        NavigationStack {
            HStack(spacing: 0) {
                ServerRail()
                Rectangle().fill(Theme.Colors.divider).frame(width: 1)

                VStack(spacing: 0) {
                    header
                    searchBar
                        .padding(.horizontal, 12)
                        .padding(.bottom, 8)
                    content
                }
                .frame(maxWidth: .infinity)
                .background(Theme.Colors.bgPrimary)
            }
            .background(Theme.Colors.bgPrimary)
            .navigationDestination(item: $openConversation) { conv in
                ChatView(conversation: conv)
                    .environmentObject(session)
                    .environmentObject(presence)
            }
            .onChange(of: openConversation?.id) { _, newID in
                if let id = newID { lastChat.lastConversationID = id }
            }
            .sheet(isPresented: $showNewChat) {
                NewChatSheet { newID in
                    Task {
                        await load(silently: false)
                        if let conv = cache.conversations.first(where: { $0.id == newID }) {
                            openConversation = conv
                        }
                    }
                }
                .environmentObject(session)
            }
            .task {
                if !didInitialLoad {
                    didInitialLoad = true
                    await load(silently: !cache.conversations.isEmpty)
                } else {
                    await load(silently: true)
                }
            }
            .refreshable { await load(silently: false) }
            .horizontalSwipe(left: {
                if let id = lastChat.lastConversationID,
                   let conv = cache.conversations.first(where: { $0.id == id }) {
                    openConversation = conv
                }
            })
        }
    }

    private var header: some View {
        HStack {
            Text("Messages")
                .font(.cubbly(24, .heavy))
                .foregroundStyle(Theme.Colors.textPrimary)
            Spacer()
            Button { showNewChat = true } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .frame(width: 36, height: 36)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private var searchBar: some View {
        HStack(spacing: 8) {
            SVGIcon(name: "search", size: 14, tint: Theme.Colors.textMuted)
            TextField("Search", text: $search)
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

    @ViewBuilder
    private var content: some View {
        if cache.conversations.isEmpty && !didInitialLoad {
            ProgressView().tint(Theme.Colors.primary).frame(maxHeight: .infinity)
        } else if let errorMessage, cache.conversations.isEmpty {
            VStack(spacing: 8) {
                Text(errorMessage)
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.danger)
                    .multilineTextAlignment(.center)
                Button("Try again") { Task { await load(silently: false) } }
                    .foregroundStyle(Theme.Colors.primary)
            }
            .padding()
            .frame(maxHeight: .infinity)
        } else if filtered.isEmpty {
            emptyState
        } else {
            List {
                ForEach(filtered) { conv in
                    Button { openConversation = conv } label: {
                        DMRow(conversation: conv,
                              isHighlighted: conv.id == lastChat.lastConversationID,
                              presence: presence)
                    }
                    .listRowBackground(conv.id == lastChat.lastConversationID
                                       ? Theme.Colors.bgHover : Theme.Colors.bgPrimary)
                    .listRowSeparator(.hidden)
                    .listRowInsets(EdgeInsets(top: 2, leading: 6, bottom: 2, trailing: 6))
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.Colors.bgPrimary)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            SVGIcon(name: "messages", size: 48, tint: Theme.Colors.textMuted)
            Text("No conversations yet")
                .font(Theme.Fonts.heading)
                .foregroundStyle(Theme.Colors.textPrimary)
            Text("Tap the new-chat icon in the top right to start one.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxHeight: .infinity)
    }

    private var filtered: [ConversationSummary] {
        guard !search.isEmpty else { return cache.conversations }
        let q = search.lowercased()
        return cache.conversations.filter {
            $0.displayName.lowercased().contains(q) ||
            ($0.lastMessage?.lowercased().contains(q) ?? false)
        }
    }

    private func load(silently: Bool) async {
        guard let userID = session.currentUserID else { return }
        do {
            let next = try await ConversationsRepository().listSummaries(currentUserID: userID)
            cache.conversations = next
            cache.lastLoaded = Date()
            errorMessage = nil
        } catch is CancellationError {
            errorMessage = nil
        } catch let urlError as URLError where urlError.code == .cancelled {
            errorMessage = nil
        } catch {
            if !silently {
                errorMessage = "Couldn't load conversations: \(error.localizedDescription)"
            }
        }
    }
}

private struct DMRow: View {
    let conversation: ConversationSummary
    let isHighlighted: Bool
    @ObservedObject var presence: PresenceService

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                if conversation.isGroup && conversation.pictureURL == nil {
                    GroupAvatar(members: conversation.members, size: 48)
                } else {
                    AvatarView(
                        url: conversation.avatarURL,
                        fallbackText: conversation.displayName,
                        size: 48
                    )
                }
                if let other = conversation.otherUser {
                    let live = presence.effectiveStatus(for: other.userID, storedStatus: other.status)
                    StatusDot(
                        rawStatus: live,
                        isOnline: presence.isOnline(other.userID),
                        size: 12,
                        borderColor: isHighlighted ? Theme.Colors.bgHover : Theme.Colors.bgPrimary
                    )
                    .offset(x: 2, y: 2)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(conversation.displayName)
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .lineLimit(1)
                Text(conversation.lastMessage ?? "Say hi 👋")
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            if let date = conversation.lastMessageAt {
                Text(RelativeTime.compact(from: date))
                    .font(.cubbly(11, .semibold))
                    .foregroundStyle(Theme.Colors.textMuted)
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 8)
        .background(isHighlighted ? Theme.Colors.bgHover : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
    }
}
