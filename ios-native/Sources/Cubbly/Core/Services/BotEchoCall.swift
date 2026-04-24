import Foundation
import WebRTC
import AVFoundation

/// CubblyBot voice-call loopback.
///
/// The "bot" can't actually run a WebRTC peer in the cloud, so when you call
/// `00000000-0000-0000-0000-000000000001` we wire **two local
/// RTCPeerConnections inside the iOS app** and exchange SDP/ICE in-process:
///
///     [ caller PC ]  --offer-->  [ bot PC ]
///         mic  ────────────────►   recv ──┐
///                                          │  same engine, same Opus codec
///         recv ◄───────────────  send  ◄──┘
///
/// The bot PC takes the inbound mic track and re-publishes it on its own
/// outbound transceiver, so the caller hears their own voice back. This
/// validates the entire stack end-to-end — microphone capture, Opus encode,
/// SRTP, decode, AVAudioSession routing — without needing a remote peer.
///
/// If you don't hear yourself: mic permission is denied, the audio session
/// is misconfigured, or the WebRTC engine isn't loading. If you DO hear
/// yourself, real calls to humans will work too.
@MainActor
final class BotEchoCall {
    /// User id used by `send_test_bot_reply` / handle_new_user-style seeded bot.
    static let botUserId = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!

    private(set) var callerPC: RTCPeerConnection?
    private(set) var botPC: RTCPeerConnection?
    private var localMic: RTCAudioTrack?
    private var pendingCallerIce: [RTCIceCandidate] = []
    private var pendingBotIce: [RTCIceCandidate] = []

    private lazy var callerDelegate = LoopbackDelegate(label: "caller") { [weak self] cand in
        Task { @MainActor in self?.deliverIce(toBot: cand) }
    } onTrack: { _, _ in }

    private lazy var botDelegate = LoopbackDelegate(label: "bot") { [weak self] cand in
        Task { @MainActor in self?.deliverIce(toCaller: cand) }
    } onTrack: { [weak self] track, kind in
        // The bot PC just received the caller's mic — re-publish it so the
        // caller sees a remote audio track come back (this is the "echo").
        guard kind == "audio", let audioTrack = track as? RTCAudioTrack else { return }
        Task { @MainActor in self?.republishOnBot(audioTrack) }
    }

    /// Fully-wired echo call. Returns when both peers are connected.
    func start() async throws {
        let factory = WebRTCClient.factory
        let config = RTCConfiguration()
        // No TURN/STUN needed — both PCs are in the same process, host
        // candidates resolve locally over loopback.
        config.iceServers = []
        config.sdpSemantics = .unifiedPlan
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require
        config.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )
        guard
            let caller = factory.peerConnection(with: config, constraints: constraints, delegate: callerDelegate),
            let bot = factory.peerConnection(with: config, constraints: constraints, delegate: botDelegate)
        else {
            throw NSError(domain: "BotEchoCall", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to create peer connections"])
        }
        callerPC = caller
        botPC = bot

        // Caller publishes the real microphone.
        let micConstraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: [
                "googEchoCancellation": "true",
                "googAutoGainControl": "true",
                "googNoiseSuppression": "true",
                "googHighpassFilter": "true",
            ]
        )
        let source = factory.audioSource(with: micConstraints)
        let mic = factory.audioTrack(with: source, trackId: "mic-bot-echo")
        localMic = mic
        caller.add(mic, streamIds: ["caller-stream"])

        // Bot side starts as recv-only (it'll add a sendrecv transceiver
        // dynamically once it has the inbound track to echo).
        let recv = RTCRtpTransceiverInit()
        recv.direction = .recvOnly
        bot.addTransceiver(of: .audio, init: recv)

        // 1. Caller offers.
        let offer = try await offer(on: caller)
        // 2. Bot sets remote, answers.
        try await setRemote(bot, sdp: offer)
        flushPending(into: bot, queue: &pendingBotIce)
        let answer = try await answer(on: bot)
        // 3. Caller sets remote.
        try await setRemote(caller, sdp: answer)
        flushPending(into: caller, queue: &pendingCallerIce)

