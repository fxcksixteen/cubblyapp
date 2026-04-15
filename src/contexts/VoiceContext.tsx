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
  serverRegion: string;
}

export interface ScreenShareSettings {
  resolution: string;        // "auto" | "720p" | "1080p" | "1440p" | "source"
  frameRate: number;          // 15, 30, 60
  audioShare: boolean;        // share system audio
  optimizeFor: string;        // "clarity" | "motion"
  showCursor: boolean;
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

const DEFAULT_SCREEN_SHARE_SETTINGS: ScreenShareSettings = {
  resolution: "auto",
  frameRate: 30,
  audioShare: true,
  optimizeFor: "clarity",
  showCursor: true,
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

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "turn:a.relay.metered.ca:80", username: "e8dd65d92aee94de76f5c205", credential: "0YpDMwFOjVPxbSGO" },
  { urls: "turn:a.relay.metered.ca:80?transport=tcp", username: "e8dd65d92aee94de76f5c205", credential: "0YpDMwFOjVPxbSGO" },
  { urls: "turn:a.relay.metered.ca:443", username: "e8dd65d92aee94de76f5c205", credential: "0YpDMwFOjVPxbSGO" },
  { urls: "turns:a.relay.metered.ca:443?transport=tcp", username: "e8dd65d92aee94de76f5c205", credential: "0YpDMwFOjVPxbSGO" },
];

interface VoiceContextType {
  settings: VoiceSettings;
  updateSettings: (partial: Partial<VoiceSettings>) => void;
  screenShareSettings: ScreenShareSettings;
  updateScreenShareSettings: (partial: Partial<ScreenShareSettings>) => void;
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
  remoteAudioLevel: number;
  availableDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };
  refreshDevices: () => void;
  callEvents: CallEvent[];
  detectedRegion: string;
  // Screen sharing
  isScreenSharing: boolean;
  screenStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  startScreenShare: (type?: "screen" | "window" | "tab", options?: { audio?: boolean; fps?: number; quality?: string }) => Promise<void>;
  stopScreenShare: () => void;
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

function loadScreenShareSettings(): ScreenShareSettings {
  try {
    const raw = localStorage.getItem("cubbly-screenshare-settings");
    if (raw) return { ...DEFAULT_SCREEN_SHARE_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SCREEN_SHARE_SETTINGS };
}

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
      } catch {}
    })
  );
  if (results.length === 0) return "us-east";
  results.sort((a, b) => a.latency - b.latency);
  return results[0].region;
}

