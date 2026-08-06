import SwiftUI

/// Cubbly-branded modal shown when the user taps the `+` in the server rail
/// on iOS. Servers ship on web/desktop today but iOS support is still being
/// built — this replaces the broken old "Create Server" entry point.
struct ServerComingSoonSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Theme.Colors.bgTertiary.ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer(minLength: 8)
                ZStack {
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .fill(LinearGradient(
                            colors: [Theme.Colors.primary, Theme.Colors.primaryGlow],
                            startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 96, height: 96)
                        .shadow(color: .black.opacity(0.3), radius: 12, y: 6)
                    if let img = UIImage(named: "cubbly-logo") {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 96, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    } else {
                        Text("🧸").font(.system(size: 44))
                    }
                }
                .padding(.top, 8)

                VStack(spacing: 6) {
                    Text("Servers are coming to iOS")
                        .font(.cubbly(20, .heavy))
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .multilineTextAlignment(.center)
                    Text("Joining and creating Cubbly servers isn't supported on the iOS app just yet. We're cooking it up — for now hop on web or desktop to spin one up.")
                        .font(.cubbly(13))
                        .foregroundStyle(Theme.Colors.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                }

                Spacer()

                Button(action: { dismiss() }) {
                    Text("Got it")
                        .font(.cubbly(15, .heavy))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .background(Theme.Colors.primary,
                                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.bottom, 18)
            }
        }
    }
}
