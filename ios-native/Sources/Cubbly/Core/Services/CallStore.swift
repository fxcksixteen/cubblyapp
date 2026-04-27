import Foundation
import Combine
import WebRTC
import AVFoundation
import Supabase

/// The iOS counterpart of the web `VoiceProvider`. One singleton drives:
///   - outgoing/incoming call state
///   - WebRTCClient for voice
///   - a second WebRTCClient for *receiving* a peer's screenshare
///   - in-chat call_event lifecycle (insert row → update on hangup)
///
/// v0.1.0 scope: voice + watching screenshares only. Outgoing video and
/// outgoing screenshare from iOS are out of scope (UI buttons disabled).
@MainActor
final class CallStore: ObservableObject {
    static let shared = CallStore()

    enum State { case idle, calling, ringing, connected }

    @Published private(set) var state: State = .idle
    @Published private(set) var conversationId: UUID?
    @Published private(set) var peerId: UUID?
    @Published private(set) var peerName: String = ""
    @Published private(set) var peerAvatarUrl: String?
    @Published private(set) var startedAt: Date?
    @Published var isMuted: Bool = false
    @Published var isDeafened: Bool = false
    /// When true, the full-screen CallView is hidden; only the pill at the
    /// top of MainTabView remains. The call itself keeps running.
    @Published var isMinimized: Bool = false

    /// Incoming call sheet metadata (separate from `state` so we can show
    /// a ring even while another call may briefly still be ending).
    @Published var incoming: IncomingCall?

    /// Set when the peer is broadcasting a screenshare we're rendering.
    @Published private(set) var remoteScreenTrack: RTCVideoTrack?
    @Published private(set) var peerIsScreenSharing: Bool = false
    @Published private(set) var peerIsVideoOn: Bool = false
    @Published private(set) var peerIsMuted: Bool = false

    /// `call_events.id` for the in-flight call. Used so chat threads can
    /// render an "ongoing call — Join" pill.
    @Published private(set) var currentCallEventId: UUID?

    struct IncomingCall: Identifiable {
        let id = UUID()
        let conversationId: UUID
        let callerId: UUID
        let callerName: String
        let callerAvatarUrl: String?
        let callEventId: UUID?
    }

