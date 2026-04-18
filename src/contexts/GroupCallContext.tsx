/**
 * Group Voice Call Context — N-peer audio mesh.
 *
 * Architecture:
 *   - One supabase realtime channel per call: `group-call:{conversationId}`
 *   - Each peer maintains a Map<peerId, RTCPeerConnection> — full mesh.
 *   - Connection algorithm (deterministic, avoids glare):
 *       * On joining a call, broadcast a `peer-join` event with our user_id.
 *       * Every existing peer that hears `peer-join` checks: do I have a higher
 *         user_id than the joiner? If YES, I create the offer to the joiner.
 *         The joiner is passive and just waits for offers.
 *       * This way, only one side initiates per pair → no glare.
 *   - When a peer leaves, they broadcast `peer-leave` and others tear down
 *     the matching PC.
 *
 * Audio levels: per-peer monotonic monitoring via WebAudio AnalyserNodes,
 * surfaced as a Map<peerId, level> for the UI to ring speaking participants.
 *
 * This subsystem is intentionally separate from the 1-on-1 VoiceContext to
 * avoid destabilising the very tuned 1-on-1 signaling/ICE flow. Both can
 * coexist in the provider tree but the UI ensures a user is only in one
 * call type at a time.
 */
import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playSound, playLooping, stopLooping } from "@/lib/sounds";
import { startNativeWindowAudioStream } from "@/lib/nativeWindowAudio";

export interface GroupPeer {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  /** Peer-side mute (best-effort, broadcast over the signaling channel) */
  isMuted: boolean;
  /** Audio level 0..100 — monitored locally from their inbound audio track. */
  audioLevel: number;
  /** Inbound camera stream (if peer has video on). */
  videoStream?: MediaStream | null;
  /** Inbound screen-share stream (if peer is sharing). */
  screenStream?: MediaStream | null;
  /** Peer-side video toggle (broadcast). */
  isVideoOn: boolean;
  /** Peer-side screenshare toggle (broadcast). */
  isScreenSharing: boolean;
}

export interface GroupActiveCall {
  conversationId: string;
  conversationName: string;
  /** When the LOCAL user joined the call. */
  joinedAt: number;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
}

interface GroupIncomingCall {
  conversationId: string;
  conversationName: string;
  callerId: string;
  callerName: string;
  callerAvatarUrl?: string;
  callEventId?: string;
}

interface GroupCallContextType {
  activeCall: GroupActiveCall | null;
  incomingCall: GroupIncomingCall | null;
  peers: GroupPeer[];
  /** Round-trip ping (ms) — averaged across active peer connections. */
  ping: number;
  startCall: (conversationId: string, conversationName: string, memberIds: string[]) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: (sourceId?: string) => Promise<void>;
  /** Local camera stream (for self-tile preview). */
  localVideoStream: MediaStream | null;
  /** Local screenshare stream (for self-tile preview). */
  localScreenStream: MediaStream | null;
  /** Audio level of the LOCAL mic (0-100). */
  selfAudioLevel: number;
}

