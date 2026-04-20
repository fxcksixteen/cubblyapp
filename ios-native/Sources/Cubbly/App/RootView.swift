import SwiftUI

/// Top-level routing: while the session is loading we show the splash; once
/// resolved we either show the auth flow or the main tabbed app.
struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        ZStack {
            Theme.Colors.bgTertiary.ignoresSafeArea()

            switch session.state {
            case .loading:
                SplashView()
            case .signedOut:
                LoginView()
                    .transition(.opacity)
            case .signedIn:
                MainTabView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: session.state)
        .task { await session.bootstrap() }
    }
}

private struct SplashView: View {
    var body: some View {
        VStack(spacing: 16) {
            Text("🧸")
                .font(.system(size: 64))
            Text("Cubbly")
                .font(Theme.Fonts.title)
                .foregroundStyle(Theme.Colors.textPrimary)
            ProgressView()
                .tint(Theme.Colors.primary)
                .padding(.top, 8)
        }
    }
}
