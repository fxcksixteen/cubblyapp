import Foundation
import WebRTC
import AVFoundation

/// Thin wrapper around RTCPeerConnection providing the same SDP/ICE primitives
/// the web `VoiceContext.tsx` uses. One instance per peer connection — voice
/// uses one, an inbound screenshare receives a separate one.
///
/// Uses the official Google/Chromium WebRTC stack via stasel/WebRTC SPM, which
/// is the *exact* same engine Discord/Meet ship — guarantees Opus/H.264/VP8
/// interop with browser peers.
final class WebRTCClient: NSObject {
    /// Single shared factory; iOS docs require we keep one alive for the app's lifetime.
    static let factory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        let video = RTCDefaultVideoEncoderFactory()
        let videoDec = RTCDefaultVideoDecoderFactory()
        return RTCPeerConnectionFactory(encoderFactory: video, decoderFactory: videoDec)
    }()

    let pc: RTCPeerConnection
    private let audioConstraints: RTCMediaConstraints
    private var localAudioTrack: RTCAudioTrack?

    /// Called when remote media arrives. `kind` is "audio" or "video".
    var onTrack: ((RTCMediaStreamTrack, String) -> Void)?
    var onIceCandidate: ((RTCIceCandidate) -> Void)?
    var onConnectionState: ((RTCPeerConnectionState) -> Void)?

    init(iceServers: [RTCIceServer], includeMicTrack: Bool) {
        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.bundlePolicy = .maxBundle
        config.rtcpMuxPolicy = .require
        config.continualGatheringPolicy = .gatherContinually
        config.iceTransportPolicy = .all

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: ["DtlsSrtpKeyAgreement": "true"])
        audioConstraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: [
                "googEchoCancellation": "true",
                "googAutoGainControl": "true",
                "googNoiseSuppression": "true",
                "googHighpassFilter": "true",
            ]
        )
        guard let pc = WebRTCClient.factory.peerConnection(with: config, constraints: constraints, delegate: nil) else {
            fatalError("[WebRTC] Failed to create RTCPeerConnection")
        }
        self.pc = pc
        super.init()
        self.pc.delegate = self

        if includeMicTrack {
            attachMicrophoneTrack()
        } else {
            // Receive-only — we still need to add a recvonly transceiver so SDP advertises support.
            let init1 = RTCRtpTransceiverInit()
            init1.direction = .recvOnly
            pc.addTransceiver(of: .audio, init: init1)
            let init2 = RTCRtpTransceiverInit()
            init2.direction = .recvOnly
            pc.addTransceiver(of: .video, init: init2)
        }
    }

    deinit {
        pc.close()
    }

    private func attachMicrophoneTrack() {
        let source = WebRTCClient.factory.audioSource(with: audioConstraints)
        let track = WebRTCClient.factory.audioTrack(with: source, trackId: "mic-\(UUID().uuidString.prefix(8))")
        localAudioTrack = track
        pc.add(track, streamIds: ["cubbly-stream"])
        // Add a recvonly video transceiver so we can receive a peer's screenshare track.
        let init1 = RTCRtpTransceiverInit()
        init1.direction = .recvOnly
        pc.addTransceiver(of: .video, init: init1)
    }

    func setMicEnabled(_ enabled: Bool) {
        localAudioTrack?.isEnabled = enabled
    }

    // MARK: - SDP

    func createOffer() async throws -> RTCSessionDescription {
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true", "OfferToReceiveVideo": "true"],
            optionalConstraints: nil
        )
        return try await withCheckedThrowingContinuation { cont in
            pc.offer(for: constraints) { sdp, err in
                if let err = err { cont.resume(throwing: err); return }
                guard let sdp = sdp else { cont.resume(throwing: NSError(domain: "WebRTC", code: -1)); return }
                self.pc.setLocalDescription(sdp) { setErr in
                    if let setErr = setErr { cont.resume(throwing: setErr) }
                    else { cont.resume(returning: sdp) }
                }
            }
        }
    }

    func createAnswer() async throws -> RTCSessionDescription {
        let constraints = RTCMediaConstraints(
            mandatoryConstraints: ["OfferToReceiveAudio": "true", "OfferToReceiveVideo": "true"],
            optionalConstraints: nil
        )
        return try await withCheckedThrowingContinuation { cont in
            pc.answer(for: constraints) { sdp, err in
                if let err = err { cont.resume(throwing: err); return }
                guard let sdp = sdp else { cont.resume(throwing: NSError(domain: "WebRTC", code: -1)); return }
                self.pc.setLocalDescription(sdp) { setErr in
                    if let setErr = setErr { cont.resume(throwing: setErr) }
                    else { cont.resume(returning: sdp) }
                }
            }
        }
    }

    func setRemoteDescription(_ sdp: RTCSessionDescription) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            pc.setRemoteDescription(sdp) { err in
                if let err = err { cont.resume(throwing: err) } else { cont.resume() }
            }
        }
    }

    func addIceCandidate(_ candidate: RTCIceCandidate) {
        pc.add(candidate) { err in
            if let err = err { print("[WebRTC] addIceCandidate failed:", err) }
        }
    }

    func close() {
        pc.close()
    }
}

extension WebRTCClient: RTCPeerConnectionDelegate {
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        print("[WebRTC] ICE state:", newState.rawValue)
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        onIceCandidate?(candidate)
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        print("[WebRTC] PC state:", newState.rawValue)
        onConnectionState?(newState)
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didStartReceivingOn transceiver: RTCRtpTransceiver) {
        let track = transceiver.receiver.track
        if let track = track {
            print("[WebRTC] receiving track:", track.kind)
            onTrack?(track, track.kind)
        }
    }
}
