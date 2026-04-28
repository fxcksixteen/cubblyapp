import Foundation
import Supabase
import Realtime

/// Realtime signaling — wire-compatible with the web `VoiceContext.tsx`.
///
///   - **Ring channel:** `voice-global:{userId}` — receives `incoming-call`
///     broadcasts ({ conversationId, callEventId, userId, callerName?, callerAvatarUrl? }).
///
///   - **Per-call channel:** `voice-call:{conversationId}` — every signaling
///     message is broadcast on a SINGLE event called `voice-signal`. The
///     payload's `type` field tells us what it is: `offer`, `answer`,
///     `ice-candidate`, `screen-offer`, `screen-answer`, `screen-ice-candidate`,
///     `screen-stop`, `hangup`, `peer-mute`, `peer-video`, `ready-for-offer`.
///
/// **This is critical for cross-platform calling:** before v0.1.2, iOS used
/// separate event names per type, which meant nothing iOS sent ever reached
/// web (and vice versa). Web only listens on `voice-signal`. Now we match.
@MainActor
final class CallSignaling {
    enum Event {
        case incomingCall(conversationId: UUID, callerId: UUID, callerName: String?, callerAvatarUrl: String?, callEventId: UUID?)
        case offer(senderId: UUID, sdp: String, callerAvatarUrl: String?)
        case answer(senderId: UUID, sdp: String)
        case iceCandidate(senderId: UUID, candidate: [String: Any])
        case screenOffer(senderId: UUID, sdp: String)
        case screenAnswer(senderId: UUID, sdp: String)
        case screenIceCandidate(senderId: UUID, candidate: [String: Any])
        case screenStop(senderId: UUID)
        case hangup(senderId: UUID)
        case peerMute(senderId: UUID, isMuted: Bool, isDeafened: Bool)
        case peerVideo(senderId: UUID, isVideoOn: Bool)
        /// Sent by a peer who's joining an already-ongoing call. The other
        /// side should respond with a fresh `offer` instead of re-ringing.
        case readyForOffer(senderId: UUID)
    }

    private let client: SupabaseClient
    private let userId: UUID

    private var globalChannel: RealtimeChannelV2?
    private var callChannel: RealtimeChannelV2?
    private(set) var currentConversationId: UUID?

    var onEvent: ((Event) -> Void)?

    init(client: SupabaseClient, userId: UUID) {
        self.client = client
        self.userId = userId
    }

    // MARK: - Global ring channel (always on)

    func subscribeToIncomingCalls() async {
        let channel = client.realtimeV2.channel("voice-global:\(userId.uuidString)")
        let stream = channel.broadcastStream(event: "incoming-call")
        Task { [weak self] in
            for await message in stream {
                self?.handleIncomingCall(message: message)
            }
        }
        await channel.subscribe()
        globalChannel = channel
    }

    private func handleIncomingCall(message: [String: AnyJSON]) {
        // Web/desktop sends { targetId, callerId, ... }. Older iOS builds sent
        // { userId, ... }. Accept both shapes so cross-platform rings and the
        // associated call_event pill stay in sync.
        if let targetStr = message["targetId"]?.stringValue,
           let targetId = UUID(uuidString: targetStr),
           targetId != userId {
            return
        }
        guard
            let convStr = message["conversationId"]?.stringValue,
            let conversationId = UUID(uuidString: convStr),
            let callerStr = message["callerId"]?.stringValue ?? message["userId"]?.stringValue,
            let callerId = UUID(uuidString: callerStr)
        else { return }
        let callEvtId = message["callEventId"]?.stringValue.flatMap(UUID.init)
        let name = message["callerName"]?.stringValue
        let avatar = message["callerAvatarUrl"]?.stringValue
        onEvent?(.incomingCall(conversationId: conversationId, callerId: callerId, callerName: name, callerAvatarUrl: avatar, callEventId: callEvtId))
    }

    // MARK: - Per-call channel (single `voice-signal` event, web-compatible)

    func joinCallChannel(conversationId: UUID) async {
        await leaveCallChannel()
        let channel = client.realtimeV2.channel("voice-call:\(conversationId.uuidString)")
        currentConversationId = conversationId

        let stream = channel.broadcastStream(event: "voice-signal")
        Task { [weak self] in
            for await message in stream {
                await MainActor.run { self?.handleVoiceSignal(payload: message) }
            }
        }
        await channel.subscribe()
        callChannel = channel
    }

    func leaveCallChannel() async {
        if let ch = callChannel { await ch.unsubscribe() }
        callChannel = nil
        currentConversationId = nil
    }

