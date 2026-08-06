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
    /// Mirrors web's `ringTimedOut`: true once the 30s outgoing-ring timer
    /// elapsed without the peer answering. Call STAYS open (peer can still
    /// Join from the chat pill) but UI flips from "Calling…" → "Not in call".
    @Published var ringTimedOut: Bool = false
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

    /// Heartbeat task — pings `heartbeat_call_participant` every 10s while
    /// in a real call so other clients can tell us apart from a ghost row.
    private var heartbeatTask: Task<Void, Never>?
    /// 30s unanswered-ring timer (Discord parity).
    private var ringTimeoutTask: Task<Void, Never>?
    private var incomingRingTimeoutTask: Task<Void, Never>?
    /// Answerer-side: periodically re-broadcasts `ready-for-offer` until the
    /// caller's `offer` arrives. Single-shot ready-for-offer is fragile on
    /// flaky mobile networks and lossy Realtime channels — retrying every
    /// 1.5s up to 8s makes the handshake reliable.
    private var readyForOfferRetryTask: Task<Void, Never>?
    /// Caller-side: if `ready-for-offer` never arrives (peer ack lost), fall
    /// back to sending an offer proactively after a short delay so the call
    /// can still connect.
    private var callerFallbackOfferTask: Task<Void, Never>?
    /// Set to true once we've sent or received an SDP offer on the current
    /// call so retry tasks know to stop.
    private var sdpExchangeStarted: Bool = false

    /// Deterministic WebRTC role for the current call (web parity).
    /// The side that rang is the offerer; the side that accepted answers.
    /// Without this, crossed `ready-for-offer` retries create offer glare and
    /// both ends sit in have-local-offer forever — the "stuck on Calling" bug.
    private var isCallerRole: Bool = false
    /// Set when the peer broadcasts `peer-accepted`. While non-nil the 30s
    /// ring timeout must not flip us to "Not in call" — they picked up, we're
    /// just still finishing the media handshake.
    private var peerAcceptedCallEventId: UUID?
    /// Guards `endCall()` so teardown (and the leave sound) runs exactly once
    /// per call. Both the in-app End button and CallKit's CXEndCallAction
    /// reach `endCall()`, which is why hangups used to double-play.
    private var isEndingCall: Bool = false

    /// The user ID signaling is currently attached for. Used to skip redundant
    /// re-attaches during Supabase token refreshes, which would otherwise
    /// replace the active signaling channel and silently break in-progress calls.
    private var attachedUserId: UUID?

    /// Single tagged log line for every step of the handshake so iOS and web
    /// traces can be read side by side.
    private func trace(_ step: String, _ detail: String = "") {
        let evt = currentCallEventId?.uuidString.lowercased().prefix(8) ?? "--------"
        print("[CallTrace] \(step) evt=\(evt) state=\(state) role=\(isCallerRole ? "caller" : "callee") \(detail)")
    }

    private init() {}

    // MARK: - Bootstrap (call once after sign-in)

    func attach(client: SupabaseClient, userId: UUID) async {
        // Skip if we're already attached for the same user. Token refreshes
        // fire `.signedIn` / `.tokenRefreshed` repeatedly; re-creating the
        // signaling object mid-call would lose the per-call channel and
        // silently kill the WebRTC handshake.
        if attachedUserId == userId && signaling != nil { return }

        // Fetch TURN credentials once (mirrors web `get-turn-credentials` use).
        await fetchIceServers(client: client)

        let sig = CallSignaling(client: client, userId: userId)
        sig.onEvent = { [weak self] e in
            Task { @MainActor in self?.handleSignaling(e) }
        }
        await sig.subscribeToIncomingCalls()
        signaling = sig
        attachedUserId = userId
    }

    /// Tears down signaling when the user signs out so a subsequent sign-in
    /// (possibly with a different account) gets a fresh setup.
    func detach() async {
        await signaling?.leaveCallChannel()
        signaling = nil
        attachedUserId = nil
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

    // MARK: - Microphone permission

    /// Requests microphone access if not already granted. Without mic
    /// permission the WebRTC audio track is completely silent — the call
    /// appears to "connect" but neither side hears anything.
    private func ensureMicPermission() async -> Bool {
        if #available(iOS 17.0, *) {
            let status = AVAudioApplication.shared.recordPermission
            if status == .granted { return true }
            if status == .undetermined {
                return (try? await AVAudioApplication.requestRecordPermission()) ?? false
            }
        } else {
            let status = AVAudioSession.sharedInstance().recordPermission
            if status == .granted { return true }
            if status == .undetermined {
                return await withCheckedContinuation { cont in
                    AVAudioSession.sharedInstance().requestRecordPermission { granted in
                        cont.resume(returning: granted)
                    }
                }
            }
        }
        print("[Call] ⛔ Microphone permission denied — cannot start call")
        return false
    }

    // MARK: - Outgoing call

    func startCall(conversationId: UUID, peerId: UUID, peerName: String, peerAvatarUrl: String?) async {
        guard state == .idle, let signaling = signaling else { return }
        guard await ensureMicPermission() else { return }

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
        self.sdpExchangeStarted = false
        self.isCallerRole = true
        self.peerAcceptedCallEventId = nil
        self.isEndingCall = false
        // Configure the CALL audio session BEFORE starting the ring tone.
        // Doing it the other way round (as we used to) meant the ring player
        // was created on the ambient session and then torn down a beat later
        // when WebRTC took the session over — the ringtone audibly died after
        // about a second even though we were still ringing.
        configureAudioSession()
        SoundService.shared.playLooping(.outgoingRing)
        CallKitService.shared.startOutgoing(handleName: peerName)
        trace("caller.start")

        // 1) Join + WAIT FOR JOIN ACK on the per-call channel BEFORE we ring.
        //    Without this, supabase-swift fires our subsequent broadcasts
        //    into a half-open channel and the peer's `ready-for-offer`
        //    arrives at thin air. (CallSignaling.joinCallChannel now waits
        //    internally, but we keep this comment as a tripwire.)
        await signaling.joinCallChannel(conversationId: conversationId)

        // 2) Insert call_events row + heartbeat our participant row IMMEDIATELY,
        //    so by the time the peer receives the ring and her client checks
        //    "is anyone live in this event?", she sees us and joins the SAME
        //    event instead of starting a fresh one.
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

        if let evtId = currentCallEventId {
            await ensureOwnParticipantRow(callEventId: evtId)
            startHeartbeat()
        }
        trace("caller.callEventReady")

        // 3) NOW ring the peer. Channel is joined, event row exists, our
        //    participant row is live — the ring will reliably arrive and the
        //    accept-side liveness check will succeed. Pass OUR own avatar
        //    (not the peer's) so their incoming sheet shows the right photo.
        let myAvatar = SessionStore.shared?.currentProfile?.avatarURL
        let myName = SessionStore.shared?.currentProfile?.displayName
        if let evtId = currentCallEventId {
            await signaling.ringUser(
                targetUserId: peerId,
                conversationId: conversationId,
                callEventId: evtId,
                callerName: myName,
                callerAvatarUrl: myAvatar
            )
            trace("caller.ringSent")
        }
        startOutgoingRingTimeout()
        startCallerFallbackOffer()
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
    func tryJoinExisting(conversationId convId: UUID, peerId: UUID, peerName: String, peerAvatarUrl: String?, preferredCallEventId: UUID? = nil) async -> Bool {
        guard state == .idle, let signaling = signaling else { return false }
        guard await ensureMicPermission() else { return false }
        let client = SupabaseManager.shared.client
        let myId: UUID
        do { myId = try await client.auth.user().id } catch { return false }

        // 1. Prefer the EXACT call_event the user tapped (from the chat pill).
        //    Falling back to "most recent ongoing" is what caused Join to
        //    occasionally land in the wrong (or a brand-new) call.
        struct EvtRow: Decodable { let id: UUID; let started_at: Date; let state: String }
        var existing: EvtRow? = nil
        if let pref = preferredCallEventId {
            do {
                let rows: [EvtRow] = try await client.from("call_events")
                    .select("id,started_at,state")
                    .eq("id", value: pref.uuidString)
                    .limit(1)
                    .execute()
                    .value
                if let r = rows.first, r.state == "ongoing" { existing = r }
            } catch {
                print("[Call] preferred call_event lookup failed:", error)
            }
        }
        if existing == nil {
            do {
                let rows: [EvtRow] = try await client.from("call_events")
                    .select("id,started_at,state")
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
        }
        guard let evt = existing else { return false }

        // 2. Confirm at least one non-self peer is FRESHLY live.
        struct PartRow: Decodable { let user_id: UUID; let last_seen_at: Date?; let left_at: Date? }
        var live: [PartRow] = []
        do {
            live = try await client.from("call_participants")
                .select("user_id,last_seen_at,left_at")
                .eq("call_event_id", value: evt.id.uuidString)
                .filter("left_at", operator: "is", value: "null")
                .execute()
                .value
        } catch {
            print("[Call] tryJoinExisting participants check failed:", error)
        }
        let freshCutoff = Date().addingTimeInterval(-30)
        let otherActive = live.contains { row in
            row.user_id != myId &&
            (row.last_seen_at == nil || row.last_seen_at! > freshCutoff)
        }
        if !otherActive {
            _ = try? await client.rpc("end_call_event_if_stale", params: ["_call_event_id": evt.id.uuidString]).execute()
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
        self.sdpExchangeStarted = false
        // Rejoiner is the answerer (web parity): we ask for an offer, we don't
        // make one. Keeps both ends out of simultaneous have-local-offer.
        self.isCallerRole = false
        self.peerAcceptedCallEventId = nil
        self.isEndingCall = false
        configureAudioSession()
        CallKitService.shared.startOutgoing(handleName: peerName)
        await signaling.joinCallChannel(conversationId: convId)
        await ensureOwnParticipantRow(callEventId: evt.id)
        startHeartbeat()

        // Ask the live peer for a fresh offer. They'll respond with `offer`,
        // we'll answer in handleVoiceOffer. No ring, no duplicate event.
        startReadyForOfferRetry(callEventId: evt.id)
        trace("rejoin.readyForOffer")
        return true
    }

    /// Insert (or upsert) our row in call_participants for a given call_event.
    /// Uses the `heartbeat_call_participant` RPC so a previously-left row is
    /// REVIVED (left_at cleared, last_seen_at refreshed) instead of failing
    /// the unique (call_event_id, user_id) constraint.
    private func ensureOwnParticipantRow(callEventId: UUID) async {
        let client = SupabaseManager.shared.client
        struct Params: Encodable {
            let _call_event_id: String
            let _is_muted: Bool
            let _is_deafened: Bool
            let _is_video_on: Bool
            let _is_screen_sharing: Bool
        }
        do {
            _ = try await client.rpc(
                "heartbeat_call_participant",
                params: Params(
                    _call_event_id: callEventId.uuidString,
                    _is_muted: isMuted,
                    _is_deafened: isDeafened,
                    _is_video_on: false,
                    _is_screen_sharing: false
                )
            ).execute()
        } catch {
            print("[Call] heartbeat_call_participant failed:", error)
        }
    }

    /// Start a 10-second heartbeat that keeps our `last_seen_at` fresh while
    /// in a call. Without this, peers' liveness check would mark us stale
    /// after 30s and the rejoin pill would incorrectly disappear.
    private func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self = self, let evt = await self.currentCallEventId else { return }
                await self.ensureOwnParticipantRow(callEventId: evt)
                try? await Task.sleep(nanoseconds: 10_000_000_000)
            }
        }
    }

    private func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
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
        guard await ensureMicPermission() else {
            declineIncoming()
            return
        }
        // Adopt the canonical ongoing call_event for this conversation so we
        // land in the SAME event as the caller instead of heartbeating into a
        // parallel one (which is what left both sides "in a call" alone).
        var acceptedEventId = inc.callEventId
        if let pref = inc.callEventId {
            struct CanonParams: Encodable {
                let _conversation_id: String
                let _preferred_call_event_id: String
            }
            if let canonical: UUID = try? await SupabaseManager.shared.client.rpc(
                "canonicalize_ongoing_call_event",
                params: CanonParams(
                    _conversation_id: inc.conversationId.uuidString,
                    _preferred_call_event_id: pref.uuidString
                )
            ).execute().value {
                acceptedEventId = canonical
            }
        }

        self.conversationId = inc.conversationId
        self.peerId = inc.callerId
        self.peerName = inc.callerName
        self.peerAvatarUrl = inc.callerAvatarUrl
        self.currentCallEventId = acceptedEventId
        // Web flips to "calling" while waiting for the offer to arrive — match it.
        self.state = .calling
        self.startedAt = nil
        self.isMinimized = false
        self.incoming = nil
        self.ringTimedOut = false
        self.sdpExchangeStarted = false
        self.isCallerRole = false
        self.peerAcceptedCallEventId = nil
        self.isEndingCall = false
        incomingRingTimeoutTask?.cancel(); incomingRingTimeoutTask = nil
        SoundService.shared.stopLooping(.incomingCall)
        configureAudioSession()
        SoundService.shared.play(.message)
        await signaling.joinCallChannel(conversationId: inc.conversationId)
        if let evt = acceptedEventId {
            await ensureOwnParticipantRow(callEventId: evt)
            startHeartbeat()
        }
        // Web/desktop parity: tell the caller we picked up BEFORE any SDP
        // work. Their ring stops immediately and they push an offer without
        // waiting on the ready-for-offer round trip.
        await signaling.broadcast(type: "peer-accepted", payload: [
            "callEventId": acceptedEventId.map { .string($0.uuidString.lowercased()) } ?? .null
        ])
        trace("callee.acceptedSent")
        // Then ask for the offer, retrying until it lands so a single dropped
        // Realtime packet (common on mobile) doesn't wedge the call forever.
        startReadyForOfferRetry(callEventId: acceptedEventId)
    }

    func declineIncoming() {
        SoundService.shared.stopLooping(.incomingCall)
        incomingRingTimeoutTask?.cancel(); incomingRingTimeoutTask = nil
        incoming = nil
        CallKitService.shared.endActiveCallIfNeeded()
    }

    // MARK: - End call

    func endCall() async {
        // Both the in-app End button and CallKit's CXEndCallAction land here
        // (the button ends the CallKit call, which calls back into us). Without
        // this guard the whole teardown ran twice and the leave sound played
        // twice on every single hangup.
        if isEndingCall { return }
        if state == .idle && currentCallEventId == nil && conversationId == nil { return }
        isEndingCall = true
        trace("endCall")
        stopHeartbeat()
        stopRingTimeouts()
        stopHandshakeRetries()
        sdpExchangeStarted = false
        peerAcceptedCallEventId = nil
        let conv = conversationId
        if let signaling = signaling, conv != nil {
            // v0.2.27 parity: soft-leave so the call_event stays ongoing for
            // any remaining participants. Web/desktop accept both for compat.
            await signaling.broadcast(type: "peer-leave")
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
            // Mark our own participant row as left first.
            if let myId = try? await SupabaseManager.shared.client.auth.user().id {
                _ = try? await SupabaseManager.shared.client
                    .from("call_participants")
                    .update(["left_at": endedAt])
                    .eq("call_event_id", value: evt.uuidString)
                    .eq("user_id", value: myId.uuidString)
                    .filter("left_at", operator: "is", value: "null")
                    .execute()
            }
            // Only end the whole call_event if NO other participant is still
            // live. Mirrors web/desktop: the call_event lives until the last
            // person leaves so others can still join from the chat pill.
            //
            // SPECIAL CASE: if WE were the only participant who ever joined
            // (the peer never picked up), mark the event as `missed` instead
            // of `ended` so the chat thread shows the proper red "Missed
            // call" pill rather than briefly flashing "Ongoing → ended".
            struct PartRow: Decodable { let user_id: UUID }
            let allEver: [PartRow] = (try? await SupabaseManager.shared.client
                .from("call_participants")
                .select("user_id")
                .eq("call_event_id", value: evt.uuidString)
                .execute()
                .value) ?? []
            let live: [PartRow] = (try? await SupabaseManager.shared.client
                .from("call_participants")
                .select("user_id")
                .eq("call_event_id", value: evt.uuidString)
                .filter("left_at", operator: "is", value: "null")
                .execute()
                .value) ?? []
            let myId = try? await SupabaseManager.shared.client.auth.user().id
            let onlyMeEver = allEver.allSatisfy { $0.user_id == myId }
            if live.isEmpty {
                let finalState = onlyMeEver ? "missed" : "ended"
                try? await SupabaseManager.shared.client
                    .from("call_events")
                    .update(["state": finalState, "ended_at": endedAt])
                    .eq("id", value: evt.uuidString)
                    .execute()
            }
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
        ringTimedOut = false
        isCallerRole = false
        pendingRemoteIce.removeAll()
        pendingScreenIce.removeAll()
        isEndingCall = false
    }

    // MARK: - 30s ring timeouts (Discord parity)

    private func startOutgoingRingTimeout() {
        ringTimeoutTask?.cancel()
        ringTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            await MainActor.run {
                guard let self = self else { return }
                guard self.state == .calling || self.state == .ringing else { return }
                SoundService.shared.stopLooping(.outgoingRing)
                // The peer told us they picked up — don't tell the user
                // "Not in call" just because the media handshake is still
                // finishing. Keep waiting instead.
                if self.peerAcceptedCallEventId != nil {
                    self.trace("caller.ringTimeout.suppressed", "peer already accepted")
                    return
                }
                self.ringTimedOut = true
                self.trace("caller.ringTimeout")
            }
        }
    }

    private func startIncomingRingTimeout() {
        incomingRingTimeoutTask?.cancel()
        incomingRingTimeoutTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 30_000_000_000)
            await MainActor.run {
                guard let self = self else { return }
                if self.incoming != nil {
                    SoundService.shared.stopLooping(.incomingCall)
                    self.incoming = nil
                    CallKitService.shared.endActiveCallIfNeeded()
                    print("[Call] ⏰ 30s incoming ring timeout — auto-dismissed")
                }
            }
        }
    }

    private func stopRingTimeouts() {
        ringTimeoutTask?.cancel(); ringTimeoutTask = nil
        incomingRingTimeoutTask?.cancel(); incomingRingTimeoutTask = nil
    }

    // MARK: - Handshake retries (mobile-network resilience)

    /// Answerer-side: re-broadcast `ready-for-offer` every 1.5s for up to 15s
    /// until we receive the caller's `offer`. Single-shot signaling drops
    /// silently on flaky Realtime/4G/5G connections.
    private func startReadyForOfferRetry(callEventId: UUID?) {
        readyForOfferRetryTask?.cancel()
        readyForOfferRetryTask = Task { [weak self] in
            guard let self = self else { return }
            let payload: [String: AnyJSON] = [
                "callEventId": callEventId.map { .string($0.uuidString.lowercased()) } ?? .null
            ]
            for attempt in 0..<10 {
                if Task.isCancelled { return }
                let started = await self.sdpExchangeStarted
                if started { return }
                await self.signaling?.broadcast(type: "ready-for-offer", payload: payload)
                await self.trace("callee.readyForOffer", "attempt=\(attempt + 1)")
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }

    /// Caller-side safety net. The peer's `ready-for-offer` can be dropped by
    /// a flaky Realtime channel, and previously we waited a full 5 seconds
    /// once before giving up — with a 30s ring that left essentially no room
    /// to recover. Now we start pushing an offer at 1.2s and keep nudging
    /// until the answer lands (or the call ends).
    private func startCallerFallbackOffer() {
        callerFallbackOfferTask?.cancel()
        callerFallbackOfferTask = Task { [weak self] in
            guard let self = self else { return }
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            for attempt in 0..<8 {
                if Task.isCancelled { return }
                let st = await self.state
                // Only push while we're still actively calling. Once media is
                // up (.connected) the handshake is done.
                guard st == .calling else { return }
                let started = await self.sdpExchangeStarted
                if !started {
                    await self.trace("caller.fallbackOffer", "attempt=\(attempt + 1)")
                    await self.sendFreshOfferForJoiner()
                } else if await self.hasRemoteAnswer() == false {
                    // Offer went out but no answer came back — re-broadcast
                    // the exact same local offer rather than renegotiating.
                    await self.rebroadcastCurrentOffer(attempt: attempt + 1)
                } else {
                    return
                }
                try? await Task.sleep(nanoseconds: 2_500_000_000)
            }
        }
    }

    private func hasRemoteAnswer() -> Bool {
        voiceClient?.pc.remoteDescription != nil
    }

    /// Re-send the offer we already created. Used when the offer or its answer
    /// was lost in transit — renegotiating from scratch here would just cause
    /// glare with a peer who did receive it.
    private func rebroadcastCurrentOffer(attempt: Int) async {
        guard let signaling = signaling,
              let local = voiceClient?.pc.localDescription,
              local.type == .offer else { return }
        await signaling.broadcast(type: "offer", payload: [
            "sdp": .object(["type": .string("offer"), "sdp": .string(local.sdp)]),
            "callEventId": currentCallEventId.map { .string($0.uuidString.lowercased()) } ?? .null
        ])
        trace("caller.offerResent", "attempt=\(attempt)")
    }

    private func stopHandshakeRetries() {
        readyForOfferRetryTask?.cancel(); readyForOfferRetryTask = nil
        callerFallbackOfferTask?.cancel(); callerFallbackOfferTask = nil
    }

    // MARK: - Mute / Deafen

    func toggleMute() {
        isMuted.toggle()
        voiceClient?.setMicEnabled(!isMuted)
        // BotEcho path: silence the local mic track that's looped back to us.
        botEcho?.setMicEnabled(!isMuted)
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
            botEcho?.setMicEnabled(false)
        }
        // Mute remote audio output by toggling all audio tracks on the inbound voice client.
        for t in voiceClient?.pc.transceivers ?? [] {
            if let track = t.receiver.track as? RTCAudioTrack {
                track.isEnabled = !isDeafened
            }
        }
        // Same for the BotEcho loopback so deafen actually silences the echo.
        botEcho?.setRemoteAudioEnabled(!isDeafened)
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

    /// Cheap route-only update — flips speaker vs. earpiece/Bluetooth without
    /// tearing down the active `setCategory(...)` (which momentarily stalls
    /// the mic input on some devices and produced the "speaker = mute"
    /// symptom users reported). Use this for the in-call speaker toggle.
    func applySpeakerRouteOnly() {
        let session = AVAudioSession.sharedInstance()
        do {
            if CallSettings.shared.speakerOutput {
                try session.overrideOutputAudioPort(.speaker)
            } else {
                try session.overrideOutputAudioPort(.none)
            }
        } catch {
            print("[Call] applySpeakerRouteOnly failed:", error)
        }
    }

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
            startIncomingRingTimeout()
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
            // Match web parity (VoiceContext.tsx): the peer left, but WE stay
            // in the call (it's still "ongoing" until the LAST participant
            // leaves). Tear down the per-peer pieces but keep CallStore.state
            // alive so the user can still see the call UI / be rejoined.
            Task { await peerLeftButStayInCall() }

        case .peerMute(_, let m, let d):
            peerIsMuted = m || d

        case .peerVideo(_, let v):
            peerIsVideoOn = v

        case .readyForOffer(_, let evtId):
            // A peer accepted, or joined via the "Join" pill, and is asking us
            // for an offer. Only the offerer side may answer this — see
            // `respondToPeerJoining`.
            Task { await respondToPeerJoining(callEventId: evtId) }

        case .peerAccepted(_, let evtId):
            // Web/desktop parity: the callee picked up. Stop ringing, adopt
            // their call_event if it drifted from ours, and push the offer
            // right away instead of waiting for `ready-for-offer` to arrive.
            peerAcceptedCallEventId = evtId ?? currentCallEventId
            if let evtId = evtId, evtId != currentCallEventId, state == .calling {
                trace("caller.adoptCallEvent", "-> \(evtId.uuidString.lowercased().prefix(8))")
                currentCallEventId = evtId
            }
            SoundService.shared.stopLooping(.outgoingRing)
            ringTimedOut = false
            trace("caller.peerAccepted")
            if isCallerRole {
                Task { await sendFreshOfferForJoiner() }
            }
        }
    }

    /// Resets per-peer state and sends a brand-new offer over the call
    /// channel. Used whenever a peer asks us for an offer via
    /// `ready-for-offer`.
    ///
    /// Two guards matter here:
    ///  * **Role.** If we're the side that accepted an incoming call we must
    ///    wait for the caller's offer. Answering a stray `ready-for-offer`
    ///    puts both ends in have-local-offer (offer glare) and the call hangs
    ///    on "Calling" forever — this was the main cross-platform failure.
    ///  * **Per-call-event dedupe.** Retries for the SAME call event are
    ///    ignored while an offer is in flight, but a request for a different
    ///    event (a genuine rejoin) always gets a fresh offer. The old blanket
    ///    1-second window silently swallowed real requests.
    private var lastJoinerOfferEventId: UUID?
    private var lastJoinerOfferSentAt: Date = .distantPast
    private func respondToPeerJoining(callEventId: UUID?) async {
        // Answerer side: never offer while we're waiting on the caller's
        // offer. The only time an answerer may offer is when the other side
        // dropped out of the call and is now rejoining us.
        if !isCallerRole && !peerLeftWaiting {
            trace("readyForOffer.ignored", "answerer role")
            return
        }
        if !isCallerRole {
            // We're taking over as the offerer for this rejoin.
            isCallerRole = true
            peerLeftWaiting = false
        }
        let sameEvent = callEventId == nil || callEventId == lastJoinerOfferEventId
        if sameEvent && Date().timeIntervalSince(lastJoinerOfferSentAt) < 1.0 && sdpExchangeStarted {
            trace("readyForOffer.deduped")
            return
        }
        lastJoinerOfferEventId = callEventId ?? currentCallEventId
        lastJoinerOfferSentAt = Date()

        // If we're connected, just renegotiate over the existing client.
        // If we never got an answer (call still in .calling), tear down
        // the stale voiceClient so the joiner gets a clean handshake.
        if state != .connected {
            voiceClient?.close()
            voiceClient = nil
            pendingRemoteIce.removeAll()
        }
        sdpExchangeStarted = false
        await sendFreshOfferForJoiner()
    }

    /// Build a new offer and broadcast it on the per-call channel. Used when
    /// a peer joins the existing call_event via `ready-for-offer`, or as a
    /// caller-side fallback when no `ready-for-offer` arrives.
    private func sendFreshOfferForJoiner() async {
        guard let signaling = signaling else { return }
        if sdpExchangeStarted { return }
        sdpExchangeStarted = true
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
            let myName = SessionStore.shared?.currentProfile?.displayName
            let myAvatar = SessionStore.shared?.currentProfile?.avatarURL
            await signaling.broadcast(type: "offer", payload: [
                "sdp": .object(["type": .string("offer"), "sdp": .string(offer.sdp)]),
                "callerAvatarUrl": myAvatar.map { .string($0) } ?? .null,
                "senderName": myName.map { .string($0) } ?? .null,
                "callEventId": currentCallEventId.map { .string($0.uuidString.lowercased()) } ?? .null
            ])
            print("[Call] 📤 Offer sent (ready-for-offer or fallback)")
        } catch {
            print("[Call] sendFreshOfferForJoiner failed:", error)
            sdpExchangeStarted = false
        }
    }

    // MARK: - Voice offer/answer

    private func handleVoiceOffer(sdp: String) async {
        // Guard against duplicate offers from retried ready-for-offer broadcasts.
        if sdpExchangeStarted && voiceClient != nil {
            print("[Call] ⚠️ Duplicate offer ignored — SDP exchange already in flight")
            return
        }
        sdpExchangeStarted = true
        // Caller-side retry safety net is no longer needed once we've seen an offer.
        callerFallbackOfferTask?.cancel(); callerFallbackOfferTask = nil
        readyForOfferRetryTask?.cancel(); readyForOfferRetryTask = nil
        // Build the voice client (we're the answerer).
        let voice = WebRTCClient(iceServers: iceServers, includeMicTrack: true)
        wireVoiceCallbacks(voice)
        voiceClient = voice
        if state == .idle {
            // Auto-accepted via accept sheet flow.
            state = .connected
            startedAt = Date()
            ringTimedOut = false
            stopRingTimeouts()
        }
        do {
            try await voice.setRemoteDescription(RTCSessionDescription(type: .offer, sdp: sdp))
            for c in pendingRemoteIce { voice.addIceCandidate(c) }
            pendingRemoteIce.removeAll()
            let answer = try await voice.createAnswer()
            await signaling?.broadcast(type: "answer", payload: [
                "sdp": .object(["type": .string("answer"), "sdp": .string(answer.sdp)])
            ])
            print("[Call] 📥 Offer applied + 📤 answer sent")
        } catch {
            print("[Call] handleVoiceOffer failed:", error)
        }
    }

    private func handleVoiceAnswer(sdp: String) async {
        guard let voice = voiceClient else {
            print("[Call] ⚠️ Answer received but no voiceClient — dropping")
            return
        }
        // Once we've received the answer we know the SDP exchange is complete.
        callerFallbackOfferTask?.cancel(); callerFallbackOfferTask = nil
        do {
            try await voice.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: sdp))
            for c in pendingRemoteIce { voice.addIceCandidate(c) }
            pendingRemoteIce.removeAll()
            state = .connected
            startedAt = Date()
            ringTimedOut = false
            stopRingTimeouts()
            // Tell CallKit we're connected so the green pill appears.
            CallKitService.shared.reportConnected()
            print("[Call] ✅ Answer applied — call is live")
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
            Task { @MainActor in
                guard let self = self else { return }
                if s == .connected {
                    SoundService.shared.stopLooping(.outgoingRing)
                    if self.state != .connected {
                        self.state = .connected
                        self.startedAt = self.startedAt ?? Date()
                        self.ringTimedOut = false
                        self.stopRingTimeouts()
                        CallKitService.shared.reportConnected()
                        print("[Call] ✅ ICE connected — call is live")
                    }
                } else if s == .failed || s == .closed {
                    if self.state == .connected { await self.endCall() }
                }
                // .disconnected can be transient — let WebRTC try to recover
                // (a brief network blip shouldn't kill the call). Mirrors web.
            }
        }
    }

    /// Peer hung up but the call_event is still ongoing for everyone else.
    /// Tear down the per-peer media but keep CallStore alive (web parity).
    private func peerLeftButStayInCall() async {
        voiceClient?.close(); voiceClient = nil
        screenClient?.close(); screenClient = nil
        remoteScreenTrack = nil
        peerIsScreenSharing = false
        peerIsVideoOn = false
        peerIsMuted = false
        pendingRemoteIce.removeAll()
        pendingScreenIce.removeAll()
        SoundService.shared.stopLooping(.outgoingRing)
        // Reset the SDP-exchange flag so a rejoining peer's `ready-for-offer`
        // produces a fresh offer instead of being dropped as a duplicate.
        sdpExchangeStarted = false
        lastJoinerOfferEventId = nil
        lastJoinerOfferSentAt = .distantPast
        // We're now the one waiting, so we're allowed to answer the rejoining
        // peer's `ready-for-offer` even if we originally answered this call.
        peerLeftWaiting = true
        peerAcceptedCallEventId = nil
        // Stay "calling" so UI shows we're waiting alone in the call. The
        // user can either End Call or wait for the peer to rejoin.
        state = .calling
        startedAt = nil
        trace("peerLeft.waitingForRejoin")
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
        let rtcSession = RTCAudioSession.sharedInstance()
        var rtcLocked = false
        do {
            let mode: AVAudioSession.Mode = CallSettings.shared.echoCancellation ? .voiceChat : .default
            // IMPORTANT: do NOT include `.defaultToSpeaker` here. With that
            // option present, `overrideOutputAudioPort(.none)` silently snaps
            // right back to speaker — which is exactly the bug where the
            // in-call speaker button looked dead. Route is now controlled
            // EXCLUSIVELY via overrideOutputAudioPort below.
            let options: AVAudioSession.CategoryOptions = [.allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]
            try session.setCategory(.playAndRecord, mode: mode, options: options)
            try session.setActive(true, options: [])
            if CallSettings.shared.speakerOutput {
                try session.overrideOutputAudioPort(.speaker)
            } else {
                try session.overrideOutputAudioPort(.none)
            }
            rtcSession.lockForConfiguration()
            rtcLocked = true
            rtcSession.isAudioEnabled = true
            rtcSession.unlockForConfiguration()
            rtcLocked = false
        } catch {
            if rtcLocked { rtcSession.unlockForConfiguration() }
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
