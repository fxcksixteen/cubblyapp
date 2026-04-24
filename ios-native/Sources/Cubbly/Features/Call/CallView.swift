import SwiftUI

/// Full-screen call overlay shown when CallStore is active. v0.1.0 layout:
///   - Big avatar / peer name / call status / elapsed timer
///   - Tap-to-fullscreen incoming screenshare (when present)
///   - Bottom action row: Mute / Deafen / Video (disabled) / Share (disabled) / End
struct CallView: View {
    @ObservedObject var store: CallStore = .shared
    @State private var elapsed: TimeInterval = 0
    @State private var elapsedTimer: Timer?
    @State private var showFullScreenShare = false

    var body: some View {
        ZStack {
            Theme.Colors.bgTertiary.ignoresSafeArea()

            VStack(spacing: 0) {
                topBar

                if let track = store.remoteScreenTrack, store.peerIsScreenSharing {
                    screenSharePreview(track: track)
                }

                Spacer(minLength: 12)

                participantStack

                Spacer()

                controls
                    .padding(.bottom, 24)
            }
        }
        .fullScreenCover(isPresented: $showFullScreenShare) {
            FullScreenScreenShareView(track: store.remoteScreenTrack)
        }
        .onAppear { startTimer() }
        .onDisappear { stopTimer() }
        .onChange(of: store.startedAt) { _ in startTimer() }
    }

    // MARK: - Sections

    private var topBar: some View {
        HStack {
            Text(store.state == .connected ? "Voice Connected" : (store.state == .calling ? "Calling…" : "Connecting…"))
                .font(.cubbly(11, .bold))
                .foregroundStyle(store.state == .connected ? Color.green : Color.orange)
                .textCase(.uppercase)
            Spacer()
            if store.state == .connected {
                Text(formatElapsed(elapsed))
                    .font(.cubbly(13, .semibold))
                    .foregroundStyle(Theme.Colors.textSecondary)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private func screenSharePreview(track: WebRTC.RTCVideoTrack) -> some View {
        Button { showFullScreenShare = true } label: {
            ZStack(alignment: .topTrailing) {
                WebRTCVideoView(track: track)
                    .aspectRatio(16/9, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                HStack(spacing: 4) {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                    Text("Tap to expand")
                }
                .font(.cubbly(10, .semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(.black.opacity(0.5), in: Capsule())
                .padding(8)
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)
        }
        .buttonStyle(.plain)
    }

    private var participantStack: some View {
        VStack(spacing: 18) {
            AvatarView(url: store.peerAvatarUrl, name: store.peerName, size: 120)
                .overlay(
                    Circle()
                        .strokeBorder(store.peerIsMuted ? Color.red : Color.green.opacity(0.6), lineWidth: 4)
                )
            Text(store.peerName)
                .font(.cubbly(22, .bold))
                .foregroundStyle(.white)
            HStack(spacing: 8) {
                if store.peerIsMuted {
                    Label("Muted", systemImage: "mic.slash.fill").font(.cubbly(11, .semibold))
                        .foregroundStyle(.red)
                }
                if store.peerIsScreenSharing {
                    Label("Sharing screen", systemImage: "rectangle.on.rectangle").font(.cubbly(11, .semibold))
                        .foregroundStyle(.green)
                }
            }
        }
    }

    private var controls: some View {
        HStack(spacing: 14) {
            roundButton(icon: store.isMuted ? "mic.slash.fill" : "mic.fill",
                        active: store.isMuted, color: .red) { store.toggleMute() }

            roundButton(icon: store.isDeafened ? "ear.trianglebadge.exclamationmark" : "ear",
                        active: store.isDeafened, color: .red) { store.toggleDeafen() }

            roundButton(icon: "video.slash.fill", active: false, color: .gray, disabled: true) {}
            roundButton(icon: "rectangle.on.rectangle.slash", active: false, color: .gray, disabled: true) {}

            roundButton(icon: "phone.down.fill", active: true, color: Color(red: 0.93, green: 0.26, blue: 0.27)) {
                Task { await store.endCall() }
            }
        }
        .padding(.horizontal, 16)
    }

    private func roundButton(icon: String, active: Bool, color: Color, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(disabled ? Color.gray.opacity(0.5) : .white)
                .frame(width: 56, height: 56)
                .background(
                    Circle().fill(active ? color : Color.white.opacity(0.08))
                )
        }
        .disabled(disabled)
    }

    // MARK: - Timer

    private func startTimer() {
        stopTimer()
        guard let started = store.startedAt else { return }
        elapsed = Date().timeIntervalSince(started)
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                elapsed = Date().timeIntervalSince(started)
            }
        }
    }

    private func stopTimer() {
        elapsedTimer?.invalidate(); elapsedTimer = nil
    }

    private func formatElapsed(_ t: TimeInterval) -> String {
        let s = Int(t)
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}

/// Pure full-screen viewer for an incoming screenshare (tap-to-dismiss).
struct FullScreenScreenShareView: View {
    let track: WebRTC.RTCVideoTrack?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let track = track {
                WebRTCVideoView(track: track).ignoresSafeArea()
            }
            VStack {
                HStack {
                    Button { dismiss() } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.down")
                            Text("Done").font(.cubbly(14, .semibold))
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12).padding(.vertical, 8)
                        .background(.ultraThinMaterial, in: Capsule())
                    }
                    Spacer()
                }
                .padding(.horizontal, 16).padding(.top, 50)
                Spacer()
            }
        }
    }
}
