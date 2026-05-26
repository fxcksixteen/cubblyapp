import SwiftUI
import AVKit
import AVFoundation

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

/// In-app splash — plays the looping cubbly-loading.mov bear animation on a
/// Cubbly-brown background. The native iOS launch image (LaunchScreen.storyboard)
/// shows the static cubbly logo on the same brown so the transition is seamless.
private struct SplashView: View {
    var body: some View {
        ZStack {
            Color(red: 150/255, green: 114/255, blue: 94/255).ignoresSafeArea()
            LoopingVideoView()
                .frame(width: 260, height: 260)
                .allowsHitTesting(false)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct LoopingVideoView: UIViewRepresentable {
    func makeUIView(context: Context) -> PlayerContainerView {
        let v = PlayerContainerView()
        v.backgroundColor = UIColor(red: 150/255, green: 114/255, blue: 94/255, alpha: 1)
        if let url = Bundle.main.url(forResource: "cubbly-loading", withExtension: "mov")
            ?? Bundle.main.url(forResource: "Videos/cubbly-loading", withExtension: "mov") {
            v.configure(url: url)
        }
        return v
    }
    func updateUIView(_ uiView: PlayerContainerView, context: Context) {}
}

final class PlayerContainerView: UIView {
    private var player: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private var playerLayer: AVPlayerLayer?

    override class var layerClass: AnyClass { CALayer.self }

    func configure(url: URL) {
        let item = AVPlayerItem(url: url)
        let p = AVQueuePlayer(playerItem: item)
        p.isMuted = true
        let loop = AVPlayerLooper(player: p, templateItem: item)
        let layer = AVPlayerLayer(player: p)
        layer.videoGravity = .resizeAspect
        layer.frame = bounds
        self.layer.addSublayer(layer)
        self.player = p
        self.looper = loop
        self.playerLayer = layer
        p.play()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        playerLayer?.frame = bounds
    }
}
