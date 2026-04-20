import SwiftUI

/// Placeholder Friends shell — full Online/All/Pending/Blocked/Add tabs come next.
struct FriendsView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Friends")
                    .font(Theme.Fonts.title)
                    .foregroundStyle(Theme.Colors.textPrimary)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)

            ScrollView {
                VStack(spacing: 12) {
                    Text("Hi \(session.currentProfile?.displayName ?? "friend") 👋")
                        .font(Theme.Fonts.heading)
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text("Friends list lands in the next iteration. Database wiring is live — try Home for DMs.")
                        .font(Theme.Fonts.bodySmall)
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                .padding(.top, 80)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.Colors.bgPrimary)
    }
}
