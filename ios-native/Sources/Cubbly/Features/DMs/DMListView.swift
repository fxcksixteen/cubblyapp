import SwiftUI

/// Placeholder DM list — fetches real conversations so you can verify the
/// Supabase wiring works end-to-end on launch.
struct DMListView: View {
    @State private var conversations: [Conversation] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Messages")
                    .font(Theme.Fonts.title)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            if isLoading {
                ProgressView().tint(Theme.Colors.primary).frame(maxHeight: .infinity)
            } else if let errorMessage {
                Text(errorMessage)
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.danger)
                    .padding()
            } else if conversations.isEmpty {
                VStack(spacing: 8) {
                    Text("No conversations yet")
                        .font(Theme.Fonts.heading)
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text("Start one from the web or desktop app — it'll show up here.")
                        .font(Theme.Fonts.bodySmall)
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 40)
                }
                .frame(maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(conversations) { conv in
                            DMRow(conversation: conv)
                            Divider().background(Theme.Colors.divider)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary)
        .task { await load() }
    }

    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            conversations = try await ConversationsRepository().listMine()
        } catch {
            errorMessage = "Couldn't load conversations: \(error.localizedDescription)"
        }
    }
}

private struct DMRow: View {
    let conversation: Conversation

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(
                url: conversation.pictureURL.flatMap(URL.init(string:)),
                fallbackText: conversation.name ?? "DM",
                size: 44
            )
            VStack(alignment: .leading, spacing: 2) {
                Text(conversation.name ?? (conversation.isGroup ? "Group chat" : "Direct message"))
                    .font(Theme.Fonts.bodyMedium)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Text(conversation.updatedAt, style: .relative)
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.textSecondary)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
    }
}