    private var voiceClient: WebRTCClient?
    private var screenClient: WebRTCClient?
    private var signaling: CallSignaling?
    /// Non-nil while in a CubblyBot test call. Two in-process WebRTC peers
    /// loop your mic back to you, proving the entire stack works without
    /// needing another human on the other end.
    private var botEcho: BotEchoCall?
    private var iceServers: [RTCIceServer] = [
        RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])
    ]
    private var pendingRemoteIce: [RTCIceCandidate] = []
    private var pendingScreenIce: [RTCIceCandidate] = []

    private init() {}

    // MARK: - Bootstrap (call once after sign-in)

    func attach(client: SupabaseClient, userId: UUID) async {
        // Fetch TURN credentials once (mirrors web `get-turn-credentials` use).
        await fetchIceServers(client: client)

        let sig = CallSignaling(client: client, userId: userId)
        sig.onEvent = { [weak self] e in
            Task { @MainActor in self?.handleSignaling(e) }
        }
        await sig.subscribeToIncomingCalls()
        signaling = sig
    }

    private func fetchIceServers(client: SupabaseClient) async {
        struct Resp: Decodable { let iceServers: [IceServer]? }
        struct IceServer: Decodable {
            let urls: AnyCodable
            let username: String?
            let credential: String?
        }
        do {
            let resp: Resp = try await client.functions.invoke("get-turn-credentials")
            if let list = resp.iceServers {
                iceServers = list.map { srv in
                    let urls: [String] = {
                        if let s = srv.urls.value as? String { return [s] }
                        if let arr = srv.urls.value as? [String] { return arr }
                        return []
                    }()
                    return RTCIceServer(urlStrings: urls, username: srv.username, credential: srv.credential)
                }
                print("[Call] Loaded \(iceServers.count) ICE servers")
            }
        } catch {
            print("[Call] TURN fetch failed, falling back to STUN only:", error)
        }
    }

    // MARK: - Outgoing call

    func startCall(conversationId: UUID, peerId: UUID, peerName: String, peerAvatarUrl: String?) async {
        guard state == .idle, let signaling = signaling else { return }

        // CubblyBot is a synthetic peer — there's no real device on the other
        // end to negotiate with. Run a self-contained loopback so the user
        // can verify their mic + audio output + WebRTC stack are all live.
        if peerId == BotEchoCall.botUserId {
            await startBotEchoCall(conversationId: conversationId, peerName: peerName, peerAvatarUrl: peerAvatarUrl)
            return
        }

        self.conversationId = conversationId
        self.peerId = peerId
        self.peerName = peerName
        self.peerAvatarUrl = peerAvatarUrl
        self.state = .calling
        self.startedAt = nil
        self.isMinimized = false
        SoundService.shared.playLooping(.outgoingRing)
        CallKitService.shared.startOutgoing(handleName: peerName)

        await signaling.joinCallChannel(conversationId: conversationId)

        // Insert a call_events row so the chat thread shows an ongoing pill.
        do {
            struct InsertResp: Decodable { let id: UUID }
            let myUserId = (try? await SupabaseManager.shared.client.auth.user().id.uuidString) ?? ""
            let resp: InsertResp = try await SupabaseManager.shared.client
                .from("call_events")
                .insert([
                    "conversation_id": conversationId.uuidString,
                    "caller_id": myUserId,
                    "state": "ongoing"
                ])
                .select("id")
                .single()
                .execute()
                .value
            currentCallEventId = resp.id
        } catch {
            print("[Call] failed to insert call_event:", error)
        }

        // Activate audio session up front for outgoing tone.
        configureAudioSession()

        // Build the voice peer connection and send an offer.
        let voice = WebRTCClient(iceServers: iceServers, includeMicTrack: true)
        wireVoiceCallbacks(voice)
        voiceClient = voice

        do {
            let offer = try await voice.createOffer()
            await signaling.broadcast(type: "offer", payload: [
                "sdp": .object(["type": .string("offer"), "sdp": .string(offer.sdp)]),
                "callerAvatarUrl": peerAvatarUrl.map { .string($0) } ?? .null
            ])
            // Insert our own call_participants row so the other side knows
            // we're live (mirrors web's ensureOwnParticipantRow).
            if let evtId = currentCallEventId {
                await ensureOwnParticipantRow(callEventId: evtId)
            }
            // Ring the peer's global channel so they get the incoming-call sheet.
            if let evtId = currentCallEventId {
                await signaling.ringUser(
                    targetUserId: peerId,
                    conversationId: conversationId,
                    callEventId: evtId,
                    callerName: SessionStore.shared?.currentProfile?.displayName,
                    callerAvatarUrl: peerAvatarUrl
                )
            }
        } catch {
            print("[Call] createOffer failed:", error)
            await endCall()
        }
    }

    // MARK: - Join an already-ongoing call (no new ring, no duplicate event)

    /// Mirrors web's "join existing" path: looks up the most recent ongoing
    /// `call_event` for this conversation, confirms there's a non-self peer
    /// with `left_at IS NULL`, then joins THAT call_event by sending
    /// `ready-for-offer` over the existing voice channel. The peer responds
    /// with a fresh offer; no new ring fires, no second call_event row is
    /// created. This is what makes "Join" actually meet the other person.
    /// - Returns: true if we joined an existing live call, false if there
    ///   wasn't one (caller should fall back to startCall).
    func tryJoinExisting(conversationId convId: UUID, peerId: UUID, peerName: String, peerAvatarUrl: String?) async -> Bool {
        guard state == .idle, let signaling = signaling else { return false }
        let client = SupabaseManager.shared.client
        let myId: UUID
        do { myId = try await client.auth.user().id } catch { return false }

        // 1. Find the most recent ongoing call_event for this conversation.
        struct EvtRow: Decodable { let id: UUID; let started_at: Date }
        var existing: EvtRow? = nil
        do {
            let rows: [EvtRow] = try await client.from("call_events")
                .select("id,started_at")
                .eq("conversation_id", value: convId.uuidString)
                .eq("state", value: "ongoing")
                .order("started_at", ascending: false)
                .limit(1)
                .execute()
                .value
            existing = rows.first
        } catch {
            print("[Call] tryJoinExisting lookup failed:", error)
        }
        guard let evt = existing else { return false }

        // 2. Confirm a non-self peer is still live (left_at IS NULL).
        struct PartRow: Decodable { let user_id: UUID }
        var live: [PartRow] = []
        do {
            live = try await client.from("call_participants")
                .select("user_id")
                .eq("call_event_id", value: evt.id.uuidString)
                .is("left_at", value: nil)
                .execute()
                .value
        } catch {
            print("[Call] tryJoinExisting participants check failed:", error)
        }
        let otherActive = live.contains { $0.user_id != myId }
        if !otherActive {
            // Stale event — close it so the next attempt starts clean,
            // then signal failure so caller starts a fresh call.
            try? await client.from("call_events")
                .update(["state": "ended", "ended_at": ISO8601DateFormatter().string(from: Date())])
                .eq("id", value: evt.id.uuidString)
                .execute()
            return false
        }

        // 3. Join that exact call_event without creating a new one or ringing.
        self.conversationId = convId
        self.peerId = peerId
        self.peerName = peerName
        self.peerAvatarUrl = peerAvatarUrl
        self.currentCallEventId = evt.id
        self.state = .calling
        self.isMinimized = false
        configureAudioSession()
        CallKitService.shared.startOutgoing(handleName: peerName)
        await signaling.joinCallChannel(conversationId: convId)
        await ensureOwnParticipantRow(callEventId: evt.id)

        // Ask the live peer for a fresh offer. They'll respond with `offer`,
        // we'll answer in handleVoiceOffer. No ring, no duplicate event.
        await signaling.broadcast(type: "ready-for-offer")
        print("[Call] 🔁 Joining existing ongoing call_event:", evt.id.uuidString)
        return true
    }

    /// Insert (or upsert) our row in call_participants for a given call_event.
    private func ensureOwnParticipantRow(callEventId: UUID) async {
        let client = SupabaseManager.shared.client
        guard let myId = try? await client.auth.user().id else { return }
        struct Row: Encodable {
            let call_event_id: String
            let user_id: String
        }
        do {
            _ = try await client.from("call_participants")
                .insert(Row(call_event_id: callEventId.uuidString, user_id: myId.uuidString))
                .execute()
        } catch {
            // Probably already a row from an earlier attempt — that's fine.
            print("[Call] ensureOwnParticipantRow:", error)
        }
    }

    // MARK: - CubblyBot test call (local loopback)

    /// Drives a fake call to CubblyBot. We never touch realtime signaling —
    /// the entire call is two `RTCPeerConnection`s in this process exchanging
    /// SDP/ICE locally and piping the mic back to the caller. Lets the user
    /// validate "is my mic actually working and is the call audio path live"
    /// without a second human.
    private func startBotEchoCall(conversationId: UUID, peerName: String, peerAvatarUrl: String?) async {
        self.conversationId = conversationId
        self.peerId = BotEchoCall.botUserId
        self.peerName = peerName
        self.peerAvatarUrl = peerAvatarUrl
        self.state = .calling
        self.startedAt = nil
        self.isMinimized = false
        SoundService.shared.playLooping(.outgoingRing)
        CallKitService.shared.startOutgoing(handleName: peerName)
        configureAudioSession()

        let echo = BotEchoCall()
        botEcho = echo
        do {
            try await echo.start()
            // Brief "ringing" beat so the UI shows the calling animation,
            // then auto-connect — matches a snappy callee accept.
            try? await Task.sleep(nanoseconds: 600_000_000)
            SoundService.shared.stopLooping(.outgoingRing)
            SoundService.shared.play(.message)
            state = .connected
            startedAt = Date()
            CallKitService.shared.reportConnected()
            print("[Call] CubblyBot echo call connected — speak to hear yourself.")
        } catch {
            print("[Call] BotEcho start failed:", error)
            await endCall()
        }
    }

    // MARK: - Incoming call

    func acceptIncoming() async {
        guard let inc = incoming, let signaling = signaling else { return }
        self.conversationId = inc.conversationId
        self.peerId = inc.callerId
        self.peerName = inc.callerName
        self.peerAvatarUrl = inc.callerAvatarUrl
        self.currentCallEventId = inc.callEventId
        self.state = .connected
        self.startedAt = Date()
        self.isMinimized = false
        self.incoming = nil
        SoundService.shared.stopLooping(.incomingCall)
        SoundService.shared.play(.message)
        configureAudioSession()
        await signaling.joinCallChannel(conversationId: inc.conversationId)
        if let evt = inc.callEventId {
            await ensureOwnParticipantRow(callEventId: evt)
        }
        // Voice client will be created when we receive the offer (web sends offer right after ring).
    }

    func declineIncoming() {
        SoundService.shared.stopLooping(.incomingCall)
        incoming = nil
    }

    // MARK: - End call

    func endCall() async {
        let conv = conversationId
        if let signaling = signaling, conv != nil {
            await signaling.broadcast(type: "hangup")
        }
        SoundService.shared.stopLooping(.incomingCall)
        SoundService.shared.stopLooping(.outgoingRing)
        SoundService.shared.play(.leaveCall)
        voiceClient?.close(); voiceClient = nil
        screenClient?.close(); screenClient = nil
        botEcho?.stop(); botEcho = nil
        await signaling?.leaveCallChannel()
        if let evt = currentCallEventId {
            let endedAt = ISO8601DateFormatter().string(from: Date())
            // Mark our own participant row as left so the next "Join" attempt
            // correctly sees there's no live peer and starts a fresh call
            // instead of joining a ghost.
            if let myId = try? await SupabaseManager.shared.client.auth.user().id {
                _ = try? await SupabaseManager.shared.client
                    .from("call_participants")
                    .update(["left_at": endedAt])
                    .eq("call_event_id", value: evt.uuidString)
                    .eq("user_id", value: myId.uuidString)
                    .is("left_at", value: nil)
                    .execute()
            }
            try? await SupabaseManager.shared.client
                .from("call_events")
                .update(["state": "ended", "ended_at": endedAt])
                .eq("id", value: evt.uuidString)
                .execute()
        }
        resetAudioSession()
        CallKitService.shared.endActiveCallIfNeeded()
        state = .idle
        conversationId = nil
        peerId = nil
        peerName = ""
        peerAvatarUrl = nil
        startedAt = nil
        currentCallEventId = nil
        remoteScreenTrack = nil
        peerIsScreenSharing = false
        peerIsVideoOn = false
        peerIsMuted = false
        isMuted = false
        isDeafened = false
        isMinimized = false
        pendingRemoteIce.removeAll()
        pendingScreenIce.removeAll()
    }

    // MARK: - Mute / Deafen

    func toggleMute() {
        isMuted.toggle()
        voiceClient?.setMicEnabled(!isMuted)
        Task { await signaling?.broadcast(type: "peer-mute", payload: [
            "isMuted": .bool(isMuted), "isDeafened": .bool(isDeafened)
        ]) }
    }

    func toggleDeafen() {
        isDeafened.toggle()
        // Deafening implies mute on web — match that.
        if isDeafened && !isMuted {
            isMuted = true
            voiceClient?.setMicEnabled(false)
        }
        // Mute remote audio output by toggling all audio tracks on the inbound voice client.
        for t in voiceClient?.pc.transceivers ?? [] {
            if let track = t.receiver.track as? RTCAudioTrack {
                track.isEnabled = !isDeafened
            }
        }
        Task { await signaling?.broadcast(type: "peer-mute", payload: [
            "isMuted": .bool(isMuted), "isDeafened": .bool(isDeafened)
        ]) }
    }

    // MARK: - Output gain (called by CallSettings)

    func applyOutputGain(_ gain: Double) {
        for t in voiceClient?.pc.transceivers ?? [] {
            if let track = t.receiver.track as? RTCAudioTrack {
                // RTCAudioTrack has source.volume on iOS 14+.
                track.source.volume = max(0, min(10, gain * 10))
            }
        }
    }

    func reapplyAudioSession() { configureAudioSession() }

    // MARK: - Minimize / Restore

    func minimize() { isMinimized = true }
    func restore()  { isMinimized = false }

    // MARK: - Signaling event handler

    private func handleSignaling(_ e: CallSignaling.Event) {
        switch e {
        case .incomingCall(let conv, let caller, let name, let avatar, let evtId):
            // Ignore rings for our own outgoing call.
            guard state == .idle else { return }
            self.incoming = IncomingCall(
                conversationId: conv,
                callerId: caller,
                callerName: name ?? "Someone",
                callerAvatarUrl: avatar,
                callEventId: evtId
            )
            SoundService.shared.playLooping(.incomingCall)
            // Hand the ring to CallKit too so iOS shows the system call UI
            // (and the green status-bar pill once accepted).
            CallKitService.shared.reportIncoming(handleName: name ?? "Someone") { _ in }

        case .offer(_, let sdp, _):
            Task { await handleVoiceOffer(sdp: sdp) }

        case .answer(_, let sdp):
            Task { await handleVoiceAnswer(sdp: sdp) }

        case .iceCandidate(_, let cand):
            if let candidate = makeIce(from: cand) {
                if voiceClient?.pc.remoteDescription != nil {
                    voiceClient?.addIceCandidate(candidate)
                } else {
                    pendingRemoteIce.append(candidate)
                }
            }

        case .screenOffer(_, let sdp):
            Task { await handleScreenOffer(sdp: sdp) }

        case .screenAnswer:
            break // iOS doesn't send screenshares in v0.1.0

        case .screenIceCandidate(_, let cand):
            if let candidate = makeIce(from: cand) {
                if screenClient?.pc.remoteDescription != nil {
                    screenClient?.addIceCandidate(candidate)
                } else {
                    pendingScreenIce.append(candidate)
                }
            }

        case .screenStop:
            screenClient?.close(); screenClient = nil
            remoteScreenTrack = nil
            peerIsScreenSharing = false

        case .hangup:
            Task { await endCall() }

        case .peerMute(_, let m, let d):
            peerIsMuted = m || d

        case .peerVideo(_, let v):
            peerIsVideoOn = v

        case .readyForOffer:
            // A peer joined via "Join" pill while we were already in this
            // call — send them a fresh offer (no re-ring). They'll answer.
            Task { await sendFreshOfferForJoiner() }
        }
    }

    /// Build a new offer and broadcast it on the per-call channel. Used when
    /// a peer joins the existing call_event via `ready-for-offer`.
    private func sendFreshOfferForJoiner() async {
        guard let signaling = signaling else { return }
        // If we already have a voice client (we were the original caller),
        // renegotiate over it. Otherwise build a new one.
        let voice: WebRTCClient
        if let existing = voiceClient {
            voice = existing
        } else {
            let v = WebRTCClient(iceServers: iceServers, includeMicTrack: true)
            wireVoiceCallbacks(v)
            voiceClient = v
            voice = v
        }
        do {
            let offer = try await voice.createOffer()
            await signaling.broadcast(type: "offer", payload: [
                "sdp": .object(["type": .string("offer"), "sdp": .string(offer.sdp)])
            ])
        } catch {
            print("[Call] sendFreshOfferForJoiner failed:", error)
        }
    }

    // MARK: - Voice offer/answer

    private func handleVoiceOffer(sdp: String) async {
        // Build the voice client (we're the answerer).
        let voice = WebRTCClient(iceServers: iceServers, includeMicTrack: true)
        wireVoiceCallbacks(voice)
        voiceClient = voice
        if state == .idle {
            // Auto-accepted via accept sheet flow.
            state = .connected
            startedAt = Date()
        }
        do {
            try await voice.setRemoteDescription(RTCSessionDescription(type: .offer, sdp: sdp))
            for c in pendingRemoteIce { voice.addIceCandidate(c) }
            pendingRemoteIce.removeAll()
            let answer = try await voice.createAnswer()
            await signaling?.broadcast(type: "answer", payload: [
                "sdp": .object(["type": .string("answer"), "sdp": .string(answer.sdp)])
            ])
        } catch {
            print("[Call] handleVoiceOffer failed:", error)
        }
    }

    private func handleVoiceAnswer(sdp: String) async {
        guard let voice = voiceClient else { return }
        do {
            try await voice.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: sdp))
            for c in pendingRemoteIce { voice.addIceCandidate(c) }
            pendingRemoteIce.removeAll()
            state = .connected
            startedAt = Date()
            // Tell CallKit we're connected so the green pill appears.
            CallKitService.shared.reportConnected()
        } catch {
            print("[Call] setRemoteDescription(answer) failed:", error)
        }
    }

    private func handleScreenOffer(sdp: String) async {
        // Build a separate recvonly peer connection for the screenshare.
        let scr = WebRTCClient(iceServers: iceServers, includeMicTrack: false)
        scr.onTrack = { [weak self] track, kind in
            Task { @MainActor in
                if kind == "video", let videoTrack = track as? RTCVideoTrack {
                    self?.remoteScreenTrack = videoTrack
                    self?.peerIsScreenSharing = true
                    SoundService.shared.play(.message)
                }
            }
        }
        scr.onIceCandidate = { [weak self] cand in
            Task { @MainActor in
                await self?.signaling?.broadcast(type: "screen-ice-candidate", payload: [
                    "candidate": .object([
                        "candidate": .string(cand.sdp),
                        "sdpMid": cand.sdpMid.map { .string($0) } ?? .null,
                        "sdpMLineIndex": .integer(Int(cand.sdpMLineIndex)),
                    ])
                ])
            }
        }
        screenClient = scr
        do {
            try await scr.setRemoteDescription(RTCSessionDescription(type: .offer, sdp: sdp))
            for c in pendingScreenIce { scr.addIceCandidate(c) }
            pendingScreenIce.removeAll()
            let ans = try await scr.createAnswer()
            await signaling?.broadcast(type: "screen-answer", payload: [
                "sdp": .object(["type": .string("answer"), "sdp": .string(ans.sdp)])
            ])
        } catch {
            print("[Call] handleScreenOffer failed:", error)
        }
    }

    // MARK: - Helpers

    private func wireVoiceCallbacks(_ c: WebRTCClient) {
        c.onIceCandidate = { [weak self] cand in
            Task { @MainActor in
                await self?.signaling?.broadcast(type: "ice-candidate", payload: [
                    "candidate": .object([
                        "candidate": .string(cand.sdp),
                        "sdpMid": cand.sdpMid.map { .string($0) } ?? .null,
                        "sdpMLineIndex": .integer(Int(cand.sdpMLineIndex)),
                    ])
                ])
            }
        }
        c.onConnectionState = { [weak self] s in
            if s == .failed || s == .disconnected || s == .closed {
                Task { @MainActor in
                    if self?.state == .connected { await self?.endCall() }
                }
            }
        }
    }

    private func makeIce(from dict: [String: Any]) -> RTCIceCandidate? {
        guard let candidate = dict["candidate"] as? String else { return nil }
        let sdpMid = dict["sdpMid"] as? String
        let mline = dict["sdpMLineIndex"] as? Int ?? 0
        return RTCIceCandidate(sdp: candidate, sdpMLineIndex: Int32(mline), sdpMid: sdpMid)
    }

    // MARK: - Audio session

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            let mode: AVAudioSession.Mode = CallSettings.shared.echoCancellation ? .voiceChat : .default
            var options: AVAudioSession.CategoryOptions = [.allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]
            if CallSettings.shared.speakerOutput { options.insert(.defaultToSpeaker) }
            try session.setCategory(.playAndRecord, mode: mode, options: options)
            try session.setActive(true, options: [])
            if CallSettings.shared.speakerOutput {
                try session.overrideOutputAudioPort(.speaker)
            } else {
                try session.overrideOutputAudioPort(.none)
            }
        } catch {
            print("[Call] configureAudioSession failed:", error)
        }
    }

    private func resetAudioSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }
}

/// Helper for decoding heterogeneous `urls` field on ICE servers.
private struct AnyCodable: Decodable { let value: Any
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let s = try? c.decode(String.self) { value = s }
        else if let a = try? c.decode([String].self) { value = a }
        else { value = "" }
    }
}
