import SwiftUI
import WebRTC

/// SwiftUI wrapper around `RTCMTLVideoView` (Metal renderer for WebRTC video
/// tracks). Used to display an incoming peer screenshare full-screen.
struct WebRTCVideoView: UIViewRepresentable {
    let track: RTCVideoTrack?

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.videoContentMode = .scaleAspectFit
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        if let track = track {
            track.add(uiView)
        }
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: ()) {
        // RTCVideoTrack auto-cleans on PC close.
    }
}
