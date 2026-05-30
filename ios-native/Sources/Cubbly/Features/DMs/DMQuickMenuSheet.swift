import SwiftUI

/// Discord-style branded quick-action half-sheet shown when the user
/// long-presses a row in the DM list. Replaces iOS's default contextMenu so
/// the actions feel like Cubbly (rounded grouped cards, soft icons, Nunito
/// typography) instead of the generic system context menu.
struct DMQuickMenuSheet: View {
    let conversation: ConversationSummary
    let isPinned: Bool

    var onOpen: () -> Void
    var onViewProfile: () -> Void
    var onCloseDM: () -> Void
    var onTogglePin: () -> Void
    var onMarkAsRead: () -> Void
    var onMuteToggle: () -> Void
    var onCopyID: () -> Void

    @Environment(\.dismiss) private var dismiss

    private var other: Profile? { conversation.otherUser }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 14) {
                // Header — avatar + @handle, matching Discord's branded sheet.
                HStack(spacing: 12) {
                    ZStack(alignment: .bottomTrailing) {
                        if conversation.isGroup && conversation.pictureURL == nil {
                            GroupAvatar(members: conversation.members, size: 52)
                        } else {
                            AvatarView(url: conversation.avatarURL,
                                       fallbackText: conversation.displayName, size: 52)
                        }
                    }
                    Text(headerTitle)
                        .font(.cubbly(22, .heavy))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .lineLimit(1)
                    Spacer()
                }
                .padding(.horizontal, 4)
                // Extra top padding so the avatar/name is never crowded by the
                // sheet's grab indicator on shorter detents.
                .padding(.top, 22)

            // Profile + Close DM
            groupedCard {
                row(icon: "person.crop.circle", title: "Profile") {
                    dismiss(); onViewProfile()
                }
                if !conversation.isGroup {
                    divider
                    row(icon: "person.crop.circle.badge.minus", title: "Close DM") {
                        dismiss(); onCloseDM()
                    }
                } else {
                    divider
                    row(icon: "bubble.left.and.bubble.right", title: "Open Chat") {
                        dismiss(); onOpen()
                    }
                }
            }

            // Pin / Unpin (Discord groups this in its own card)
            groupedCard {
                row(icon: isPinned ? "pin.slash.fill" : "pin.fill",
                    title: isPinned ? "Unpin" : "Pin") {
                    dismiss(); onTogglePin()
                }
            }

            // Mark As Read + Mute Conversation
            groupedCard {
                row(icon: "eye.fill", title: "Mark As Read") {
                    dismiss(); onMarkAsRead()
                }
                divider
                row(icon: "bell.slash.fill", title: "Mute Conversation") {
                    dismiss(); onMuteToggle()
                }
            }

            // Utility
            groupedCard {
                row(icon: "number.square", title: "Copy Channel ID") {
                    dismiss(); onCopyID()
                }
            }

            Spacer(minLength: 12)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Colors.bgPrimary.ignoresSafeArea())
    }

    private var headerTitle: String {
        if conversation.isGroup { return conversation.displayName }
        if let other, !other.username.isEmpty { return "@\(other.username)" }
        return conversation.displayName
    }

    // MARK: - Building blocks

    @ViewBuilder
    private func groupedCard<C: View>(@ViewBuilder content: () -> C) -> some View {
        VStack(spacing: 0) { content() }
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Theme.Colors.bgSecondary)
            )
    }

    private var divider: some View {
        Rectangle()
            .fill(Theme.Colors.divider)
            .frame(height: 1)
            .padding(.leading, 56)
    }

    private func row(icon: String, title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                ZStack {
                    Circle()
                        .fill(Theme.Colors.bgTertiary)
                        .frame(width: 32, height: 32)
                    Image(systemName: icon)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.Colors.textPrimary)
                }
                Text(title)
                    .font(.cubbly(15, .semibold))
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
