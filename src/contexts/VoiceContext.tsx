import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface VoiceSettings {
  inputDeviceId: string;
  outputDeviceId: string;
  inputVolume: number;
  outputVolume: number;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  autoSensitivity: boolean;
  sensitivityThreshold: number;
  serverRegion: string; // "auto" or specific region
}

const DEFAULT_SETTINGS: VoiceSettings = {
  inputDeviceId: "default",
  outputDeviceId: "default",
  inputVolume: 100,
  outputVolume: 100,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  autoSensitivity: true,
  sensitivityThreshold: 50,
  serverRegion: "auto",
};

export type CallState = "calling" | "ringing" | "connected" | "ended";

export interface ActiveCall {
  conversationId: string;
  peerId: string;
  peerName: string;
  state: CallState;
  startedAt?: number;
  isMuted: boolean;
  isDeafened: boolean;
}

export interface CallEvent {
  id: string;
  conversationId: string;
  state: "ongoing" | "ended" | "missed";
  startedAt: string;
  endedAt?: string;
}

export const SERVER_REGIONS = [
  { id: "auto", label: "Automatic", description: "Best region for lowest ping" },
  { id: "us-east", label: "US East", description: "New York" },
  { id: "us-west", label: "US West", description: "San Francisco" },
  { id: "eu-west", label: "Europe West", description: "Amsterdam" },
  { id: "eu-central", label: "Europe Central", description: "Frankfurt" },
  { id: "asia-east", label: "Asia East", description: "Tokyo" },
  { id: "asia-south", label: "Asia South", description: "Singapore" },
  { id: "south-america", label: "South America", description: "São Paulo" },
  { id: "australia", label: "Australia", description: "Sydney" },
];

// TURN servers for NAT traversal + STUN fallbacks
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // Free TURN servers from Open Relay (metered.ca)
  { urls: "turn:a.relay.metered.ca:80", username: "e8dd65d92aee94de76f5c205", credential: "0YpDMwFOjVPxbSGO" },
  { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "e8dd65d92aee94de76f5c205", credential: "0YpDMwFOjVPxbSGO" },
  { urls: "turn:a.relay.metered.ca:443", username: "e8dd65d92aee94de76f5c205", credential: "0YpDMwFOjVPxbSGO" },
  { urls: "turns:a.relay.metered.ca:443?transport=tcp", username: "e8dd65d92aee94de76f5c205", credential: "0YpDMwFOjVPxbSGO" },
];

interface VoiceContextType {
  settings: VoiceSettings;
  updateSettings: (partial: Partial<VoiceSettings>) => void;
  activeCall: ActiveCall | null;
  startCall: (conversationId: string, peerId: string, peerName: string) => void;
  acceptCall: () => void;
  endCall: () => void;
  incomingCall: { conversationId: string; callerId: string; callerName: string; offer: RTCSessionDescriptionInit } | null;
  toggleMute: () => void;
  toggleDeafen: () => void;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  audioLevel: number;
  availableDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };
  refreshDevices: () => void;
  callEvents: CallEvent[];
  detectedRegion: string;
}

const VoiceContext = createContext<VoiceContextType>({} as VoiceContextType);
export const useVoice = () => useContext(VoiceContext);

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem("cubbly-voice-settings");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

// Ping test to detect best region
async function detectBestRegion(): Promise<string> {
  const endpoints: Record<string, string> = {
    "us-east": "https://dynamodb.us-east-1.amazonaws.com/ping",
    "us-west": "https://dynamodb.us-west-2.amazonaws.com/ping",
    "eu-west": "https://dynamodb.eu-west-1.amazonaws.com/ping",
    "eu-central": "https://dynamodb.eu-central-1.amazonaws.com/ping",
    "asia-east": "https://dynamodb.ap-northeast-1.amazonaws.com/ping",
    "asia-south": "https://dynamodb.ap-southeast-1.amazonaws.com/ping",
    "south-america": "https://dynamodb.sa-east-1.amazonaws.com/ping",
    "australia": "https://dynamodb.ap-southeast-2.amazonaws.com/ping",
  };

  const results: { region: string; latency: number }[] = [];

  await Promise.allSettled(
    Object.entries(endpoints).map(async ([region, url]) => {
      const start = performance.now();
      try {
        await fetch(url, { method: "HEAD", mode: "no-cors", signal: AbortSignal.timeout(3000) });
        results.push({ region, latency: performance.now() - start });
      } catch {
        // Region unreachable, skip
      }
    })
  );

  if (results.length === 0) return "us-east";
  results.sort((a, b) => a.latency - b.latency);
  return results[0].region;
}