export const VoiceProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<VoiceSettings>(loadSettings);
  const [screenShareSettings, setScreenShareSettings] = useState<ScreenShareSettings>(loadScreenShareSettings);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<VoiceContextType["incomingCall"]>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);
  const [availableDevices, setAvailableDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }>({ inputs: [], outputs: [] });
  const [callEvents, setCallEvents] = useState<CallEvent[]>([]);
  const [detectedRegion, setDetectedRegion] = useState("us-east");

  // Screen sharing state
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const screenPcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const remoteAnimFrameRef = useRef<number>(0);

  useEffect(() => {
    detectBestRegion().then(setDetectedRegion);
  }, []);

  // Load persisted call events from DB
  useEffect(() => {
    if (!user) return;
    supabase
      .from("call_events")
      .select("*")
      .order("started_at", { ascending: true })
      .then(({ data }) => {
        if (data) {
          setCallEvents(data.map((e: any) => ({
            id: e.id,
            conversationId: e.conversation_id,
            state: e.state as "ongoing" | "ended" | "missed",
            startedAt: e.started_at,
            endedAt: e.ended_at || undefined,
          })));
        }
      });
  }, [user]);

  const updateSettings = useCallback((partial: Partial<VoiceSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem("cubbly-voice-settings", JSON.stringify(next));
      return next;
    });
  }, []);

  const updateScreenShareSettings = useCallback((partial: Partial<ScreenShareSettings>) => {
    setScreenShareSettings(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem("cubbly-screenshare-settings", JSON.stringify(next));
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
    // Update volume on all remote audio elements
    document.querySelectorAll("audio").forEach((el: any) => {
      if (el.__cubblyRemote) el.volume = settings.outputVolume / 100;
    });
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
      // Determine if this is a screen share track or audio track
      const isVideo = event.track.kind === "video";
      
      if (isVideo) {
        setRemoteScreenStream(remote);
        return;
      }

      setRemoteStream(remote);
      // Play remote audio directly via <audio> element (avoids AudioContext interfering with system audio)
      const audioEl = document.createElement("audio");
      audioEl.srcObject = remote;
      audioEl.autoplay = true;
      audioEl.volume = settings.outputVolume / 100;
      outputGainRef.current = { gain: { value: settings.outputVolume / 100 } } as any;
      (audioEl as any).__cubblyRemote = true;
      if (settings.outputDeviceId !== "default" && (audioEl as any).setSinkId) {
        (audioEl as any).setSinkId(settings.outputDeviceId).catch(console.error);
      }
      audioEl.play().catch(console.error);
      document.body.appendChild(audioEl);

      // Separate analyser for level monitoring (doesn't touch audio output)
      try {
        const analyserCtx = new AudioContext();
        const source = analyserCtx.createMediaStreamSource(remote);
        const remoteAnalyser = analyserCtx.createAnalyser();
        remoteAnalyser.fftSize = 256;
        remoteAnalyser.smoothingTimeConstant = 0.5;
        source.connect(remoteAnalyser);
        remoteAnalyserRef.current = remoteAnalyser;
        const remoteData = new Uint8Array(remoteAnalyser.frequencyBinCount);
        const tickRemote = () => {
          remoteAnalyser.getByteFrequencyData(remoteData);
          const avg = remoteData.reduce((sum, v) => sum + v, 0) / remoteData.length;
          setRemoteAudioLevel(avg / 255 * 100);
          remoteAnimFrameRef.current = requestAnimationFrame(tickRemote);
        };
        tickRemote();
      } catch {
        // Level monitoring is optional
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

      // Screen share signaling
      if (payload.type === "screen-offer") {
        const screenPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        screenPc.ontrack = (event) => {
          setRemoteScreenStream(event.streams[0]);
        };
        screenPc.onicecandidate = (event) => {
          if (event.candidate) {
            channel.send({
              type: "broadcast",
              event: "voice-signal",
              payload: { type: "screen-ice-candidate", candidate: event.candidate, senderId: user.id },
            });
          }
        };
        screenPcRef.current = screenPc;
        await screenPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await screenPc.createAnswer();
        await screenPc.setLocalDescription(answer);
        channel.send({
          type: "broadcast",
          event: "voice-signal",
          payload: { type: "screen-answer", sdp: answer, senderId: user.id },
        });
      }

      if (payload.type === "screen-answer" && screenPcRef.current) {
        await screenPcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      }

      if (payload.type === "screen-ice-candidate" && screenPcRef.current) {
        try {
          await screenPcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.error("Failed to add screen ICE candidate:", e);
        }
      }

      if (payload.type === "screen-stop") {
        setRemoteScreenStream(null);
        screenPcRef.current?.close();
        screenPcRef.current = null;
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

      const isBotCall = peerId === "00000000-0000-0000-0000-000000000001";

      setActiveCall({
        conversationId,
        peerId,
        peerName,
        state: isBotCall ? "connected" : "calling",
        startedAt: isBotCall ? Date.now() : undefined,
        isMuted: false,
        isDeafened: false,
      });

      const callEventId = crypto.randomUUID();
      setCallEvents(prev => [...prev, {
        id: callEventId,
        conversationId,
        state: "ongoing",
        startedAt: new Date().toISOString(),
      }]);

      // Persist to DB
      supabase.from("call_events").insert({
        id: callEventId,
        conversation_id: conversationId,
        caller_id: user.id,
        state: "ongoing",
      } as any).then(() => {});
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

      setCallEvents(prev => {
        const hasOngoing = prev.some(e => e.conversationId === incomingCall.conversationId && e.state === "ongoing");
        if (hasOngoing) return prev;
        const callEventId = crypto.randomUUID();
        // Persist to DB
        supabase.from("call_events").insert({
          id: callEventId,
          conversation_id: incomingCall.conversationId,
          caller_id: user.id,
          state: "ongoing",
        } as any).then(() => {});
        return [...prev, {
          id: callEventId,
          conversationId: incomingCall.conversationId,
          state: "ongoing",
          startedAt: new Date().toISOString(),
        }];
      });
    } catch (e) {
      console.error("Failed to accept call:", e);
    }
  }, [incomingCall, user, getUserMedia, createPeerConnection, setupSignaling, startAudioLevelMonitor]);

  // Screen sharing
  const startScreenShare = useCallback(async (type?: "screen" | "window" | "tab", options?: { audio?: boolean; fps?: number; quality?: string }) => {
    if (!user || !activeCall || !channelRef.current) return;

    const effectiveAudio = options?.audio ?? screenShareSettings.audioShare;
    const effectiveFps = options?.fps ?? screenShareSettings.frameRate;
    const effectiveQuality = options?.quality ?? screenShareSettings.resolution;

    const resolutionMap: Record<string, { width: number; height: number } | undefined> = {
      "480p": { width: 854, height: 480 },
      "720p": { width: 1280, height: 720 },
      "1080p": { width: 1920, height: 1080 },
      "1440p": { width: 2560, height: 1440 },
    };

    const res = resolutionMap[effectiveQuality];
    
    const videoConstraints: any = {
      cursor: screenShareSettings.showCursor ? "always" : "never",
      frameRate: { ideal: effectiveFps },
      ...(res ? { width: { ideal: res.width }, height: { ideal: res.height } } : {}),
    };

    if (type === "tab") {
      videoConstraints.displaySurface = "browser";
    } else if (type === "window") {
      videoConstraints.displaySurface = "window";
    } else if (type === "screen") {
      videoConstraints.displaySurface = "monitor";
    }

    const displayConstraints: DisplayMediaStreamOptions = {
      video: videoConstraints,
      audio: effectiveAudio,
    };

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
      setScreenStream(stream);
      setIsScreenSharing(true);

      // Create a separate peer connection for screen sharing
      const screenPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      screenPcRef.current = screenPc;

      stream.getTracks().forEach(track => {
        screenPc.addTrack(track, stream);
        // Handle user stopping share from browser UI
        track.onended = () => {
          stopScreenShare();
        };
      });

      screenPc.onicecandidate = (event) => {
        if (event.candidate) {
          channelRef.current?.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "screen-ice-candidate", candidate: event.candidate, senderId: user.id },
          });
        }
      };

      const offer = await screenPc.createOffer();
      await screenPc.setLocalDescription(offer);

      channelRef.current.send({
        type: "broadcast",
        event: "voice-signal",
        payload: { type: "screen-offer", sdp: offer, senderId: user.id },
      });
    } catch (e) {
      console.error("Failed to start screen share:", e);
      setIsScreenSharing(false);
    }
  }, [user, activeCall, screenShareSettings]);

  const stopScreenShare = useCallback(() => {
    screenStream?.getTracks().forEach(t => t.stop());
    setScreenStream(null);
    setIsScreenSharing(false);
    screenPcRef.current?.close();
    screenPcRef.current = null;

    if (channelRef.current && user) {
      channelRef.current.send({
        type: "broadcast",
        event: "voice-signal",
        payload: { type: "screen-stop", senderId: user.id },
      });
    }
  }, [screenStream, user]);

  const endCall = useCallback(() => {
    const endedAt = new Date().toISOString();
    setCallEvents(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].state === "ongoing") {
          const evt = updated[i];
          updated[i] = { ...evt, state: "ended", endedAt };
          // Persist to DB
          supabase.from("call_events").update({ state: "ended", ended_at: endedAt } as any).eq("id", evt.id).then(() => {});
          break;
        }
      }
      return updated;
    });

    // Stop screen share if active
    stopScreenShare();
    setRemoteScreenStream(null);

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
    cancelAnimationFrame(remoteAnimFrameRef.current);
    remoteAnalyserRef.current = null;
    setRemoteAudioLevel(0);

    // Clean up remote audio elements
    document.querySelectorAll("audio").forEach((el: any) => {
      if (el.__cubblyRemote) { el.pause(); el.srcObject = null; el.remove(); }
    });

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [localStream, user, stopAudioLevelMonitor, stopScreenShare]);

  const toggleMute = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => { track.enabled = !track.enabled; });
      setActiveCall(prev => prev ? { ...prev, isMuted: !prev.isMuted } : null);
    }
  }, [localStream]);

  const toggleDeafen = useCallback(() => {
    // For bot calls or when there's no remote stream, still toggle the state
    const audioElements = document.querySelectorAll("audio");
    audioElements.forEach((el: any) => { if (el.__cubblyRemote) el.muted = !el.muted; });
    setActiveCall(prev => prev ? { ...prev, isDeafened: !prev.isDeafened } : null);
  }, []);

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
      settings, updateSettings, screenShareSettings, updateScreenShareSettings,
      activeCall, startCall, acceptCall, endCall,
      incomingCall, toggleMute, toggleDeafen, localStream, remoteStream,
      audioLevel, remoteAudioLevel, availableDevices, refreshDevices, callEvents, detectedRegion,
      isScreenSharing, screenStream, remoteScreenStream, startScreenShare, stopScreenShare,
    }}>
      {children}
    </VoiceContext.Provider>
  );
};
