import SwiftUI

/// Home tab — Discord-style DM list. Each row shows the OTHER user's avatar
/// with status dot, their display name, the latest message, and a compact
/// relative timestamp.
struct DMListView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var conversations: [ConversationSummary] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var search: String = ""

    /// Set by the parent (MainTabView) when a row is tapped. We push a chat
    /// view from here so the swipe-back gesture works inside the chat.
    @State private var openConversation: ConversationSummary?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header

                searchBar
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)

                content
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.bgPrimary)
            .navigationDestination(item: $openConversation) { conv in
                ChatPlaceholderView(conversation: conv)
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("Messages")
                .font(Theme.Fonts.title)
                .foregroundStyle(Theme.Colors.textPrimary)
            Spacer()
            Button {
                Task { await load() }
            } label: {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
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

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if isLoading {
            ProgressView().tint(Theme.Colors.primary).frame(maxHeight: .infinity)
        } else if let errorMessage {
            VStack(spacing: 8) {
                Text(errorMessage)
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.danger)
                    .multilineTextAlignment(.center)
                Button("Try again") { Task { await load() } }
                    .foregroundStyle(Theme.Colors.primary)
            }
            .padding()
            .frame(maxHeight: .infinity)
        } else if filtered.isEmpty {
            emptyState
        } else {
            List {
                ForEach(filtered) { conv in
                    Button { openConversation = conv } label: { DMRow(conversation: conv) }
                        .listRowBackground(Theme.Colors.bgPrimary)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8))
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
            Text("Add a friend in the Friends tab and start a chat.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
        }
        .frame(maxHeight: .infinity)
    }

    private var filtered: [ConversationSummary] {
        guard !search.isEmpty else { return conversations }
        let q = search.lowercased()
        return conversations.filter {
            $0.displayName.lowercased().contains(q) ||
            ($0.lastMessage?.lowercased().contains(q) ?? false)
        }
    }

    // MARK: - Loading

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        guard let userID = session.currentUserID else { return }
        do {
            conversations = try await ConversationsRepository().listSummaries(currentUserID: userID)
            errorMessage = nil
        } catch {
            errorMessage = "Couldn't load conversations: \(error.localizedDescription)"
        }
    }
}

// MARK: - DM row

private struct DMRow: View {
    let conversation: ConversationSummary

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(
                    url: conversation.avatarURL,
                    fallbackText: conversation.displayName,
                    size: 48
                )
                if let other = conversation.otherUser {
                    StatusDot(
                        rawStatus: other.status,
                        isOnline: true, // TODO: presence
                        size: 12,
                        borderColor: Theme.Colors.bgPrimary
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
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.Colors.textMuted)
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
    }
}

// MARK: - Tiny chat placeholder (full chat lands in v1.1)

private struct ChatPlaceholderView: View {
    let conversation: ConversationSummary
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 16) {
            AvatarView(url: conversation.avatarURL, fallbackText: conversation.displayName, size: 80)
            Text(conversation.displayName)
                .font(Theme.Fonts.title)
                .foregroundStyle(Theme.Colors.textPrimary)
            Text("Chat thread coming in the next update — swipe right to go back.")
                .font(Theme.Fonts.bodySmall)
                .foregroundStyle(Theme.Colors.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            Spacer()
        }
        .padding(.top, 60)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary)
        .navigationBarTitleDisplayMode(.inline)
        .horizontalSwipe(right: { dismiss() })
    }
}