export const VoiceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<VoiceSettings>(loadSettings);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<VoiceContextType["incomingCall"]>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [availableDevices, setAvailableDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [callEvents, setCallEvents] = useState<CallEvent[]>([]);
  const [detectedRegion, setDetectedRegion] = useState("us-east");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const prevCallStateRef = useRef<string | null>(null);

  // Detect best region on mount
  useEffect(() => {
    detectBestRegion().then(setDetectedRegion);
  }, []);

  // Track call events for chat pills
  useEffect(() => {
    const isInCall = activeCall?.conversationId;
    const callState = activeCall?.state;
    const prevState = prevCallStateRef.current;

    if (isInCall && callState === "connected" && prevState !== "connected") {
      const callId = `call-${Date.now()}`;
      prevCallStateRef.current = "connected";
      setCallEvents(prev => [...prev, {
        id: callId,
        conversationId: activeCall.conversationId,
        state: "ongoing",
        startedAt: new Date().toISOString(),
      }]);
    } else if (!isInCall && prevState === "connected") {
      prevCallStateRef.current = null;
      setCallEvents(prev => {
        const last = [...prev];
        const ongoingIdx = last.findLastIndex(e => e.state === "ongoing");
        if (ongoingIdx >= 0) {
          last[ongoingIdx] = { ...last[ongoingIdx], state: "ended", endedAt: new Date().toISOString() };
        }
        return last;
      });
    } else if (isInCall && callState !== "connected") {
      prevCallStateRef.current = callState || null;
    } else if (!isInCall) {
      prevCallStateRef.current = null;
    }
  }, [activeCall?.conversationId, activeCall?.state]);

  const updateSettings = useCallback((partial: Partial<VoiceSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem("cubbly-voice-settings", JSON.stringify(next));
      return next;
    });
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableDevices({
        inputs: devices.filter(d => d.kind === "audioinput"),
        outputs: devices.filter(d => d.kind === "audiooutput"),
      });
    } catch (e) {
      console.error("Failed to enumerate devices:", e);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    if (gainNodeRef.current) gainNodeRef.current.gain.value = settings.inputVolume / 100;
  }, [settings.inputVolume]);

  useEffect(() => {
    if (outputGainRef.current) outputGainRef.current.gain.value = settings.outputVolume / 100;
  }, [settings.outputVolume]);

  const startAudioLevelMonitor = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    analyserRef.current = analyser;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;
      setAudioLevel(avg / 255 * 100);
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopAudioLevelMonitor = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const getUserMedia = useCallback(async () => {
    const constraints: MediaStreamConstraints = {
      audio: {
        deviceId: settings.inputDeviceId !== "default" ? { exact: settings.inputDeviceId } : undefined,
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        sampleRate: 48000,
        sampleSize: 24,
        channelCount: 2,
      } as MediaTrackConstraints,
      video: false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }, [settings.inputDeviceId, settings.echoCancellation, settings.noiseSuppression, settings.autoGainControl]);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, iceTransportPolicy: "all" });

    pc.ontrack = (event) => {
      const remote = event.streams[0];
      setRemoteStream(remote);
      try {
        const ctx = audioContextRef.current || new AudioContext();
        if (!audioContextRef.current) audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(remote);
        const gain = ctx.createGain();
        gain.gain.value = settings.outputVolume / 100;
        outputGainRef.current = gain;
        source.connect(gain);
        const dest = ctx.createMediaStreamDestination();
        gain.connect(dest);
        const audioEl = document.createElement("audio");
        audioEl.srcObject = dest.stream;
        audioEl.autoplay = true;
        if (settings.outputDeviceId !== "default" && (audioEl as any).setSinkId) {
          (audioEl as any).setSinkId(settings.outputDeviceId).catch(console.error);
        }
        audioEl.play().catch(console.error);
      } catch {
        const audioEl = document.createElement("audio");
        audioEl.srcObject = remote;
        audioEl.autoplay = true;
        audioEl.play().catch(console.error);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
        endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [settings.outputVolume, settings.outputDeviceId]);

  const setupSignaling = useCallback((conversationId: string) => {
    if (!user) return;

    const channelName = `voice-call:${conversationId}`;
    const channel = supabase.channel(channelName);

    channel.on("broadcast", { event: "voice-signal" }, async ({ payload }) => {
      if (payload.senderId === user.id) return;
      const pc = pcRef.current;

      if (payload.type === "offer") {
        setIncomingCall({
          conversationId,
          callerId: payload.senderId,
          callerName: payload.senderName || "Unknown",
          offer: payload.sdp,
        });
      }

      if (payload.type === "answer" && pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        setActiveCall(prev => prev ? { ...prev, state: "connected", startedAt: Date.now() } : null);
      }

      if (payload.type === "ice-candidate" && pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.error("Failed to add ICE candidate:", e);
        }
      }

      if (payload.type === "hangup") {
        endCall();
      }
    });

    channel.subscribe();
    channelRef.current = channel;
    return channel;
  }, [user]);

  const setHighQualityOpus = (sdp: string): string => {
    return sdp.replace(
      /a=fmtp:111 /g,
      "a=fmtp:111 maxaveragebitrate=510000;stereo=1;sprop-stereo=1;useinbandfec=1;maxplaybackrate=48000;"
    );
  };

  const startCall = useCallback(async (conversationId: string, peerId: string, peerName: string) => {
    if (!user) return;
    try {
      const stream = await getUserMedia();
      setLocalStream(stream);
      startAudioLevelMonitor(stream);

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const channel = setupSignaling(conversationId);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          channel?.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "ice-candidate", candidate: event.candidate, senderId: user.id },
          });
        }
      };

      const offer = await pc.createOffer();
      let sdp = offer.sdp || "";
      sdp = setHighQualityOpus(sdp);
      offer.sdp = sdp;
      await pc.setLocalDescription(offer);

      channel?.send({
        type: "broadcast",
        event: "voice-signal",
        payload: {
          type: "offer",
          sdp: offer,
          senderId: user.id,
          senderName: user.user_metadata?.display_name || "User",
        },
      });

      setActiveCall({
        conversationId,
        peerId,
        peerName,
        state: "calling",
        isMuted: false,
        isDeafened: false,
      });
    } catch (e) {
      console.error("Failed to start call:", e);
    }
  }, [user, getUserMedia, createPeerConnection, setupSignaling, startAudioLevelMonitor]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !user) return;
    try {
      const stream = await getUserMedia();
      setLocalStream(stream);
      startAudioLevelMonitor(stream);

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const channel = setupSignaling(incomingCall.conversationId);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          channel?.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "ice-candidate", candidate: event.candidate, senderId: user.id },
          });
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      let sdp = answer.sdp || "";
      sdp = setHighQualityOpus(sdp);
      answer.sdp = sdp;
      await pc.setLocalDescription(answer);

      channel?.send({
        type: "broadcast",
        event: "voice-signal",
        payload: { type: "answer", sdp: answer, senderId: user.id },
      });

      setActiveCall({
        conversationId: incomingCall.conversationId,
        peerId: incomingCall.callerId,
        peerName: incomingCall.callerName,
        state: "connected",
        startedAt: Date.now(),
        isMuted: false,
        isDeafened: false,
      });
      setIncomingCall(null);
    } catch (e) {
      console.error("Failed to accept call:", e);
    }
  }, [incomingCall, user, getUserMedia, createPeerConnection, setupSignaling, startAudioLevelMonitor]);

  const endCall = useCallback(() => {
    if (channelRef.current && user) {
      channelRef.current.send({
        type: "broadcast",
        event: "voice-signal",
        payload: { type: "hangup", senderId: user.id },
      });
    }

    pcRef.current?.close();
    pcRef.current = null;

    localStream?.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setIncomingCall(null);
    stopAudioLevelMonitor();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [localStream, user, stopAudioLevelMonitor]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => { track.enabled = !track.enabled; });
      setActiveCall(prev => prev ? { ...prev, isMuted: !prev.isMuted } : null);
    }
  }, [localStream]);

  const toggleDeafen = useCallback(() => {
    if (remoteStream) {
      const audioElements = document.querySelectorAll("audio");
      audioElements.forEach(el => { if (el.srcObject) el.muted = !el.muted; });
      setActiveCall(prev => prev ? { ...prev, isDeafened: !prev.isDeafened } : null);
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!user) return;
    const globalChannel = supabase.channel(`voice-global:${user.id}`);
    globalChannel.on("broadcast", { event: "incoming-call" }, ({ payload }) => {
      if (payload.targetId === user.id && !activeCall) {
        setupSignaling(payload.conversationId);
      }
    });
    globalChannel.subscribe();
    return () => { supabase.removeChannel(globalChannel); };
  }, [user, activeCall, setupSignaling]);

  return (
    <VoiceContext.Provider value={{
      settings, updateSettings, activeCall, startCall, acceptCall, endCall,
      incomingCall, toggleMute, toggleDeafen, localStream, remoteStream,
      audioLevel, availableDevices, refreshDevices, callEvents, detectedRegion,
    }}>
      {children}
    </VoiceContext.Provider>
  );
};
