import SwiftUI

/// Sheet shown when CallStore.incoming is set. Discord-style accept/decline.
struct IncomingCallSheet: View {
    @ObservedObject var store: CallStore = .shared

    var body: some View {
        if let inc = store.incoming {
            VStack(spacing: 24) {
                Spacer()
                Text("Incoming call")
                    .font(.cubbly(13, .bold))
                    .textCase(.uppercase)
                    .foregroundStyle(Theme.Colors.textSecondary)

                AvatarView(url: inc.callerAvatarUrl, name: inc.callerName, size: 120)
                    .overlay(Circle().strokeBorder(Theme.Colors.primary, lineWidth: 4))

                Text(inc.callerName)
                    .font(.cubbly(24, .bold))
                    .foregroundStyle(.white)

                Spacer()

                HStack(spacing: 56) {
                    Button {
                        store.declineIncoming()
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: "phone.down.fill")
                                .font(.system(size: 28, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 72, height: 72)
                                .background(Circle().fill(Color(red: 0.93, green: 0.26, blue: 0.27)))
                            Text("Decline").font(.cubbly(12, .semibold)).foregroundStyle(.white.opacity(0.8))
                        }
                    }

                    Button {
                        Task { await store.acceptIncoming() }
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: "phone.fill")
                                .font(.system(size: 28, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 72, height: 72)
                                .background(Circle().fill(Color.green))
                            Text("Accept").font(.cubbly(12, .semibold)).foregroundStyle(.white.opacity(0.8))
                        }
                    }
                }
                .padding(.bottom, 48)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.Colors.bgTertiary.ignoresSafeArea())
        }
    }
}
