import SwiftUI

/// Top-level routing: while the session is loading we show the splash; once
/// resolved we either show the auth flow or the main tabbed app.
struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        ZStack {
            Color(red: 150/255, green: 114/255, blue: 94/255).ignoresSafeArea()

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

/// Plain Cubbly-brown background with the transparent bear logo centered.
/// Mirrors the native LaunchScreen.storyboard so launch -> splash is seamless.
private struct SplashView: View {
    var body: some View {
        ZStack {
            Color(red: 150/255, green: 114/255, blue: 94/255).ignoresSafeArea()
            Image("cubbly-nobg")
                .resizable()
                .scaledToFit()
                .frame(width: 180, height: 180)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