        print("[BotEcho] handshake complete — speak into the mic to hear yourself.")
    }

    func stop() {
        callerPC?.close(); callerPC = nil
        botPC?.close(); botPC = nil
        localMic = nil
        pendingCallerIce.removeAll()
        pendingBotIce.removeAll()
    }

    // MARK: - Echo: re-publish caller's audio back from the bot side

    private func republishOnBot(_ track: RTCAudioTrack) {
        guard let bot = botPC else { return }
        // Add the same audio track back as a sendrecv stream so it travels
        // back to the caller PC. Renegotiation isn't needed because the
        // caller's transceiver was created sendrecv (it already advertises
        // recvability for the same m-line).
        for transceiver in bot.transceivers where transceiver.mediaType == .audio {
            var err: NSError?
            transceiver.setDirection(.sendRecv, error: &err)
            transceiver.sender.track = track
            return
        }
        // Fallback: add fresh sendrecv transceiver.
        let init1 = RTCRtpTransceiverInit()
        init1.direction = .sendRecv
        bot.addTransceiver(with: track, init: init1)
    }

    // MARK: - Local SDP/ICE plumbing

    private func deliverIce(toBot cand: RTCIceCandidate) {
        guard let bot = botPC else { return }
        if bot.remoteDescription != nil {
            bot.add(cand) { _ in }
        } else {
            pendingBotIce.append(cand)
        }
    }
    private func deliverIce(toCaller cand: RTCIceCandidate) {
        guard let caller = callerPC else { return }
        if caller.remoteDescription != nil {
            caller.add(cand) { _ in }
        } else {
            pendingCallerIce.append(cand)
        }
    }

    private func flushPending(into pc: RTCPeerConnection, queue: inout [RTCIceCandidate]) {
        for c in queue { pc.add(c) { _ in } }
        queue.removeAll()
    }

    private func offer(on pc: RTCPeerConnection) async throws -> RTCSessionDescription {
        let mc = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true"],
            optionalConstraints: nil
        )
        return try await withCheckedThrowingContinuation { cont in
            pc.offer(for: mc) { sdp, err in
                if let err = err { cont.resume(throwing: err); return }
                guard let sdp = sdp else { cont.resume(throwing: NSError(domain: "BotEcho", code: -2)); return }
                pc.setLocalDescription(sdp) { setErr in
                    if let setErr = setErr { cont.resume(throwing: setErr) } else { cont.resume(returning: sdp) }
                }
            }
        }
    }

    private func answer(on pc: RTCPeerConnection) async throws -> RTCSessionDescription {
        let mc = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true"],
            optionalConstraints: nil
        )
        return try await withCheckedThrowingContinuation { cont in
            pc.answer(for: mc) { sdp, err in
                if let err = err { cont.resume(throwing: err); return }
                guard let sdp = sdp else { cont.resume(throwing: NSError(domain: "BotEcho", code: -3)); return }
                pc.setLocalDescription(sdp) { setErr in
                    if let setErr = setErr { cont.resume(throwing: setErr) } else { cont.resume(returning: sdp) }
                }
            }
        }
    }

    private func setRemote(_ pc: RTCPeerConnection, sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sdp) { err in
                if let err = err { cont.resume(throwing: err) } else { cont.resume() }
            }
        }
    }
}

/// Lightweight delegate used only by the bot-loopback PCs. The main
/// `WebRTCClient` already implements `RTCPeerConnectionDelegate`, but we
/// need two parallel delegates here that route ICE between the two PCs
/// rather than out over realtime broadcast.
private final class LoopbackDelegate: NSObject, RTCPeerConnectionDelegate {
    let label: String
    let onIce: (RTCIceCandidate) -> Void
    let onTrack: (RTCMediaStreamTrack, String) -> Void

    init(label: String,
         onIce: @escaping (RTCIceCandidate) -> Void,
         onTrack: @escaping (RTCMediaStreamTrack, String) -> Void) {
        self.label = label
        self.onIce = onIce
        self.onTrack = onTrack
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[BotEcho:\(label)] ICE state:", newState.rawValue)
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        onIce(candidate)
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        print("[BotEcho:\(label)] PC state:", newState.rawValue)
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didStartReceivingOn transceiver: RTCRtpTransceiver) {
        if let t = transceiver.receiver.track {
            print("[BotEcho:\(label)] receiving:", t.kind)
            onTrack(t, t.kind)
        }
    }
}