    private func handleVoiceSignal(payload: [String: AnyJSON]) {
        guard let type = payload["type"]?.stringValue,
              let senderStr = payload["senderId"]?.stringValue,
              let senderId = UUID(uuidString: senderStr),
              senderId != userId
        else { return }

        switch type {
        case "offer":
            if let sdpDict = payload["sdp"]?.objectValue, let sdp = sdpDict["sdp"]?.stringValue {
                onEvent?(.offer(senderId: senderId, sdp: sdp, callerAvatarUrl: payload["callerAvatarUrl"]?.stringValue))
            }
        case "answer":
            if let sdpDict = payload["sdp"]?.objectValue, let sdp = sdpDict["sdp"]?.stringValue {
                onEvent?(.answer(senderId: senderId, sdp: sdp))
            }
        case "ice-candidate":
            if let cand = payload["candidate"]?.objectValue {
                onEvent?(.iceCandidate(senderId: senderId, candidate: anyJsonObjectToDict(cand)))
            }
        case "screen-offer":
            if let sdpDict = payload["sdp"]?.objectValue, let sdp = sdpDict["sdp"]?.stringValue {
                onEvent?(.screenOffer(senderId: senderId, sdp: sdp))
            }
        case "screen-answer":
            if let sdpDict = payload["sdp"]?.objectValue, let sdp = sdpDict["sdp"]?.stringValue {
                onEvent?(.screenAnswer(senderId: senderId, sdp: sdp))
            }
        case "screen-ice-candidate":
            if let cand = payload["candidate"]?.objectValue {
                onEvent?(.screenIceCandidate(senderId: senderId, candidate: anyJsonObjectToDict(cand)))
            }
        case "screen-stop":
            onEvent?(.screenStop(senderId: senderId))
        case "hangup":
            onEvent?(.hangup(senderId: senderId))
        case "peer-mute":
            let m = payload["isMuted"]?.boolValue ?? false
            let d = payload["isDeafened"]?.boolValue ?? false
            onEvent?(.peerMute(senderId: senderId, isMuted: m, isDeafened: d))
        case "peer-video":
            let v = payload["isVideoOn"]?.boolValue ?? false
            onEvent?(.peerVideo(senderId: senderId, isVideoOn: v))
        case "ready-for-offer":
            onEvent?(.readyForOffer(senderId: senderId))
        default: break
        }
    }

    // MARK: - Outgoing

    /// Broadcasts a payload on the per-call channel under the single
    /// `voice-signal` event (web-compatible). Always stamps `type` and
    /// `senderId`.
    func broadcast(type: String, payload: [String: AnyJSON] = [:]) async {
        guard let channel = callChannel else { return }
        var p = payload
        p["senderId"] = .string(userId.uuidString)
        p["type"] = .string(type)
        try? await channel.broadcast(event: "voice-signal", message: p)
    }

    /// Ring a remote user via their global channel.
    func ringUser(targetUserId: UUID, conversationId: UUID, callEventId: UUID, callerName: String?, callerAvatarUrl: String?) async {
        let channel = client.realtimeV2.channel("voice-global:\(targetUserId.uuidString)")
        await channel.subscribe()
        var payload: [String: AnyJSON] = [
            "targetId": .string(targetUserId.uuidString),
            "conversationId": .string(conversationId.uuidString),
            "callEventId": .string(callEventId.uuidString),
            "callerId": .string(userId.uuidString),
            "userId": .string(userId.uuidString),
        ]
        if let n = callerName { payload["callerName"] = .string(n) }
        if let a = callerAvatarUrl { payload["callerAvatarUrl"] = .string(a) }
        try? await channel.broadcast(event: "incoming-call", message: payload)
        // Keep the global channel alive so the ringee's ack/answer can come back.
        Task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            await channel.unsubscribe()
        }
    }
}

/// Convert AnyJSON dict → plain Swift dict for WebRTC's RTCIceCandidate JSON form.
private func anyJsonObjectToDict(_ obj: [String: AnyJSON]) -> [String: Any] {
    var out: [String: Any] = [:]
    for (k, v) in obj {
        switch v {
        case .string(let s): out[k] = s
        case .integer(let i): out[k] = i
        case .double(let d): out[k] = d
        case .bool(let b): out[k] = b
        case .null: out[k] = NSNull()
        case .array(let arr): out[k] = arr.map { ($0 as AnyJSON).stringValue ?? "" }
        case .object(let o): out[k] = anyJsonObjectToDict(o)
        }
    }
    return out
}

private extension AnyJSON {
    var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
    var objectValue: [String: AnyJSON]? { if case .object(let o) = self { return o }; return nil }
}
