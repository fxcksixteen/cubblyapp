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

export interface GroupPeer {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  /** Peer-side mute (best-effort, broadcast over the signaling channel) */
  isMuted: boolean;
  /** Audio level 0..100 — monitored locally from their inbound audio track. */
  audioLevel: number;
}

export interface GroupActiveCall {
  conversationId: string;
  conversationName: string;
  /** When the LOCAL user joined the call. */
  joinedAt: number;
  isMuted: boolean;
  isDeafened: boolean;
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

  // ICE servers — fetched on mount via the same edge function the 1-on-1 voice uses
  const iceServersRef = useRef<RTCIceServer[]>(STUN_SERVERS);

  // Per-peer RTCPeerConnection map
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Per-peer queued ICE candidates (received before remote-description was set)
  const queuedIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteDescSetRef = useRef<Map<string, boolean>>(new Map());
  // Per-peer audio analyser cleanup
  const audioCleanupRef = useRef<Map<string, () => void>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
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
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setSelfAudioLevel((avg / 255) * 100);
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
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setPeers(prev => prev.map(p => p.userId === peerId ? { ...p, audioLevel: (avg / 255) * 100 } : p));
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
    setPeers(prev => prev.filter(p => p.userId !== peerId));
    // Remove that peer's <audio> element
    document.querySelectorAll<HTMLAudioElement>(`audio[data-group-peer="${peerId}"]`).forEach(el => {
      el.pause(); el.srcObject = null; el.remove();
    });
  }, []);

  /**
   * Create (or reuse) an RTCPeerConnection for a specific peer and wire up
   * track / ICE handling. Used by BOTH offerer and answerer.
   */
  const ensurePc = useCallback((peerId: string): RTCPeerConnection => {
    const existing = pcsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current, iceTransportPolicy: "all" });
    pcsRef.current.set(peerId, pc);

    // Add our local audio tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.ontrack = (event) => {
      if (event.track.kind !== "audio") return;
      const stream = event.streams[0];
      // Create / replace the <audio> element for this peer
      let audioEl = document.querySelector<HTMLAudioElement>(`audio[data-group-peer="${peerId}"]`);
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.dataset.groupPeer = peerId;
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
      }
      audioEl.srcObject = stream;
      audioEl.play().catch(() => {});
      // Audio level monitoring
      audioCleanupRef.current.get(peerId)?.();
      startPeerMonitor(peerId, stream);
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

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
        removePeer(peerId);
      }
    };

    return pc;
  }, [user, startPeerMonitor, removePeer]);

  /** Build a peer entry in `peers` (lazy — avoids duplicates). */
  const ensurePeerEntry = useCallback(async (peerId: string) => {
    setPeers(prev => prev.some(p => p.userId === peerId) ? prev : [...prev, { userId: peerId, displayName: "…", isMuted: false, audioLevel: 0 }]);
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

    setActiveCall({ conversationId, conversationName, joinedAt: Date.now(), isMuted: false, isDeafened: false });
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
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSetRef.current.set(payload.fromUserId, true);
            // Flush any queued ICE
            const queued = queuedIceRef.current.get(payload.fromUserId) || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            queuedIceRef.current.delete(payload.fromUserId);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            channel.send({
              type: "broadcast",
              event: "group-signal",
              payload: { type: "answer", fromUserId: user.id, toUserId: payload.fromUserId, sdp: answer },
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
      toggleMute, toggleDeafen, selfAudioLevel,
    }}>
      {children}
    </GroupCallContext.Provider>
  );
};
