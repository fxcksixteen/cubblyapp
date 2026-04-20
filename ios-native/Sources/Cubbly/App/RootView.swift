import SwiftUI
import AVKit
import AVFoundation

/// Top-level routing: while the session is loading we show the splash; once
/// resolved we either show the auth flow or the main tabbed app.
struct RootView: View {
    @EnvironmentObject private var session: SessionStore

    var body: some View {
        ZStack {
            // Sampled from the loading animation so the splash blends seamlessly
            // with the .mov's background (matches web/desktop SPLASH_BG_COLOR).
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

private struct SplashView: View {
    private static let cozyLines = [
        "Brewing something warm just for you...",
        "Fluffing the cushions in your cozy corner...",
        "The bears are getting everything ready...",
        "Stirring the cocoa, lighting the fireplace...",
        "Tucking your friends in safe and sound...",
        "Wrapping your messages in a warm blanket...",
        "Just a moment — the bears are tidying up...",
        "Sprinkling a little extra cozy on everything...",
        "Polishing your hangout space to a soft glow..."
    ]
    @State private var line = SplashView.cozyLines.randomElement() ?? "Loading..."

    var body: some View {
        VStack(spacing: 24) {
            LoopingVideoView(resourceName: "cubbly-loading", ext: "mov")
                .frame(width: 260, height: 260)

            Text(line)
                .font(.custom("Nunito-SemiBold", size: 16))
                .foregroundStyle(Color(red: 1, green: 248/255, blue: 238/255))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .shadow(color: .black.opacity(0.15), radius: 1, x: 0, y: 1)
        }
    }
}

/// Plays a bundled video on a loop, muted, with no controls — used as the
/// splash animation. Mirrors the web/desktop `cubbly-loading.webm`.
private struct LoopingVideoView: UIViewRepresentable {
    let resourceName: String
    let ext: String

    func makeUIView(context: Context) -> LoopingPlayerUIView {
        let view = LoopingPlayerUIView()
        if let url = Bundle.main.url(forResource: resourceName, withExtension: ext) {
            view.configure(with: url)
        }
        return view
    }

    func updateUIView(_ uiView: LoopingPlayerUIView, context: Context) {}
}

final class LoopingPlayerUIView: UIView {
    private var player: AVQueuePlayer?
    private var looper: AVPlayerLooper?
    private let playerLayer = AVPlayerLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = UIColor(red: 150/255, green: 114/255, blue: 94/255, alpha: 1)
        layer.addSublayer(playerLayer)
        playerLayer.videoGravity = .resizeAspect
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        playerLayer.frame = bounds
    }

    func configure(with url: URL) {
        let item = AVPlayerItem(url: url)
        let p = AVQueuePlayer(playerItem: item)
        p.isMuted = true
        looper = AVPlayerLooper(player: p, templateItem: item)
        playerLayer.player = p
        player = p
        p.play()
    }
}
