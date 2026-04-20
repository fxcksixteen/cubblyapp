import SwiftUI
import AVKit

/// Cubbly-branded full-screen video player presented from chat. Wraps
/// `AVPlayerViewController` so users get scrubbing + AirPlay + PiP for free,
/// over a dark Cubbly chrome.
struct InAppVideoPlayer: View {
    let url: URL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VideoPlayerControllerRepresentable(url: url)
                .ignoresSafeArea()
            VStack {
                HStack {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.down")
                            Text("Done")
                        }
                        .font(Theme.Fonts.bodyMedium)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                    }
                    Spacer()
                    Text("Cubbly")
                        .font(Theme.Fonts.caption)
                        .foregroundStyle(.white.opacity(0.7))
                        .padding(.trailing, 12)
                }
                .padding(.top, 50)
                .padding(.horizontal, 16)
                Spacer()
            }
        }
    }
}

private struct VideoPlayerControllerRepresentable: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> AVPlayerViewController {
        let vc = AVPlayerViewController()
        vc.player = AVPlayer(url: url)
        vc.player?.play()
        vc.allowsPictureInPicturePlayback = true
        vc.showsPlaybackControls = true
        return vc
    }

    func updateUIViewController(_ vc: AVPlayerViewController, context: Context) {}
}
