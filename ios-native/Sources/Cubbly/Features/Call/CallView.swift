import SwiftUI
import WebRTC

/// Full-screen call overlay shown when CallStore is active. v0.1.0 layout:
///   - Big avatar / peer name / call status / elapsed timer
///   - Down arrow (top-right) + swipe-down to minimize the screen so the
///     user can keep browsing the app while the call continues
///   - Tap-to-fullscreen incoming screenshare (when present)
///   - Bottom action row uses our custom Cubbly SVG icons (mic / headphone /
///     screenshare / video / call-end), matching the desktop & web apps.
struct CallView: View {
    @ObservedObject var store: CallStore = .shared
    @State private var elapsed: TimeInterval = 0
    @State private var elapsedTimer: Timer?
    @State private var showFullScreenShare = false
    @State private var dragOffsetY: CGFloat = 0

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
        .offset(y: max(0, dragOffsetY))
        .gesture(
            DragGesture()
                .onChanged { v in
                    // Only allow downward drags
                    dragOffsetY = max(0, v.translation.height)
                }
                .onEnded { v in
                    if v.translation.height > 120 {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            store.minimize()
                            dragOffsetY = 0
                        }
                    } else {
                        withAnimation(.spring(response: 0.3)) { dragOffsetY = 0 }
                    }
                }
        )
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
                    .padding(.trailing, 8)
            }
            // Down-arrow → minimize. Mirrors the swipe-down gesture above.
            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    store.minimize()
                }
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.08)))
            }
            .accessibilityLabel("Minimize call")
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private func screenSharePreview(track: RTCVideoTrack) -> some View {
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
            AvatarView(url: store.peerAvatarUrl.flatMap(URL.init), fallbackText: store.peerName, size: 120)
                .overlay(
                    Circle()
                        .strokeBorder(store.peerIsMuted ? Color.red : Color.green.opacity(0.6), lineWidth: 4)
                )
            Text(store.peerName)
                .font(.cubbly(22, .bold))
                .foregroundStyle(.white)
            HStack(spacing: 8) {
                if store.peerIsMuted {
                    HStack(spacing: 4) {
                        SVGIcon(name: "microphone-mute", size: 12, tint: .red)
                        Text("Muted").font(.cubbly(11, .semibold)).foregroundStyle(.red)
                    }
                }
                if store.peerIsScreenSharing {
                    HStack(spacing: 4) {
                        SVGIcon(name: "screenshare", size: 12, tint: .green)
                        Text("Sharing screen").font(.cubbly(11, .semibold)).foregroundStyle(.green)
                    }
                }
            }
        }
    }

    private var controls: some View {
        HStack(spacing: 14) {
            roundSVGButton(
                icon: store.isMuted ? "microphone-mute" : "microphone",
                active: store.isMuted, color: .red
            ) { store.toggleMute() }

            roundSVGButton(
                icon: store.isDeafened ? "headphone-deafen" : "headphone",
                active: store.isDeafened, color: .red
            ) { store.toggleDeafen() }

            roundSVGButton(icon: "video-camera", active: false, color: .gray, disabled: true) {}
            roundSVGButton(icon: "screenshare", active: false, color: .gray, disabled: true) {}

            roundSVGButton(icon: "call-end", active: true,
                           color: Color(red: 0.93, green: 0.26, blue: 0.27)) {
                Task { await store.endCall() }
            }
        }
        .padding(.horizontal, 16)
    }

    private func roundSVGButton(icon: String,
                                active: Bool,
                                color: Color,
                                disabled: Bool = false,
                                action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(active ? color : Color.white.opacity(0.08))
                    .frame(width: 56, height: 56)
                SVGIcon(name: icon, size: 24,
                        tint: disabled ? Color.gray.opacity(0.5) : .white)
            }
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
    let track: RTCVideoTrack?
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

/// Slim pill shown above the bottom tab bar when the call is minimized.
/// Tap to expand the full CallView again. Mirrors the desktop "minimized
/// call indicator" UX.
struct MinimizedCallPill: View {
    @ObservedObject var store: CallStore = .shared
    @State private var elapsed: TimeInterval = 0
    @State private var timer: Timer?

    var body: some View {
        Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                store.restore()
            }
        } label: {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(store.state == .connected ? Color.green : Color.orange)
                        .frame(width: 10, height: 10)
                    Circle()
                        .strokeBorder(Color.white.opacity(0.4), lineWidth: 2)
                        .frame(width: 18, height: 18)
                        .scaleEffect(1.0 + 0.4 * sin(elapsed * 2))
                        .animation(.easeInOut(duration: 1).repeatForever(autoreverses: true), value: elapsed)
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text(store.state == .connected ? "In call with \(store.peerName)"
                                                   : "Calling \(store.peerName)…")
                        .font(.cubbly(13, .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    if store.state == .connected {
                        Text(formatElapsed(elapsed))
                            .font(.cubbly(10, .regular))
                            .foregroundStyle(.white.opacity(0.85))
                            .monospacedDigit()
                    }
                }
                Spacer()
                Image(systemName: "chevron.up")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(store.state == .connected
                          ? Color(red: 0.23, green: 0.65, blue: 0.36)
                          : Color(red: 0.98, green: 0.65, blue: 0.10))
            )
            .shadow(color: .black.opacity(0.3), radius: 10, y: 4)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .onAppear { startTimer() }
        .onDisappear { timer?.invalidate(); timer = nil }
    }

    private func startTimer() {
        timer?.invalidate()
        guard let started = store.startedAt else { return }
        elapsed = Date().timeIntervalSince(started)
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in elapsed = Date().timeIntervalSince(started) }
        }
    }

    private func formatElapsed(_ t: TimeInterval) -> String {
        let s = Int(t)
        return String(format: "%02d:%02d", s / 60, s % 60)
    }
}
