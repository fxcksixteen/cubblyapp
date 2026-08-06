import Foundation

/// Denormalised DM-list row: everything the Home tab needs in one struct.
/// Mirrors `Conversation` from `src/hooks/useConversations.ts` in the web app.
struct ConversationSummary: Identifiable, Hashable {
    let id: UUID
    let isGroup: Bool
    let name: String?
    let pictureURL: String?
    /// Other participants (excludes me). For DMs this has length 1.
    let members: [Profile]
    let lastMessage: String?
    let lastMessageAt: Date?
    let updatedAt: Date

    /// Display name for the row — group name, or other user's display name.
    var displayName: String {
        if isGroup {
            if let n = name, !n.isEmpty { return n }
            return members.prefix(3).map(\.displayName).joined(separator: ", ").ifEmpty("Group")
        }
        return members.first?.displayName ?? "Direct message"
    }

    /// Avatar URL — group picture if set, else the other user's avatar.
    var avatarURL: URL? {
        if isGroup, let s = pictureURL, let u = URL(string: s) { return u }
        if let s = members.first?.avatarURL, let u = URL(string: s) { return u }
        return nil
    }

    /// Other user (DM only).
    var otherUser: Profile? { isGroup ? nil : members.first }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}