const GroupCallContext = createContext<GroupCallContextType>({} as GroupCallContextType);
export const useGroupCall = () => useContext(GroupCallContext);

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const GroupCallProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [activeCall, setActiveCall] = useState<GroupActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<GroupIncomingCall | null>(null);
  const [peers, setPeers] = useState<GroupPeer[]>([]);
  const [selfAudioLevel, setSelfAudioLevel] = useState(0);
  const [ping, setPing] = useState(0);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);

  // ICE servers — fetched on mount via the same edge function the 1-on-1 voice uses
  const iceServersRef = useRef<RTCIceServer[]>(STUN_SERVERS);

  // Per-peer RTCPeerConnection map
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Per-peer queued ICE candidates (received before remote-description was set)
  const queuedIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteDescSetRef = useRef<Map<string, boolean>>(new Map());
  // Per-peer audio analyser cleanup
  const audioCleanupRef = useRef<Map<string, () => void>>(new Map());
  // Perfect-negotiation per-peer state (to handle simultaneous offers cleanly)
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  // Per-peer video & screen RTCRtpSender refs (to enable replace/remove tracks for renegotiation)
  const videoSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());
  const screenSendersRef = useRef<Map<string, RTCRtpSender>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  // Local camera + screenshare track refs
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const localScreenTrackRef = useRef<MediaStreamTrack | null>(null);
  /** Cleanup fn for an active native (WASAPI) per-window audio capture, if any. */
  const nativeWindowAudioStopRef = useRef<(() => void) | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callEventIdRef = useRef<string | null>(null);
  const callConvIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const selfAnimRef = useRef<number>(0);
  const profileCacheRef = useRef<Map<string, { display_name: string; avatar_url: string | null }>>(new Map());
  const preMuteRef = useRef<boolean>(false);

  // Fetch ICE servers (same as 1-on-1)
  useEffect(() => {
    if (!user) return;
    supabase.functions.invoke("get-turn-credentials").then(({ data, error }) => {
      if (!error && data?.iceServers) iceServersRef.current = data.iceServers;
    });
  }, [user]);

  /** Load and cache a profile (display_name + avatar) by user_id. */
  const loadProfile = useCallback(async (userId: string) => {
    if (profileCacheRef.current.has(userId)) return profileCacheRef.current.get(userId)!;
    const { data } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", userId)
      .maybeSingle();
    const p = { display_name: data?.display_name || "Member", avatar_url: data?.avatar_url || null };
    profileCacheRef.current.set(userId, p);
    return p;
  }, []);

  /** Start audio level monitoring for the local mic. */
  const startSelfMonitor = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastSelf = 0;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const next = (avg / 255) * 100;
        if (Math.abs(next - lastSelf) > 1) {
          lastSelf = next;
          setSelfAudioLevel(next);
        }
        selfAnimRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn("[GroupCall] Failed to start self audio monitor:", e);
    }
  }, []);

  const stopSelfMonitor = useCallback(() => {
    cancelAnimationFrame(selfAnimRef.current);
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setSelfAudioLevel(0);
  }, []);

  /** Start audio-level monitoring for a remote peer's inbound stream. */
  const startPeerMonitor = useCallback((peerId: string, stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      let lastLevel = 0;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const next = (avg / 255) * 100;
        // Only update peer state when level meaningfully changes — without this
        // every PeerTile re-renders 60×/s during silence.
        if (Math.abs(next - lastLevel) > 1) {
          lastLevel = next;
          setPeers(prev => prev.map(p => p.userId === peerId ? { ...p, audioLevel: next } : p));
        }
        raf = requestAnimationFrame(tick);
      };
      tick();
      audioCleanupRef.current.set(peerId, () => {
        cancelAnimationFrame(raf);
        ctx.close().catch(() => {});
      });
    } catch (e) {
      console.warn("[GroupCall] Peer audio monitor failed:", e);
    }
  }, []);

  /** Tear down the connection to a specific peer. */
  const removePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.close();
      pcsRef.current.delete(peerId);
    }
    queuedIceRef.current.delete(peerId);
    remoteDescSetRef.current.delete(peerId);
    audioCleanupRef.current.get(peerId)?.();
    audioCleanupRef.current.delete(peerId);
    makingOfferRef.current.delete(peerId);
    ignoreOfferRef.current.delete(peerId);
    videoSendersRef.current.delete(peerId);
    screenSendersRef.current.delete(peerId);
    setPeers(prev => prev.filter(p => p.userId !== peerId));
    // Remove that peer's <audio> element
    document.querySelectorAll<HTMLAudioElement>(`audio[data-group-peer="${peerId}"]`).forEach(el => {
      el.pause(); el.srcObject = null; el.remove();
    });
  }, []);

  /**
   * Create (or reuse) an RTCPeerConnection for a specific peer and wire up
   * track / ICE handling. Used by BOTH offerer and answerer.
   *
   * Track routing: WebRTC's stream `id` is preserved across peers, so we let
   * the SENDER label its outbound video/screen streams with a known id
   * pattern (`cubbly-video-<userId>` / `cubbly-screen-<userId>`) that the
   * receiver inspects in `ontrack` to decide whether the inbound video track
   * is camera or screenshare.
   */
  const ensurePc = useCallback((peerId: string): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 4,
    });
    pcsRef.current.set(peerId, pc);
    makingOfferRef.current.set(peerId, false);
    ignoreOfferRef.current.set(peerId, false);

    // Add our local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }
    // If we already have local video / screen on, add those too (so a NEW peer
    // joining mid-call still sees us)
    if (localVideoTrackRef.current && user) {
      const videoStream = new MediaStream([localVideoTrackRef.current]);
      // Use a discoverable stream id so receivers can route correctly
      Object.defineProperty(videoStream, "id", { value: `cubbly-video-${user.id}` });
      const sender = pc.addTrack(localVideoTrackRef.current, videoStream);
      videoSendersRef.current.set(peerId, sender);
    }
    if (localScreenTrackRef.current && user) {
      const screenStream = new MediaStream([localScreenTrackRef.current]);
      Object.defineProperty(screenStream, "id", { value: `cubbly-screen-${user.id}` });
      const sender = pc.addTrack(localScreenTrackRef.current, screenStream);
      screenSendersRef.current.set(peerId, sender);
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (event.track.kind === "audio") {
        // Lower jitter buffer for snappier real-time feel
        try { (event.receiver as any).playoutDelayHint = 0.05; } catch { /* ignore */ }
        let audioEl = document.querySelector<HTMLAudioElement>(`audio[data-group-peer="${peerId}"]`);
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.dataset.groupPeer = peerId;
          audioEl.autoplay = true;
          document.body.appendChild(audioEl);
        }
        audioEl.srcObject = stream;
        audioEl.play().catch(() => {});
        // CRITICAL: tear down any prior analyser BEFORE starting the new one,
        // otherwise track replaces (renegotiation / camera toggle / brief
        // network drop) leak rAF loops and the peer ring freezes at 0.
        const prevCleanup = audioCleanupRef.current.get(peerId);
        if (prevCleanup) {
          try { prevCleanup(); } catch {}
          audioCleanupRef.current.delete(peerId);
        }
        // Reset ring to 0 visually until the new analyser ticks
        setPeers(prev => prev.map(p => p.userId === peerId ? { ...p, audioLevel: 0 } : p));
        startPeerMonitor(peerId, stream);
        return;
      }
      if (event.track.kind === "video") {
        // Decide camera vs screen by stream id label.
        const isScreen = stream?.id?.startsWith("cubbly-screen-");
        const applyLiveVideoState = () => {
          setPeers(prev => prev.map(p => p.userId === peerId
            ? (isScreen
                ? { ...p, screenStream: stream, isScreenSharing: true }
                : { ...p, videoStream: stream, isVideoOn: true })
            : p));
        };
        const clearVideoState = () => {
          setPeers(prev => prev.map(p => p.userId === peerId
            ? (isScreen
                ? { ...p, screenStream: null, isScreenSharing: false }
                : { ...p, videoStream: null, isVideoOn: false })
            : p));
        };

        // CRITICAL: newly-negotiated camera tracks often arrive muted first and
        // only flip live on `unmute` once frames start. Treating `mute` as
        // teardown makes the tile disappear forever for everyone else.
        event.track.addEventListener("ended", clearVideoState);
        event.track.addEventListener("unmute", applyLiveVideoState);

        if (!event.track.muted) {
          applyLiveVideoState();
        }
        return;
      }
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate || !channelRef.current || !user) return;
      channelRef.current.send({
        type: "broadcast",
        event: "group-signal",
        payload: {
          type: "ice-candidate",
          fromUserId: user.id,
          toUserId: peerId,
          candidate: event.candidate.toJSON(),
        },
      });
    };

    // Perfect-negotiation: triggered automatically when we add/remove tracks
    pc.onnegotiationneeded = async () => {
      if (!channelRef.current || !user) return;
      try {
        makingOfferRef.current.set(peerId, true);
        await pc.setLocalDescription();
        channelRef.current.send({
          type: "broadcast",
          event: "group-signal",
          payload: {
            type: "offer",
            fromUserId: user.id,
            toUserId: peerId,
            sdp: pc.localDescription,
          },
        });
      } catch (e) {
        console.error("[GroupCall] negotiationneeded failed:", e);
      } finally {
        makingOfferRef.current.set(peerId, false);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        removePeer(peerId);
      }
    };

    return pc;
  }, [user, startPeerMonitor, removePeer]);

  /** Build a peer entry in `peers` (lazy — avoids duplicates). */
  const ensurePeerEntry = useCallback(async (peerId: string) => {
    setPeers(prev => prev.some(p => p.userId === peerId) ? prev : [...prev, { userId: peerId, displayName: "…", isMuted: false, audioLevel: 0, isVideoOn: false, isScreenSharing: false, videoStream: null, screenStream: null }]);
    const profile = await loadProfile(peerId);
    setPeers(prev => prev.map(p => p.userId === peerId
      ? { ...p, displayName: profile.display_name, avatarUrl: profile.avatar_url }
      : p
    ));
  }, [loadProfile]);

  /**
   * Start a brand-new group call. Inserts a call_event, then broadcasts a
   * group-incoming-call notification to every member's personal channel.
   * Joins the realtime call channel and announces presence.
   */
  const startCall = useCallback(async (conversationId: string, conversationName: string, memberIds: string[]) => {
    if (!user) return;
    if (activeCall) {
      console.warn("[GroupCall] Already in a call");
      return;
    }
    console.log("[GroupCall] 📞 Starting group call in", conversationId, "with", memberIds.length, "members");

    // Get mic
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch (e) {
      console.error("[GroupCall] Failed to get mic:", e);
      return;
    }
    localStreamRef.current = stream;
    startSelfMonitor(stream);

    // Insert call event row
    const callEventId = crypto.randomUUID();
    callEventIdRef.current = callEventId;
    callConvIdRef.current = conversationId;
    await supabase.from("call_events").insert({
      id: callEventId,
      conversation_id: conversationId,
      caller_id: user.id,
      state: "ongoing",
    } as any);

    // Insert participant row for self
    await supabase.from("call_participants").insert({
      call_event_id: callEventId,
      user_id: user.id,
      is_muted: false,
      is_deafened: false,
    } as any);

    setActiveCall({ conversationId, conversationName, joinedAt: Date.now(), isMuted: false, isDeafened: false, isVideoOn: false, isScreenSharing: false });
    playSound("message", { volume: 0.4 });

    // Subscribe to call channel
    await joinCallChannel(conversationId);

    // Notify each member individually via their global channel
    let callerAvatarUrl: string | undefined;
    try {
      const { data } = await supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle();
      callerAvatarUrl = data?.avatar_url || undefined;
    } catch {}
    for (const mid of memberIds) {
      if (mid === user.id) continue;
      const ch = supabase.channel(`voice-global:${mid}`);
      ch.subscribe(status => {
        if (status === "SUBSCRIBED") {
          ch.send({
            type: "broadcast",
            event: "group-incoming-call",
            payload: {
              targetId: mid,
              conversationId,
              conversationName,
              callerId: user.id,
              callerName: user.user_metadata?.display_name || "Member",
              callerAvatarUrl,
              callEventId,
            },
          });
          setTimeout(() => supabase.removeChannel(ch), 3000);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeCall]);

  /**
   * Subscribe to the per-conversation broadcast channel and wire up signaling.
   * Announces our presence so existing peers can offer to us.
   */
  const joinCallChannel = useCallback(async (conversationId: string): Promise<void> => {
    if (!user) return;
    return new Promise((resolve, reject) => {
      const channelName = `group-call:${conversationId}`;
      const channel = supabase.channel(channelName);

      channel.on("broadcast", { event: "group-signal" }, async ({ payload }) => {
        if (payload.fromUserId === user.id) return; // ignore self
        if (payload.toUserId && payload.toUserId !== user.id) return; // not addressed to us

        if (payload.type === "peer-join") {
          // A new peer joined. The peer with the higher user_id offers (deterministic, avoids glare).
          await ensurePeerEntry(payload.fromUserId);
          if (user.id > payload.fromUserId) {
            // We offer to the new joiner
            const pc = ensurePc(payload.fromUserId);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              channel.send({
                type: "broadcast",
                event: "group-signal",
                payload: { type: "offer", fromUserId: user.id, toUserId: payload.fromUserId, sdp: offer },
              });
            } catch (e) {
              console.error("[GroupCall] Failed to create offer for new peer:", e);
            }
          }
          return;
        }

        if (payload.type === "peer-leave") {
          removePeer(payload.fromUserId);
          return;
        }

        if (payload.type === "offer") {
          await ensurePeerEntry(payload.fromUserId);
          const pc = ensurePc(payload.fromUserId);
          // Perfect-negotiation collision check: if WE made an offer too,
          // the peer with the lower id is "polite" and rolls back.
          const polite = user.id < payload.fromUserId;
          const offerCollision = makingOfferRef.current.get(payload.fromUserId)
            || pc.signalingState !== "stable";
          const ignore = !polite && offerCollision;
          ignoreOfferRef.current.set(payload.fromUserId, ignore);
          if (ignore) return;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSetRef.current.set(payload.fromUserId, true);
            const queued = queuedIceRef.current.get(payload.fromUserId) || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            queuedIceRef.current.delete(payload.fromUserId);

            await pc.setLocalDescription();
            channel.send({
              type: "broadcast",
              event: "group-signal",
              payload: { type: "answer", fromUserId: user.id, toUserId: payload.fromUserId, sdp: pc.localDescription },
            });
          } catch (e) {
            console.error("[GroupCall] Failed to handle offer:", e);
          }
          return;
        }

        if (payload.type === "answer") {
          const pc = pcsRef.current.get(payload.fromUserId);
          if (!pc) return;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSetRef.current.set(payload.fromUserId, true);
            const queued = queuedIceRef.current.get(payload.fromUserId) || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            queuedIceRef.current.delete(payload.fromUserId);
          } catch (e) {
            console.error("[GroupCall] Failed to handle answer:", e);
          }
          return;
        }

        if (payload.type === "ice-candidate") {
          const pc = pcsRef.current.get(payload.fromUserId);
          if (pc && remoteDescSetRef.current.get(payload.fromUserId)) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
          } else {
            const queue = queuedIceRef.current.get(payload.fromUserId) || [];
            queue.push(payload.candidate);
            queuedIceRef.current.set(payload.fromUserId, queue);
          }
          return;
        }

        if (payload.type === "peer-mute") {
          setPeers(prev => prev.map(p => p.userId === payload.fromUserId ? { ...p, isMuted: !!payload.isMuted } : p));
          return;
        }

        if (payload.type === "peer-video") {
          // If they turned video off, clear the stream from our local state
          setPeers(prev => prev.map(p => p.userId === payload.fromUserId
            ? { ...p, isVideoOn: !!payload.isVideoOn, videoStream: payload.isVideoOn ? p.videoStream : null }
            : p));
          return;
        }

        if (payload.type === "peer-screen") {
          setPeers(prev => prev.map(p => p.userId === payload.fromUserId
            ? { ...p, isScreenSharing: !!payload.isScreenSharing, screenStream: payload.isScreenSharing ? p.screenStream : null }
            : p));
          return;
        }
      });

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          // Announce our presence so existing peers offer to us
          channel.send({
            type: "broadcast",
            event: "group-signal",
            payload: { type: "peer-join", fromUserId: user.id },
          });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`Group channel subscribe failed: ${status}`));
        }
      });
    });
  }, [user, ensurePc, ensurePeerEntry, removePeer]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !user) return;
    const inc = incomingCall;
    setIncomingCall(null);
    stopLooping("incomingCall");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      console.error("[GroupCall] Mic permission denied:", e);
      return;
    }
    localStreamRef.current = stream;
    startSelfMonitor(stream);

    callEventIdRef.current = inc.callEventId || null;
    callConvIdRef.current = inc.conversationId;

    setActiveCall({
      conversationId: inc.conversationId,
      conversationName: inc.conversationName,
      joinedAt: Date.now(),
      isMuted: false,
      isDeafened: false,
      isVideoOn: false,
      isScreenSharing: false,
    });
    playSound("message", { volume: 0.4 });

    // Insert participant row
    if (inc.callEventId) {
      await supabase.from("call_participants").insert({
        call_event_id: inc.callEventId,
        user_id: user.id,
        is_muted: false,
        is_deafened: false,
      } as any);
    }

    await joinCallChannel(inc.conversationId);
  }, [incomingCall, user, joinCallChannel, startSelfMonitor]);

  const declineCall = useCallback(() => {
    setIncomingCall(null);
    stopLooping("incomingCall");
  }, []);

  /** Leave the call & tear everything down. */
  const leaveCall = useCallback(() => {
    console.log("[GroupCall] 👋 Leaving call");
    // Broadcast leave so peers can drop us
    if (channelRef.current && user) {
      channelRef.current.send({
        type: "broadcast",
        event: "group-signal",
        payload: { type: "peer-leave", fromUserId: user.id },
      });
    }
    // Mark participant left
    if (callEventIdRef.current && user) {
      const left = new Date().toISOString();
      supabase
        .from("call_participants")
        .update({ left_at: left })
        .eq("call_event_id", callEventIdRef.current)
        .eq("user_id", user.id)
        .is("left_at", null)
        .then(() => {});
    }
    // Tear down all PCs
    for (const [peerId] of pcsRef.current) {
      removePeer(peerId);
    }
    pcsRef.current.clear();
    queuedIceRef.current.clear();
    remoteDescSetRef.current.clear();

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    localVideoTrackRef.current?.stop();
    localVideoTrackRef.current = null;
    setLocalVideoStream(null);
    localScreenTrackRef.current?.stop();
    localScreenTrackRef.current = null;
    setLocalScreenStream(null);
    // Tear down native per-window audio if it was active
    if (nativeWindowAudioStopRef.current) {
      try { nativeWindowAudioStopRef.current(); } catch {}
      nativeWindowAudioStopRef.current = null;
    }
    videoSendersRef.current.clear();
    screenSendersRef.current.clear();
    stopSelfMonitor();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (activeCall) playSound("leaveCall", { volume: 0.4 });
    setActiveCall(null);
    setPeers([]);
    setPing(0);
    callEventIdRef.current = null;
    callConvIdRef.current = null;
  }, [user, removePeer, stopSelfMonitor, activeCall]);

  const toggleMute = useCallback(() => {
    setActiveCall(prev => {
      if (!prev) return null;
      const newMuted = !prev.isMuted;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      // Broadcast to peers
      if (channelRef.current && user) {
        channelRef.current.send({
          type: "broadcast",
          event: "group-signal",
          payload: { type: "peer-mute", fromUserId: user.id, isMuted: newMuted },
        });
      }
      // DB sync
      if (callEventIdRef.current && user) {
        supabase.from("call_participants")
          .update({ is_muted: newMuted })
          .eq("call_event_id", callEventIdRef.current)
          .eq("user_id", user.id)
          .is("left_at", null)
          .then(() => {});
      }
      return { ...prev, isMuted: newMuted };
    });
  }, [user]);

  const toggleDeafen = useCallback(() => {
    setActiveCall(prev => {
      if (!prev) return null;
      const newDeafened = !prev.isDeafened;
      // Mute all peer <audio> elements
      document.querySelectorAll<HTMLAudioElement>("audio[data-group-peer]").forEach(el => {
        el.muted = newDeafened;
      });
      let nextMuted: boolean;
      if (newDeafened) {
        preMuteRef.current = prev.isMuted;
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = false; });
        nextMuted = true;
      } else {
        nextMuted = preMuteRef.current;
        localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !nextMuted; });
      }
      if (channelRef.current && user) {
        channelRef.current.send({
          type: "broadcast",
          event: "group-signal",
          payload: { type: "peer-mute", fromUserId: user.id, isMuted: nextMuted },
        });
      }
      if (callEventIdRef.current && user) {
        supabase.from("call_participants")
          .update({ is_muted: nextMuted, is_deafened: newDeafened })
          .eq("call_event_id", callEventIdRef.current)
          .eq("user_id", user.id)
          .is("left_at", null)
          .then(() => {});
      }
      return { ...prev, isMuted: nextMuted, isDeafened: newDeafened };
    });
  }, [user]);

  /**
   * Toggle local camera. When turning on, request a camera stream and add the
   * track to every existing peer connection (which triggers onnegotiationneeded
   * → renegotiation). When turning off, replace the track with null on each
   * sender, stop the local track, and broadcast the new state.
   */
  const toggleVideo = useCallback(async () => {
    if (!activeCall || !user) return;
    if (!activeCall.isVideoOn) {
      // Turn ON
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
          audio: false,
        });
      } catch (e) {
        console.error("[GroupCall] Camera permission denied:", e);
        return;
      }
      const track = stream.getVideoTracks()[0];
      localVideoTrackRef.current = track;
      setLocalVideoStream(stream);

      // Add the track to every peer connection
      for (const [peerId, pc] of pcsRef.current) {
        const labeledStream = new MediaStream([track]);
        Object.defineProperty(labeledStream, "id", { value: `cubbly-video-${user.id}` });
        const sender = pc.addTrack(track, labeledStream);
        videoSendersRef.current.set(peerId, sender);
      }
      track.onended = () => { toggleVideo(); }; // safety: hardware unplugged

      setActiveCall(prev => prev ? { ...prev, isVideoOn: true } : null);
      channelRef.current?.send({
        type: "broadcast",
        event: "group-signal",
        payload: { type: "peer-video", fromUserId: user.id, isVideoOn: true },
      });
    } else {
      // Turn OFF
      const track = localVideoTrackRef.current;
      if (track) track.stop();
      localVideoTrackRef.current = null;
      setLocalVideoStream(null);
      // Remove sender from each pc — replaceTrack(null) keeps the transceiver
      // open for fast re-enable later.
      for (const [peerId, sender] of videoSendersRef.current) {
        try { await sender.replaceTrack(null); } catch {}
        const pc = pcsRef.current.get(peerId);
        if (pc) {
          try { pc.removeTrack(sender); } catch {}
        }
      }
      videoSendersRef.current.clear();
      setActiveCall(prev => prev ? { ...prev, isVideoOn: false } : null);
      channelRef.current?.send({
        type: "broadcast",
        event: "group-signal",
        payload: { type: "peer-video", fromUserId: user.id, isVideoOn: false },
      });
    }
  }, [activeCall, user]);

  /**
   * Toggle screen share. Uses getDisplayMedia in browsers; in Electron it
   * accepts an optional sourceId from the screen picker. Auto-disables when
   * the user clicks "Stop sharing" in the OS prompt.
   */
  const toggleScreenShare = useCallback(async (sourceId?: string) => {
    if (!activeCall || !user) return;
    if (!activeCall.isScreenSharing) {
      let stream: MediaStream;
      const wantAudio = true;
      // High-quality stereo audio constraints — disable voice DSP so music/games sound right.
      const screenAudioConstraints: any = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      };
      try {
        const api = (window as any).electronAPI;
        if (api?.isElectron) {
          let chosenId = sourceId;
          if (!chosenId && api?.getDesktopSources) {
            const sources = await api.getDesktopSources();
            chosenId = (sources.find((s: any) => s.id.startsWith("screen:")) || sources[0])?.id;
          }
          if (!chosenId) throw new Error("No screen sources available");

          // ---- Per-source audio strategy (Electron) -----------------------
          // Entire-screen pick → Chromium 'loopback' (system mix).
          // Window/tab pick → native WASAPI process loopback addon (per-app).
          // NEVER hand window/tab to Chromium loopback — leaks all system audio.
          const isScreenPick = typeof chosenId === "string" && chosenId.startsWith("screen:");
          const nativeAvailable = api?.isWindowAudioCaptureAvailable
            ? await api.isWindowAudioCaptureAvailable()
            : false;
          const useChromiumLoopback = wantAudio && isScreenPick;
          const useNativeWindowAudio = wantAudio && !isScreenPick && nativeAvailable;

          await api.setSelectedShareSource(chosenId, useChromiumLoopback);
          try {
            stream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: useChromiumLoopback ? screenAudioConstraints : false,
            } as any);
          } finally {
            try { await api.clearSelectedShareSource?.(); } catch {}
          }

          // Window/tab + native addon → start per-process WASAPI capture.
          if (useNativeWindowAudio && chosenId) {
            try {
              const { audioTrack, stop } = await startNativeWindowAudioStream(chosenId);
              if (audioTrack) {
                stream.addTrack(audioTrack);
                nativeWindowAudioStopRef.current = stop;
                console.log("[GroupCall] 🎯 Native per-window audio attached to share");
              }
            } catch (e) {
              console.warn("[GroupCall] Native per-window audio failed, share will be video-only:", e);
            }
          }

          if (wantAudio && !useChromiumLoopback && !useNativeWindowAudio) {
            console.warn("[GroupCall] Window/tab share-audio requested but native addon unavailable — share is video-only.");
          }
          if (useChromiumLoopback && stream.getAudioTracks().length === 0) {
            console.warn("[GroupCall] Electron screen-share audio requested but no audio track produced");
          }
        } else {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: wantAudio ? ({ ...screenAudioConstraints, systemAudio: "include" } as any) : false,
          } as any);
        }
      } catch (e) {
        console.error("[GroupCall] Screen share denied:", e);
        return;
      }
      const track = stream.getVideoTracks()[0];
      localScreenTrackRef.current = track;
      setLocalScreenStream(stream);

      const applyHQ = async (sender: RTCRtpSender, kind: "video" | "audio") => {
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          if (kind === "video") {
            params.encodings[0].maxBitrate = 12_000_000;
            (params.encodings[0] as any).scaleResolutionDownBy = 1;
            (params as any).degradationPreference = "maintain-resolution";
          } else {
            params.encodings[0].maxBitrate = 256_000;
          }
          (params.encodings[0] as any).networkPriority = "high";
          (params.encodings[0] as any).priority = "high";
          await sender.setParameters(params);
        } catch {}
      };

      for (const [peerId, pc] of pcsRef.current) {
        const labeledStream = new MediaStream([track]);
        Object.defineProperty(labeledStream, "id", { value: `cubbly-screen-${user.id}` });
        const sender = pc.addTrack(track, labeledStream);
        screenSendersRef.current.set(peerId, sender);
        applyHQ(sender, "video");
        stream.getAudioTracks().forEach((atrack) => {
          try {
            const aSender = pc.addTrack(atrack, labeledStream);
            applyHQ(aSender, "audio");
          } catch (e) { console.warn("[GroupCall] add screen audio failed:", e); }
        });
      }
      track.onended = () => { toggleScreenShare(); };

      setActiveCall(prev => prev ? { ...prev, isScreenSharing: true } : null);
      channelRef.current?.send({
        type: "broadcast",
        event: "group-signal",
        payload: { type: "peer-screen", fromUserId: user.id, isScreenSharing: true },
      });
    } else {
      const track = localScreenTrackRef.current;
      if (track) track.stop();
      localScreenTrackRef.current = null;
      setLocalScreenStream(null);
      // Tear down native per-window audio if it was active
      if (nativeWindowAudioStopRef.current) {
        try { nativeWindowAudioStopRef.current(); } catch {}
        nativeWindowAudioStopRef.current = null;
      }
      for (const [peerId, sender] of screenSendersRef.current) {
        try { await sender.replaceTrack(null); } catch {}
        const pc = pcsRef.current.get(peerId);
        if (pc) { try { pc.removeTrack(sender); } catch {} }
      }
      screenSendersRef.current.clear();
      setActiveCall(prev => prev ? { ...prev, isScreenSharing: false } : null);
      channelRef.current?.send({
        type: "broadcast",
        event: "group-signal",
        payload: { type: "peer-screen", fromUserId: user.id, isScreenSharing: false },
      });
    }
  }, [activeCall, user]);

  // Listen for global incoming group calls
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`voice-global:${user.id}`);
    ch.on("broadcast", { event: "group-incoming-call" }, ({ payload }) => {
      if (payload.targetId !== user.id) return;
      if (activeCall) return; // already in a call
      setIncomingCall({
        conversationId: payload.conversationId,
        conversationName: payload.conversationName || "Group Call",
        callerId: payload.callerId,
        callerName: payload.callerName || "Member",
        callerAvatarUrl: payload.callerAvatarUrl,
        callEventId: payload.callEventId,
      });
      playLooping("incomingCall", { volume: 0.5 });
    });
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, activeCall]);

  // Auto-stop incoming ringtone after 45s
  useEffect(() => {
    if (!incomingCall) return;
    const t = setTimeout(() => stopLooping("incomingCall"), 45_000);
    return () => clearTimeout(t);
  }, [incomingCall?.callEventId]);

  // Average ping across active peer connections
  useEffect(() => {
    if (!activeCall) { setPing(0); return; }
    const interval = setInterval(async () => {
      const rtts: number[] = [];
      for (const [, pc] of pcsRef.current) {
        try {
          const stats = await pc.getStats();
          stats.forEach((report: any) => {
            if (report.type === "candidate-pair" && report.state === "succeeded" && typeof report.currentRoundTripTime === "number") {
              rtts.push(report.currentRoundTripTime * 1000);
            }
          });
        } catch {}
      }
      if (rtts.length > 0) {
        setPing(Math.round(rtts.reduce((s, v) => s + v, 0) / rtts.length));
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeCall?.conversationId]);

  return (
    <GroupCallContext.Provider value={{
      activeCall, incomingCall, peers, ping,
      startCall, acceptCall, declineCall, leaveCall,
      toggleMute, toggleDeafen, toggleVideo, toggleScreenShare,
      localVideoStream, localScreenStream, selfAudioLevel,
    }}>
      {children}
    </GroupCallContext.Provider>
  );
};
