import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playSound, playLooping, stopLooping } from "@/lib/sounds";
import { startNativeWindowAudioStream } from "@/lib/nativeWindowAudio";
import { usePeerGains } from "@/lib/peerGain";
import { armRemoteAudio } from "@/lib/iosAudioUnlock";

type ParticipantStatePatch = {
  is_muted?: boolean;
  is_deafened?: boolean;
  is_video_on?: boolean;
  is_screen_sharing?: boolean;
};

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
  // Video / camera
  videoDeviceId: string;
  videoResolution: string; // "480p" | "720p" | "1080p"
  videoFrameRate: number; // 15 | 30 | 60
  mirrorSelfView: boolean;
}

export interface ScreenShareSettings {
  resolution: string;
  frameRate: number;
  audioShare: boolean;
  optimizeFor: string;
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
  videoDeviceId: "default",
  videoResolution: "720p",
  videoFrameRate: 30,
  mirrorSelfView: true,
};

const DEFAULT_SCREEN_SHARE_SETTINGS: ScreenShareSettings = {
  resolution: "auto",
  frameRate: 30,
  audioShare: true,
  optimizeFor: "ultra",
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
  isVideoOn: boolean;
  /**
   * Set to true once the 30s outgoing-ring timer has elapsed without the peer
   * picking up. The call STAYS ongoing (caller waits alone, peer can still
   * Join from the chat-thread pill), but the UI flips from "Ringing…" to
   * "Not in call" so the caller knows their friend hasn't answered.
   * Reset back to false the moment a peer actually connects.
   */
  ringTimedOut?: boolean;
  /**
   * Timestamp (ms) the moment we received `peer-leave`/`hangup` from the
   * other side. Used by the call overlay to flip the peer's avatar label to
   * "Not in call" instantly — without waiting on a postgres_changes UPDATE
   * that may be delayed or dropped. Cleared when the peer rejoins.
   */
  peerLeftAt?: number;
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

/**
 * Bump the maxBitrate on a screenshare video sender. Called right after
 * addTrack() so encoding parameters reflect the user's Optimization preset.
 */
/**
 * Apply high-quality screenshare *video* encoding parameters: max bitrate, never
 * downscale resolution, drop frames before quality on bandwidth pressure.
 * This is what fixes "screenshare looks pixelated to the OTHER user".
 */
async function applyScreenBitrate(sender: RTCRtpSender, maxBitrate: number) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = maxBitrate;
    // Allow encoder to scale resolution down under CPU/bandwidth pressure
    // so it doesn't keep encoding 1080p frames at the expense of dropping
    // voice RTP packets — that was the "everyone lags when streaming a
    // game" symptom. Cap framerate too.
    (params.encodings[0] as any).maxFramerate = (params.encodings[0] as any).maxFramerate ?? 60;
    (params.encodings[0] as any).networkPriority = "medium";
    (params.encodings[0] as any).priority = "medium";
    // balanced → drop both FPS and resolution as needed; "maintain-resolution"
    // was forcing resolution and starving the voice transceiver of bandwidth.
    (params as any).degradationPreference = "balanced";
    await sender.setParameters(params);
  } catch (e) {
    console.warn("[Voice] Could not set screen encoding bitrate:", e);
  }
}

/**
 * Apply high-quality stereo Opus encoding to a screenshare *audio* sender so
 * music/game audio doesn't get crushed to ~32 kbps mono speech.
 */
async function applyScreenAudioBitrate(sender: RTCRtpSender) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = 256_000;
    (params.encodings[0] as any).networkPriority = "high";
    (params.encodings[0] as any).priority = "high";
    await sender.setParameters(params);
  } catch (e) {
    console.warn("[Voice] Could not set screen audio bitrate:", e);
  }
}

/** Patch SDP so the screen-share PC negotiates stereo high-bitrate Opus. */
function patchScreenShareOpusSdp(sdp: string): string {
  return sdp.replace(
    /a=fmtp:111 ([^\r\n]*)/g,
    (m, existing) => {
      const filtered = (existing as string)
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !/^(stereo|sprop-stereo|maxaveragebitrate|useinbandfec|maxplaybackrate)=/i.test(s));
      filtered.push("stereo=1", "sprop-stereo=1", "maxaveragebitrate=256000", "useinbandfec=1", "maxplaybackrate=48000");
      return `a=fmtp:111 ${filtered.join(";")}`;
    }
  );
}

const STUN_ONLY_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

interface VoiceContextType {
  settings: VoiceSettings;
  updateSettings: (partial: Partial<VoiceSettings>) => void;
  screenShareSettings: ScreenShareSettings;
  updateScreenShareSettings: (partial: Partial<ScreenShareSettings>) => void;
  activeCall: ActiveCall | null;
  startCall: (conversationId: string, peerId: string, peerName: string) => void;
  acceptCall: () => void;
  /** Dismiss an incoming-call ring on THIS device without ending any active call. */
  declineIncoming: () => void;
  endCall: () => void;
  incomingCall: { conversationId: string; callerId: string; callerName: string; callerAvatarUrl?: string; offer?: RTCSessionDescriptionInit; callEventId?: string } | null;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleVideo: () => Promise<void>;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /** Local camera stream (separate from mic stream) */
  localVideoStream: MediaStream | null;
  /** Remote peer's camera stream */
  remoteVideoStream: MediaStream | null;
  audioLevel: number;
  remoteAudioLevel: number;
  availableDevices: { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] };
  refreshDevices: () => void;
  callEvents: CallEvent[];
  currentCallEventId: string | null;
  detectedRegion: string;
  isScreenSharing: boolean;
  screenStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  startScreenShare: (type?: "screen" | "window" | "tab", options?: { audio?: boolean; fps?: number; quality?: string; sourceId?: string }) => Promise<void>;
  stopScreenShare: () => void;
  /** Round-trip latency in ms (polled from RTCPeerConnection.getStats during active call). 0 when not in a call. */
  ping: number;
  /** Instant peer mute/deafen/video state from signaling channel (no DB lag). */
  peerInstantState: { is_muted?: boolean; is_deafened?: boolean; is_video_on?: boolean };
  /** Per-user playback gain (Discord-style: 0.0 = silent, 1.0 = 100%, 2.0 = 200%). Persisted to localStorage. */
  getUserVolume: (userId: string) => number;
  setUserVolume: (userId: string, volume: number) => void;
  /** Local-only mute for a specific peer (does not affect what others hear). */
  isUserMuted: (userId: string) => boolean;
  setUserMuted: (userId: string, muted: boolean) => void;
}

const VoiceContext = createContext<VoiceContextType>({} as VoiceContextType);
export const useVoice = () => useContext(VoiceContext);

/**
 * Sanitize a possibly-empty / null device id from old localStorage. Radix
 * Select crashes the entire panel ("A <Select.Item /> must have a value
 * prop that is not an empty string") if any controlled value is "" — so we
 * coerce empty/missing ids back to "default" before they reach the select.
 */
function safeDeviceId(v: unknown): string {
  return typeof v === "string" && v.trim().length > 0 ? v : "default";
}
function safeRegion(v: unknown): string {
  return typeof v === "string" && v.trim().length > 0 ? v : "auto";
}

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem("cubbly-voice-settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_SETTINGS, ...parsed } as VoiceSettings;
      // Hard-sanitize anything that ends up driving a <Select> value.
      merged.inputDeviceId = safeDeviceId(merged.inputDeviceId);
      merged.outputDeviceId = safeDeviceId(merged.outputDeviceId);
      merged.videoDeviceId = safeDeviceId(merged.videoDeviceId);
      merged.serverRegion = safeRegion(merged.serverRegion);
      return merged;
    }
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

// Detect if running in Electron
const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI;
// iOS Safari has strict gesture/codec rules — apply looser audio constraints + gesture-tied playback
const isIOS = typeof navigator !== "undefined" && /iP(hone|od|ad)/.test(navigator.userAgent || "");
const isMobile = typeof navigator !== "undefined" && /Mobi|Android|iP(hone|od|ad)/i.test(navigator.userAgent || "");

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
  const [callEvents, setCallEvents] = useState<CallEvent[]>([]);
  const [currentCallEventId, setCurrentCallEventId] = useState<string | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const currentCallEventIdRef = useRef<string | null>(null);
  const [detectedRegion, setDetectedRegion] = useState("us-east");
  const [ping, setPing] = useState(0);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

  // Expose a global flag so the heavy activity-poller (ActivityContext) can
  // throttle itself while the user is in a call.
  useEffect(() => {
    (window as any).__cubblyInCall = !!activeCall && activeCall.state !== "ended";
    return () => { (window as any).__cubblyInCall = false; };
  }, [activeCall]);

  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { currentCallEventIdRef.current = currentCallEventId; }, [currentCallEventId]);

  // Same idea for screensharing — when this is true, ActivityContext stops
  // running `tasklist` polls entirely so the heavy IPC doesn't compete with
  // per-window WASAPI PCM forwarding (which is what causes ping spikes when
  // sharing a game specifically — games trip the activity detector and the
  // PowerShell calls block the main thread). Mirrors `__cubblyInCall`.
  useEffect(() => {
    (window as any).__cubblyScreenSharing = !!isScreenSharing;
    return () => { (window as any).__cubblyScreenSharing = false; };
  }, [isScreenSharing]);

  /**
   * Instant peer mute/deafen/video state, broadcast over the signaling
   * channel so the UI updates with zero latency. The DB-backed
   * useCallParticipants hook remains the source of truth for late-joiners
   * and reconnects, but this overlays it for the active 1:1 peer.
   */
  const [peerInstantState, setPeerInstantState] = useState<{ is_muted?: boolean; is_deafened?: boolean; is_video_on?: boolean }>({});

  // Video / camera (sent over the same audio PC via a video transceiver)
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const videoTransceiverRef = useRef<RTCRtpTransceiver | null>(null);

  const iceServersRef = useRef<RTCIceServer[]>(STUN_ONLY_SERVERS);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  // Two independent screen-share PCs so MY outgoing share and the PEER's
  // incoming share can coexist (Discord-style multi-share). Previously a
  // single `screenPcRef` was reused for both directions — when the peer
  // started sharing while I was already sharing, the incoming offer
  // overwrote my outgoing PC's ref, breaking ICE routing for both streams.
  const screenPcOutRef = useRef<RTCPeerConnection | null>(null);
  const screenPcInRef = useRef<RTCPeerConnection | null>(null);
  /** Cleanup fn for an active native (WASAPI) per-window audio capture, if any. */
  const nativeWindowAudioStopRef = useRef<(() => void) | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // v0.3.11: track which conversation channelRef belongs to so setupSignaling
  // never accidentally hands back a stale channel from a previous call to a
  // different conversation. That was a silent way for accept/rejoin to never
  // hear from the actual peer — the listener was bound to the wrong room.
  const channelConversationRef = useRef<string | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // ===== Per-user volume / local mute (Discord-style) =====
  // Backed by the shared `usePeerGains` hook so the same persisted volume
  // table powers both 1-on-1 and group calls. The hook also routes mic AND
  // screen-share audio for the same peer through ONE GainNode → the slider
  // in `UserVolumeMenu` controls everything you hear from that user.
  const { getUserVolume, setUserVolume, isUserMuted, setUserMuted, setPeerForcedMute, setLocalDeafened, attachPeerGain, clearAllPeerGains } = usePeerGains();

  const animFrameRef = useRef<number>(0);
  const remoteAnimFrameRef = useRef<number>(0);
  // Track pre-deafen mute state so undeafen restores it
  const preMuteStateRef = useRef<boolean>(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  /** Original mic track kept around so toggleMute can replaceTrack(null) → null
   *  → original. Setting `track.enabled = false` alone has been observed to
   *  still leak audible audio on iOS PWA peers (the mute bug) — replaceTrack
   *  guarantees zero RTP frames are sent. */
  const originalMicTrackRef = useRef<MediaStreamTrack | null>(null);
  // Stable peer userId for the current 1-on-1 call. We READ this in track-event
  // callbacks (mic/screen `ontrack`) instead of `activeCall?.peerId`, which is
  // stale inside closures captured before the call state updates. Without this,
  // attachPeerGain() never binds and right-click volume controls do nothing.
  const peerIdRef = useRef<string | null>(null);
  const endCallRef = useRef<() => void>(() => {});
  // Forward-ref to syncCallParticipantState (declared later) so the ICE-connected
  // handler can upsert our call_participants row the moment we connect — without
  // this, peers can't see our mute/deafen/video state until we toggle something.
  const syncParticipantRef = useRef<(o?: { is_muted?: boolean; is_deafened?: boolean }) => void>(() => {});

  // ICE candidate queues to fix race conditions
  const incomingCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const outgoingCandidateBuffer = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescriptionSet = useRef<boolean>(false);
  const acceptedIncomingCallRef = useRef<VoiceContextType["incomingCall"]>(null);
  const outgoingCallMetaRef = useRef<{ conversationId: string; callEventId: string; callerAvatarUrl?: string } | null>(null);
  // Flag to prevent re-broadcasting hangup when receiving one
  const isRemoteHangup = useRef<boolean>(false);

  useEffect(() => {
    detectBestRegion().then(setDetectedRegion);
  }, []);

  useEffect(() => {
    if (!user) return;
    const preferredRegion = settings.serverRegion === "auto" ? detectedRegion : settings.serverRegion;
    supabase.functions
      .invoke("get-turn-credentials", {
        body: { preferredRegion },
      })
      .then(({ data, error }) => {
        if (!error && data?.iceServers) {
          iceServersRef.current = data.iceServers;
        }
      });
  }, [user, settings.serverRegion, detectedRegion]);

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

    // Realtime subscription for call events. CRITICAL: attach all .on()
    // listeners BEFORE calling .subscribe(), or supabase-js throws
    // "cannot add postgres_changes callbacks ... after subscribe()".
    const uniqueSuffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const callChannel = supabase.channel(`call-events-realtime:${user.id}:${uniqueSuffix}`);
    callChannel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "call_events" },
      (payload) => {
        const row = payload.new as any;
        if (payload.eventType === "INSERT") {
          setCallEvents(prev => {
            if (prev.some(e => e.id === row.id)) return prev;
            return [...prev, {
              id: row.id,
              conversationId: row.conversation_id,
              state: row.state as "ongoing" | "ended" | "missed",
              startedAt: row.started_at,
              endedAt: row.ended_at || undefined,
            }];
          });
        } else if (payload.eventType === "UPDATE") {
          setCallEvents(prev =>
            prev.map(e =>
              e.id === row.id
                ? { ...e, state: row.state, endedAt: row.ended_at || undefined }
                : e
            )
          );
        }
      }
    );
    callChannel.subscribe();

    return () => {
      supabase.removeChannel(callChannel);
    };
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

  const [availableDevices, setAvailableDevices] = useState<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[]; cameras: MediaDeviceInfo[] }>({ inputs: [], outputs: [], cameras: [] });

  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAvailableDevices({
        inputs: devices.filter(d => d.kind === "audioinput"),
        outputs: devices.filter(d => d.kind === "audiooutput"),
        cameras: devices.filter(d => d.kind === "videoinput"),
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
    document.querySelectorAll("audio").forEach((el: any) => {
      if (el.__cubblyRemote) el.volume = settings.outputVolume / 100;
    });
  }, [settings.outputVolume]);

  // Apply voice processing constraints in real-time when settings change during a call
  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    tracks.forEach(track => {
      track.applyConstraints({
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      }).catch(e => console.warn("Failed to apply audio constraints:", e));
    });
  }, [settings.echoCancellation, settings.noiseSuppression, settings.autoGainControl, localStream]);

  // Sensitivity threshold gating: mute outgoing track when below threshold.
  // Debounced (150ms) and only flips on STATE CHANGE so we don't flap
  // track.enabled at 60fps — that flapping is what made speaking rings choppy
  // and made peers hear chopped-up audio.
  const lastGateStateRef = useRef<boolean>(true);
  const gateTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!localStream || settings.autoSensitivity || !activeCall) return;
    if (activeCall.isMuted || activeCall.isDeafened) return;
    const shouldTransmit = audioLevel >= settings.sensitivityThreshold;
    if (shouldTransmit === lastGateStateRef.current) return;
    if (gateTimerRef.current) window.clearTimeout(gateTimerRef.current);
    gateTimerRef.current = window.setTimeout(() => {
      lastGateStateRef.current = shouldTransmit;
      localStream.getAudioTracks().forEach(t => { t.enabled = shouldTransmit; });
    }, 150);
    return () => {
      if (gateTimerRef.current) { window.clearTimeout(gateTimerRef.current); gateTimerRef.current = null; }
    };
  }, [audioLevel, settings.sensitivityThreshold, settings.autoSensitivity, localStream, activeCall]);

  const startAudioLevelMonitor = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    audioContextRef.current = ctx;
    // iOS Safari starts AudioContext suspended — must explicitly resume from a user gesture.
    // This call is fire-and-forget; the surrounding accept/start handler is the gesture.
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    // Do NOT connect to ctx.destination — that causes echo/underwater effect
    analyserRef.current = analyser;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let lastLocal = 0;
    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;
      const next = (avg / 255) * 100;
      // Smaller gate (0.3) keeps the speaking-ring smooth & reactive while
      // still cutting most idle re-renders.
      if (Math.abs(next - lastLocal) > 0.3) {
        lastLocal = next;
        setAudioLevel(next);
      }
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
    // iOS Safari rejects strict sampleRate/sampleSize/channelCount constraints
    // and returns NO stream at all → mobile users had no mic. On mobile we
    // pass only the universally-supported booleans and let Safari pick defaults.
    const audioBase: MediaTrackConstraints = {
      deviceId: settings.inputDeviceId !== "default" ? { exact: settings.inputDeviceId } : undefined,
      echoCancellation: settings.echoCancellation,
      noiseSuppression: settings.noiseSuppression,
      autoGainControl: settings.autoGainControl,
    };
    const audio: MediaTrackConstraints = isMobile
      ? audioBase
      : { ...audioBase, sampleRate: 48000, sampleSize: 24, channelCount: 2 } as MediaTrackConstraints;
    return navigator.mediaDevices.getUserMedia({ audio, video: false });
  }, [settings.inputDeviceId, settings.echoCancellation, settings.noiseSuppression, settings.autoGainControl]);

  const createPeerConnection = useCallback(() => {
    console.log("[Voice] 🔧 Creating RTCPeerConnection with", iceServersRef.current.length, "ICE servers");
    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 4,
    });

    pc.ontrack = (event) => {
      // CRITICAL: with `replaceTrack()` flow (camera toggle mid-call), the
      // remote side often receives a track WITHOUT a usable `event.streams[0]`
      // — that array can be empty. We have to synthesize a MediaStream from the
      // raw track, otherwise the <video> tile binds to `null` and shows black.
      const isVideo = event.track.kind === "video";
      const remote = event.streams[0] || new MediaStream([event.track]);
      console.log(`[Voice] 🎵 ontrack: kind=${event.track.kind}, label=${event.track.label}, enabled=${event.track.enabled}, hasStream=${!!event.streams[0]}`);

      if (isVideo) {
        // The main PC carries the camera video — screen share uses a separate PC (screenPcRef)
        setRemoteVideoStream(remote);
        event.track.onended = () => setRemoteVideoStream(null);
        // When a peer enables camera AFTER initial connect, the track arrives
        // "muted" and only fires onunmute once frames flow. Re-set the stream
        // (force new reference) so React re-binds srcObject and triggers play().
        event.track.onunmute = () => {
          console.log("[Voice] 🎥 remote video onunmute — frames flowing");
          setRemoteVideoStream(new MediaStream([event.track]));
        };
        event.track.onmute = () => { /* keep stream — UI may dim */ };
        return;
      }

      // Lower the inbound audio jitter buffer for snappier real-time feel.
      // 50ms is aggressive but cuts perceived latency by ~150ms vs the default.
      try { (event.receiver as any).playoutDelayHint = 0.05; } catch { /* ignore */ }

      setRemoteStream(remote);
      const audioEl = document.createElement("audio");
      audioEl.srcObject = remote;
      (audioEl as any).__cubblyRemote = true;
      outputGainRef.current = { gain: { value: settings.outputVolume / 100 } } as any;
      document.body.appendChild(audioEl);
      // iOS PWA-safe arming: sets playsinline/autoplay/volume + retries
      // play() on the next user gesture if the browser blocks autoplay.
      armRemoteAudio(audioEl, {
        volume: settings.outputVolume / 100,
        sinkId: settings.outputDeviceId,
      });

      // Route through per-peer GainNode so the user can scale this peer's
      // playback 0–200% via the right-click menu (Discord-style). Read from
      // the stable ref — `activeCall?.peerId` here is stale (captured when this
      // PC was created, BEFORE setActiveCall fired), which is why volume
      // controls silently did nothing in shipped builds.
      const peerUserId = peerIdRef.current;
      if (peerUserId) {
        console.log("[Voice] 🔊 attaching peer gain for", peerUserId);
        attachPeerGain(peerUserId, remote, audioEl, "mic");
      } else {
        console.warn("[Voice] ⚠️ ontrack(mic) but peerIdRef is null — volume controls will not bind");
      }

      // Cancel ANY prior remote analyser loop + close its AudioContext FIRST.
      // Without this, every track replace (network blip, renegotiation, camera
      // toggle) stacked another rAF loop pointing at a soon-to-be-closed
      // context — the surviving loop eventually read from a dead source and
      // the peer ring would freeze at 0 for the rest of the call.
      try {
        if (remoteAnimFrameRef.current) cancelAnimationFrame(remoteAnimFrameRef.current);
        remoteAnimFrameRef.current = 0;
      } catch {}
      try {
        const prevCtx = (remoteAnalyserRef.current as any)?.context as AudioContext | undefined;
        if (prevCtx && prevCtx.state !== "closed") prevCtx.close().catch(() => {});
      } catch {}
      remoteAnalyserRef.current = null;
      setRemoteAudioLevel(0);

      try {
        const analyserCtx = new AudioContext();
        const source = analyserCtx.createMediaStreamSource(remote);
        const remoteAnalyser = analyserCtx.createAnalyser();
        remoteAnalyser.fftSize = 256;
        remoteAnalyser.smoothingTimeConstant = 0.35;
        source.connect(remoteAnalyser);
        remoteAnalyserRef.current = remoteAnalyser;
        const remoteData = new Uint8Array(remoteAnalyser.frequencyBinCount);
        let lastRemote = 0;
        const tickRemote = () => {
          remoteAnalyser.getByteFrequencyData(remoteData);
          const avg = remoteData.reduce((sum, v) => sum + v, 0) / remoteData.length;
          const next = (avg / 255) * 100;
          if (Math.abs(next - lastRemote) > 0.3) {
            lastRemote = next;
            setRemoteAudioLevel(next);
          }
          remoteAnimFrameRef.current = requestAnimationFrame(tickRemote);
        };
        tickRemote();
      } catch {}
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[Voice] ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        // Mark call as truly connected only when ICE transport is up
        setActiveCall(prev => {
          if (!prev) return prev;
          if (prev.state !== "connected") {
            playSound("joinCall", { volume: 0.4 });
            return { ...prev, state: "connected", ringTimedOut: false, peerLeftAt: undefined, startedAt: prev.startedAt || Date.now() };
          }
          return prev;
        });
        // Ensure ALL local audio tracks are enabled when connected
        const senders = pc.getSenders();
        senders.forEach(s => {
          if (s.track?.kind === "audio") {
            s.track.enabled = true;
            // Bump network priority so the OS prioritises voice packets
            // over background traffic (game/download/etc).
            try {
              const params = s.getParameters();
              if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
              (params.encodings[0] as any).networkPriority = "high";
              (params.encodings[0] as any).priority = "high";
              params.encodings[0].maxBitrate = 128_000;
              s.setParameters(params).catch(() => {});
            } catch {}
            console.log("[Voice] Audio track enabled on ICE connected");
          }
        });
        // Upsert our call_participants row immediately so the peer can see
        // our mute/deafen/video state from the moment we connect.
        try { syncParticipantRef.current?.(); } catch {}
        // Debug: log the actual ICE candidate pair the browser picked, so we
        // can tell whether we're going direct (host/srflx) or through TURN
        // (relay) — without this we're guessing about Frankfurt's effect.
        setTimeout(async () => {
          try {
            const stats = await pc.getStats();
            stats.forEach((report: any) => {
              if (report.type === "candidate-pair" && report.nominated && report.state === "succeeded") {
                const local = stats.get(report.localCandidateId) as any;
                const remote = stats.get(report.remoteCandidateId) as any;
                console.log(
                  `[Voice] 🌐 Active ICE pair → local=${local?.candidateType}/${local?.protocol}/${local?.address || local?.ip}` +
                  ` remote=${remote?.candidateType}/${remote?.protocol}/${remote?.address || remote?.ip}` +
                  ` rtt=${Math.round((report.currentRoundTripTime || 0) * 1000)}ms`
                );
                if (local?.candidateType === "relay" || remote?.candidateType === "relay") {
                  console.log(`[Voice] 🛰️ Going through TURN relay${local?.relayProtocol ? ` (${local.relayProtocol})` : ""}`);
                }
              }
            });
          } catch (e) { console.warn("[Voice] getStats failed:", e); }
        }, 1500);
      }
      if (pc.iceConnectionState === "disconnected") {
        // Transient — WebRTC will try to recover on its own. DO NOT kick the
        // user out. (v0.3.8 fix: previously this path also called
        // setActiveCall(null) on "failed", which was making the second peer
        // joining look like an instant hangup whenever ICE took a moment to
        // settle. Now we only log and let WebRTC recover; the user can hang
        // up manually if it never comes back.)
        console.warn("[Voice] ICE disconnected — waiting for recovery (not ending call)");
      }
      if (pc.iceConnectionState === "failed") {
        // Even "failed" doesn't kill the call UI anymore — many browsers fire
        // this once during renegotiation/join races and then recover. Try an
        // ICE restart instead of tearing down the call.
        console.warn("[Voice] ICE failed — attempting restart, keeping call alive");
        try { (pc as any).restartIce?.(); } catch {}
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[Voice] Connection state:", pc.connectionState);
    };

    // Pre-create a bidirectional video transceiver so we can hot-swap a camera
    // track in/out via replaceTrack() without ever needing to renegotiate.
    // Both sides do this symmetrically — the SDP carries an m=video line from
    // the very first offer/answer, even before either user enables their camera.
    try {
      videoTransceiverRef.current = pc.addTransceiver("video", { direction: "sendrecv" });
    } catch (e) {
      console.warn("[Voice] Failed to add video transceiver:", e);
      videoTransceiverRef.current = null;
    }

    pcRef.current = pc;
    return pc;
  }, [settings.outputVolume, settings.outputDeviceId]);

  const setHighQualityOpus = (sdp: string): string => {
    return sdp.replace(
      /a=fmtp:111 /g,
      "a=fmtp:111 maxaveragebitrate=510000;stereo=1;sprop-stereo=1;useinbandfec=1;maxplaybackrate=48000;"
    );
  };

  const flushQueuedIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (incomingCandidateQueue.current.length === 0) return;

    const queuedCandidates = [...incomingCandidateQueue.current];
    incomingCandidateQueue.current = [];

    for (const candidate of queuedCandidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("[Voice] Flushing queued candidate failed:", e);
      }
    }
  }, []);

  // Store pending offer so we can re-send when recipient signals ready
  const pendingOfferRef = useRef<{ offer: RTCSessionDescriptionInit; conversationId: string; callEventId: string } | null>(null);

  const ensureOwnParticipantRow = useCallback(async (callEventId: string, overrides?: ParticipantStatePatch) => {
    if (!user) return;
    // Prefer the new heartbeat RPC: it upserts on (call_event_id, user_id),
    // CLEARS left_at (this is what makes rejoin work — the previous insert()
    // path failed silently because of the UNIQUE constraint), and refreshes
    // last_seen_at so other devices know we're really live.
    try {
      await (supabase as any).rpc("heartbeat_call_participant", {
        _call_event_id: callEventId,
        _is_muted: overrides?.is_muted ?? null,
        _is_deafened: overrides?.is_deafened ?? null,
        _is_video_on: overrides?.is_video_on ?? null,
        _is_screen_sharing: overrides?.is_screen_sharing ?? null,
      });
      return;
    } catch (e) {
      console.warn("[Voice] heartbeat_call_participant RPC failed, falling back to direct insert:", e);
    }
    // Fallback (older backend): emulate the old behaviour.
    const { data: existing } = await supabase
      .from("call_participants")
      .select("id")
      .eq("call_event_id", callEventId)
      .eq("user_id", user.id)
      .is("left_at", null)
      .maybeSingle();

    if (existing?.id) {
      if (overrides && Object.keys(overrides).length > 0) {
        await supabase.from("call_participants").update(overrides as any).eq("id", existing.id);
      }
      return;
    }

    await supabase.from("call_participants").insert({
      call_event_id: callEventId,
      user_id: user.id,
      is_muted: false,
      is_deafened: false,
      is_video_on: false,
      is_screen_sharing: false,
      ...(overrides || {}),
    } as any);
  }, [user]);

  const broadcastIncomingCallDismiss = useCallback(async (conversationId: string, callEventId?: string) => {
    if (!user) return;
    const channel = supabase.channel(`voice-global:${user.id}`);
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.send({
            type: "broadcast",
            event: "incoming-call-dismiss",
            payload: { conversationId, callEventId, userId: user.id },
          }).finally(() => {
            setTimeout(() => {
              supabase.removeChannel(channel);
              resolve();
            }, 250);
          });
        }
      });
    });
  }, [user]);

  const initializeOutgoingConnection = useCallback(async (channel: ReturnType<typeof supabase.channel>, conversationId: string) => {
    if (!user) return;
    const outgoingCallMeta = outgoingCallMetaRef.current;
    if (!outgoingCallMeta || outgoingCallMeta.conversationId !== conversationId) {
      console.log("[Voice] ⚠️ initializeOutgoingConnection skipped — no outgoing meta for", conversationId);
      return;
    }
    // v0.3.9: if we ALREADY have a PC + a pending offer (from a prior attempt
    // or a duplicate ready-for-offer), just re-broadcast that offer instead
    // of silently returning. This is what was making the second peer "never
    // get placed in the call" — their ready-for-offer was being dropped on
    // the caller side and no offer ever reached them.
    if (pcRef.current && pendingOfferRef.current && pendingOfferRef.current.conversationId === conversationId) {
      console.log("[Voice] 🔁 PC already exists — re-broadcasting pending offer for late joiner");
      channel.send({
        type: "broadcast",
        event: "voice-signal",
        payload: {
          type: "offer",
          sdp: pendingOfferRef.current.offer,
          senderId: user.id,
          senderName: user.user_metadata?.display_name || "User",
          callerAvatarUrl: outgoingCallMeta.callerAvatarUrl,
          callEventId: outgoingCallMeta.callEventId,
        },
      });
      return;
    }
    if (pcRef.current) {
      // PC exists but no pending offer (e.g. mid-renegotiation). Don't blow it
      // away — just bail. The peer's next ready-for-offer retry will hit one
      // of the paths above once we have something to send.
      console.log("[Voice] ⚠️ initializeOutgoingConnection skipped — PC exists, no pending offer");
      return;
    }
    // Stale pending offer (left over from a previous call/peer-leave) must
    // not block a fresh negotiation. Clear it so rejoin handshake works.
    if (pendingOfferRef.current) {
      console.log("[Voice] 🧹 Clearing stale pendingOfferRef before fresh negotiation");
      pendingOfferRef.current = null;
    }

    console.log("[Voice] 📤 Initializing outgoing connection...");
    const stream = await getUserMedia();
    console.log("[Voice] ✅ Got media stream, tracks:", stream.getTracks().map(t => `${t.kind}:${t.label}:enabled=${t.enabled}`));
    setLocalStream(stream);
    localStreamRef.current = stream;
      originalMicTrackRef.current = stream.getAudioTracks()[0] || null;
    startAudioLevelMonitor(stream);

    const pc = createPeerConnection();
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
      console.log("[Voice] ➕ Added track to PC:", track.kind, track.label);
    });

    outgoingCandidateBuffer.current = [];
    incomingCandidateQueue.current = [];
    remoteDescriptionSet.current = false;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const candidate = event.candidate.toJSON();
        console.log("[Voice] 🧊 Outgoing ICE candidate:", event.candidate.type, event.candidate.protocol, event.candidate.address);
        outgoingCandidateBuffer.current.push(candidate);
        channel.send({
          type: "broadcast",
          event: "voice-signal",
          payload: { type: "ice-candidate", candidate, senderId: user.id },
        });
      } else {
        console.log("[Voice] 🧊 ICE gathering complete (null candidate)");
      }
    };

    const offer = await pc.createOffer();
    let sdp = offer.sdp || "";
    sdp = setHighQualityOpus(sdp);
    offer.sdp = sdp;
    await pc.setLocalDescription(offer);
    console.log("[Voice] 📤 Offer created and set as local description");

    pendingOfferRef.current = {
      offer,
      conversationId,
      callEventId: outgoingCallMeta.callEventId,
    };

    channel.send({
      type: "broadcast",
      event: "voice-signal",
      payload: {
        type: "offer",
        sdp: offer,
        senderId: user.id,
        senderName: user.user_metadata?.display_name || "User",
        callerAvatarUrl: outgoingCallMeta.callerAvatarUrl,
        callEventId: outgoingCallMeta.callEventId,
      },
    });
    console.log("[Voice] 📡 Offer sent to callee via broadcast");

    setActiveCall(prev => prev && prev.conversationId === conversationId ? { ...prev, state: "ringing" } : prev);
  }, [user, getUserMedia, createPeerConnection, startAudioLevelMonitor]);

  const setupSignaling = useCallback((conversationId: string): Promise<ReturnType<typeof supabase.channel>> => {
    return new Promise((resolve, reject) => {
      if (!user) { reject(new Error("No user")); return; }

      // v0.3.11: only reuse the cached channel if it's for the SAME
      // conversation. Otherwise tear it down — a stale channel from a
      // previous call was silently swallowing accept/rejoin signaling.
      if (channelRef.current) {
        if (channelConversationRef.current === conversationId) {
          console.log(`[Voice] ♻️ Reusing signaling channel for ${conversationId.substring(0,8)}`);
          resolve(channelRef.current);
          return;
        }
        console.log(`[Voice] 🧹 Dropping stale signaling channel (was ${channelConversationRef.current?.substring(0,8)}, now ${conversationId.substring(0,8)})`);
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
        channelConversationRef.current = null;
      }

      const channelName = `voice-call:${conversationId}`;
      console.log(`[Voice] 📡 Subscribing to signaling channel ${channelName}`);
      const channel = supabase.channel(channelName);

      channel.on("broadcast", { event: "voice-signal" }, async ({ payload }) => {
        if (payload.senderId === user.id) return;
        console.log(`[Voice] 📥 Signal received: ${payload.type} from ${payload.senderId?.substring(0,8)}...`);
        const pc = pcRef.current;
      const activeCallSnapshot = activeCallRef.current;
      const callEventIdSnapshot = currentCallEventIdRef.current;

        if (payload.type === "ready-for-offer") {
          try {
            if (!outgoingCallMetaRef.current && activeCallSnapshot?.conversationId === conversationId && callEventIdSnapshot) {
              outgoingCallMetaRef.current = {
                conversationId,
                callEventId: callEventIdSnapshot,
              };
            }
            await initializeOutgoingConnection(channel, conversationId);
          } catch (e) {
            console.error("[Voice] Failed to initialize outgoing connection (keeping call alive):", e);
            // v0.3.8: do NOT endCall on signaling errors — they're often
            // transient races on join. The user can hang up manually.
          }
          return;
        }

        if (payload.type === "offer") {
          const acceptedCall = acceptedIncomingCallRef.current;

          // Re-offer mid-call (e.g. peer enabled camera and renegotiated).
          // If we already have a connected PC and signaling is stable, accept
          // the new offer and answer it. This is the Perfect-Negotiation path
          // that makes "turning camera on after connect" actually work.
          if (pc && !acceptedCall && pc.signalingState === "stable") {
            try {
              console.log("[Voice] 🔁 Re-offer received mid-call — renegotiating");
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

              // CRITICAL CAMERA FIX: when the peer enables their camera and re-offers,
              // their offer's m=video line is `sendrecv`. But our local transceiver
              // (pre-allocated as sendrecv with no track) gets auto-downgraded to
              // `recvonly` in the answer because we have no local video track to send.
              // That's fine for THEM seeing US, but the bigger problem is: when WE
              // later enable our own camera, our `replaceTrack` succeeds locally but
              // the m-line direction in the last negotiated SDP is `recvonly`, so the
              // peer's browser refuses to render our track. Force every video
              // transceiver back to sendrecv before answering so the answer SDP
              // advertises sendrecv on our side too.
              try {
                pc.getTransceivers().forEach(t => {
                  if (t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video" || t === videoTransceiverRef.current) {
                    try { t.direction = "sendrecv"; } catch {}
                  }
                });
              } catch {}

              const answer = await pc.createAnswer();
              let sdp = answer.sdp || "";
              sdp = setHighQualityOpus(sdp);
              answer.sdp = sdp;
              await pc.setLocalDescription(answer);
              channel.send({
                type: "broadcast",
                event: "voice-signal",
                payload: { type: "answer", sdp: answer, senderId: user.id },
              });
            } catch (e) {
              console.warn("[Voice] Mid-call re-offer handling failed:", e);
            }
            return;
          }

          if (acceptedCall && acceptedCall.conversationId === conversationId && pc) {
            try {
              remoteDescriptionSet.current = true;
              await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              await flushQueuedIceCandidates(pc);

              const answer = await pc.createAnswer();
              let sdp = answer.sdp || "";
              sdp = setHighQualityOpus(sdp);
              answer.sdp = sdp;
              await pc.setLocalDescription(answer);

              channel.send({
                type: "broadcast",
                event: "voice-signal",
                payload: { type: "answer", sdp: answer, senderId: user.id },
              });

              setActiveCall(prev => prev && prev.conversationId === conversationId
                ? {
                    ...prev,
                    peerId: payload.senderId,
                    peerName: payload.senderName || acceptedCall.callerName,
                    state: "calling",
                  }
                : {
                    conversationId,
                    peerId: payload.senderId,
                    peerName: payload.senderName || acceptedCall.callerName,
                    state: "calling",
                    startedAt: undefined,
                    isMuted: false,
                    isDeafened: false,
                    isVideoOn: false,
                  }
              );

              acceptedIncomingCallRef.current = null;
              setIncomingCall(null);
            } catch (e) {
              console.error("[Voice] Failed handling accepted offer (keeping call alive):", e);
              // v0.3.8: don't tear down the call on a single SDP failure.
            }
            return;
          }

          // ── Rejoin auto-accept path ────────────────────────────────────
          // If we already have an activeCall on this conversation and no
          // peer connection yet, this offer is the response to OUR
          // `ready-for-offer` (we just clicked Rejoin). Don't show an
          // incoming-call ring — accept the offer in place and finish the
          // handshake so we end up actually connected. Without this branch
          // the rejoiner sat in "connected" state with no pc, no audio,
          // and a phantom incoming card.
          if (!pc && activeCallSnapshot?.conversationId === conversationId) {
            try {
              console.log("[Voice] 🔁 Rejoin offer received — auto-accepting");
              const stream = await getUserMedia();
              setLocalStream(stream);
              localStreamRef.current = stream;
              originalMicTrackRef.current = stream.getAudioTracks()[0] || null;
              startAudioLevelMonitor(stream);

              const newPc = createPeerConnection();
              stream.getTracks().forEach(track => {
                newPc.addTrack(track, stream);
              });
              outgoingCandidateBuffer.current = [];
              incomingCandidateQueue.current = [];
              remoteDescriptionSet.current = false;
              newPc.onicecandidate = (event) => {
                if (event.candidate) {
                  channel.send({
                    type: "broadcast",
                    event: "voice-signal",
                    payload: { type: "ice-candidate", candidate: event.candidate.toJSON(), senderId: user.id },
                  });
                }
              };

              remoteDescriptionSet.current = true;
              await newPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
              await flushQueuedIceCandidates(newPc);

              const answer = await newPc.createAnswer();
              let sdp = answer.sdp || "";
              sdp = setHighQualityOpus(sdp);
              answer.sdp = sdp;
              await newPc.setLocalDescription(answer);

              channel.send({
                type: "broadcast",
                event: "voice-signal",
                payload: { type: "answer", sdp: answer, senderId: user.id },
              });

              setActiveCall(prev => prev ? {
                ...prev,
                peerId: payload.senderId || prev.peerId,
                peerName: payload.senderName || prev.peerName,
                state: "calling",
                peerLeftAt: undefined,
              } : prev);
              peerIdRef.current = payload.senderId || peerIdRef.current;
            } catch (e) {
              console.error("[Voice] Rejoin auto-accept failed (keeping call alive):", e);
              // v0.3.8: don't endCall — leave it to the user.
            }
            return;
          }

          incomingCandidateQueue.current = [];
          remoteDescriptionSet.current = false;
          setIncomingCall({
            conversationId,
            callerId: payload.senderId,
            callerName: payload.senderName || "Unknown",
            callerAvatarUrl: payload.callerAvatarUrl,
            offer: payload.sdp,
            callEventId: payload.callEventId,
          });
          return;
        }

        if (payload.type === "answer" && pc) {
          console.log("[Voice] 📥 Answer received, setting remote description...");
          stopLooping("outgoingRing"); // peer picked up — stop ringing
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          remoteDescriptionSet.current = true;
          pendingOfferRef.current = null;
          await flushQueuedIceCandidates(pc);
          console.log("[Voice] ✅ Remote description set, queued candidates flushed");
          return;
        }

        if (payload.type === "ice-candidate") {
          if (pc && remoteDescriptionSet.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (e) {
              console.warn("[Voice] addIceCandidate failed:", e);
            }
          } else {
            console.log("[Voice] Queuing incoming ICE candidate (no remote desc yet)");
            incomingCandidateQueue.current.push(payload.candidate);
          }
          return;
        }

        // `peer-leave` (new in v0.2.26) and the legacy `hangup` event are now
        // handled the SAME way: the peer left, but WE stay in the call. We
        // close the per-peer pieces (PC, remote stream, screenshare PC) but
        // keep `activeCall` alive so the user remains "in the call alone" —
        // anyone in the conversation can still rejoin from the chat pill.
        // The call_event row is only marked ended once the last participant
        // leaves (see endCall).
        if (payload.type === "hangup" || payload.type === "peer-leave") {
          // v0.3.8: ignore stale peer-leaves from a *previous* call_event in
          // the same conversation. Without this scoping, a delayed broadcast
          // from a hung-up attempt could instantly kick us out of the brand-
          // new call we just joined (the "girlfriend joins and we both get
          // hung up" bug).
          if (payload.callEventId && callEventIdSnapshot && payload.callEventId !== callEventIdSnapshot) {
            console.log(`[Voice] 🛑 Ignoring stale peer-leave for ${payload.callEventId} (current=${callEventIdSnapshot})`);
            return;
          }
          console.log("[Voice] 👋 Peer left — keeping call alive locally; hard-resetting signaling state");
          try { pcRef.current?.close(); } catch {}
          pcRef.current = null;
          try { screenPcOutRef.current?.close(); } catch {}
          screenPcOutRef.current = null;
          try { screenPcInRef.current?.close(); } catch {}
          screenPcInRef.current = null;
          setRemoteStream(null);
          setRemoteScreenStream(null);
          setRemoteVideoStream(null);
          setRemoteAudioLevel(0);
          remoteAnalyserRef.current = null;
          cancelAnimationFrame(remoteAnimFrameRef.current);
          document.querySelectorAll("audio").forEach((el: any) => {
            if (el.__cubblyRemote) { el.pause(); el.srcObject = null; el.remove(); }
          });
          // Stop ringing on either side if we were still in calling/ringing.
          stopLooping("outgoingRing");
          stopLooping("incomingCall");
          setPeerInstantState({});
          // CRITICAL: clear ALL stale signaling state so the next rejoin
          // negotiation starts clean. Without this the staying peer's
          // initializeOutgoingConnection bails (stale pending offer), or
          // re-uses leftover ICE candidates from the dead PC, leaving the
          // rejoiner stuck in fake-connected with no audio.
          pendingOfferRef.current = null;
          acceptedIncomingCallRef.current = null;
          outgoingCallMetaRef.current = null;
          outgoingCandidateBuffer.current = [];
          incomingCandidateQueue.current = [];
          remoteDescriptionSet.current = false;
          // Tear down our local mic stream + audio level monitor. We're alone
          // in the call now; mic will be re-acquired fresh when the rejoiner
          // arrives. Keeping it hot caused getUserMedia() to stack a second
          // stream on rejoin, which is what made mute/deafen permanently
          // break the audio after a rejoin race.
          try { localStreamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
          localStreamRef.current = null;
          originalMicTrackRef.current = null;
          setLocalStream(null);
          stopAudioLevelMonitor();
          // Tear down per-peer gain pipelines so they don't leak into the
          // next negotiation with stale AudioContext nodes.
          try { clearAllPeerGains(); } catch {}
          // Stamp peerLeftAt so the call overlay flips the peer's avatar
          // label to "Not in call" IMMEDIATELY.
          setActiveCall(prev => prev ? { ...prev, peerLeftAt: Date.now() } : prev);
          // Tell useCallParticipants to re-fetch right now (covers dropped
          // realtime UPDATEs).
          try {
            window.dispatchEvent(new CustomEvent("cubbly:peer-left", {
              detail: { callEventId: currentCallEventId },
            }));
          } catch {}
          // Fire an immediate heartbeat so our last_seen_at is fresh — the
          // leaver's rejoin liveness check (30s window) will then see us and
          // join the SAME call_event instead of starting a fresh one.
          if (currentCallEventId) {
            void (async () => {
              try {
                await (supabase as any).rpc("heartbeat_call_participant", {
                  _call_event_id: currentCallEventId,
                });
              } catch {}
            })();
          }
          return;
        }

        if (payload.type === "screen-offer") {
          const screenPc = new RTCPeerConnection({ iceServers: iceServersRef.current });
          screenPc.ontrack = (event) => {
            const remoteScreen = event.streams[0];
            // Lower the inbound video jitter buffer so game streaming feels
            // real-time instead of delayed/laggy. Without this hint Chromium
            // happily buffers 200-400ms which makes screenshares feel like
            // they're running underwater.
            try { (event.receiver as any).playoutDelayHint = 0.05; } catch {}
            try { (event.receiver as any).jitterBufferTarget = 50; } catch {}
            setRemoteScreenStream(remoteScreen);
            // If this stream carries an audio track, route it through the
            // per-peer GainNode so the right-click "User Volume" slider AND
            // the fullscreen viewer's volume slider both control the
            // screen-share audio (not just the mic).
            const peerUserId = peerIdRef.current;
            if (peerUserId && event.track.kind === "audio") {
              // Use a dedicated hidden <audio> element so we don't fight the
              // <video> element's autoplay/render path.
              let el = document.querySelector<HTMLAudioElement>(`audio[data-cubbly-peer="${peerUserId}"][data-cubbly-kind="screen"]`);
              const isNew = !el;
              if (!el) {
                el = document.createElement("audio");
                (el as any).__cubblyRemote = true;
                document.body.appendChild(el);
              }
              el.srcObject = remoteScreen;
              if (isNew) {
                armRemoteAudio(el, { volume: settings.outputVolume / 100 });
              } else {
                el.play().catch(() => {});
              }
              attachPeerGain(peerUserId, remoteScreen, el, "screen");
            }
          };
          screenPc.onicecandidate = (event) => {
            if (event.candidate) {
              channel.send({
                type: "broadcast",
                event: "voice-signal",
                // role:"in" → this candidate was gathered on OUR incoming PC,
                // so the peer must apply it to THEIR outgoing PC.
                payload: { type: "screen-ice-candidate", role: "in", candidate: event.candidate, senderId: user.id },
              });
            }
          };
          screenPcInRef.current = screenPc;
          await screenPc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await screenPc.createAnswer();
          await screenPc.setLocalDescription(answer);
          channel.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "screen-answer", sdp: answer, senderId: user.id },
          });
          return;
        }

        if (payload.type === "screen-answer" && screenPcOutRef.current) {
          await screenPcOutRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          return;
        }

        if (payload.type === "screen-ice-candidate") {
          // role "in" came from peer's incoming PC → goes to our OUT PC.
          // role "out" came from peer's outgoing PC → goes to our IN PC.
          // Missing role (legacy) → try out first, then in.
          const target =
            payload.role === "in" ? screenPcOutRef.current :
            payload.role === "out" ? screenPcInRef.current :
            (screenPcOutRef.current || screenPcInRef.current);
          if (target) {
            try {
              await target.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (e) {
              console.error("Failed to add screen ICE candidate:", e);
            }
          }
          return;
        }

        if (payload.type === "screen-stop") {
          // Peer stopped THEIR share — only tear down our incoming PC.
          setRemoteScreenStream(null);
          screenPcInRef.current?.close();
          screenPcInRef.current = null;
        }

        // Instant peer state (mute/deafen/video) — bypasses DB realtime lag.
        if (payload.type === "peer-mute") {
          const muted = !!payload.isMuted;
          setPeerInstantState((prev) => ({
            ...prev,
            is_muted: muted,
            is_deafened: !!payload.isDeafened,
          }));
          // Defensive: also force their inbound mic gain to 0 here, so even
          // if their client misbehaves (the historical iOS-PWA mute leak)
          // we hear absolute silence locally.
          const peerUserId = peerIdRef.current;
          if (peerUserId) setPeerForcedMute(peerUserId, muted);
          return;
        }
        if (payload.type === "peer-video") {
          setPeerInstantState((prev) => ({
            ...prev,
            is_video_on: !!payload.isVideoOn,
          }));
          return;
        }
      });

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          channelConversationRef.current = conversationId;
          console.log(`[Voice] ✅ Signaling channel SUBSCRIBED for ${conversationId.substring(0,8)}`);
          resolve(channel);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(`[Voice] ❌ Signaling channel failed (${status}) for ${conversationId.substring(0,8)}`);
          reject(new Error(`Channel subscription failed: ${status}`));
        }
      });
    });
  }, [user, initializeOutgoingConnection, flushQueuedIceCandidates]);

  // Loopback ref for CubblyBot self-test
  const loopbackPcRef = useRef<{ local: RTCPeerConnection; remote: RTCPeerConnection } | null>(null);

  const startLoopbackTest = useCallback(async (conversationId: string) => {
    console.log("[Voice][Loopback] 🔁 Starting loopback self-test...");
    try {
      const stream = await getUserMedia();
      console.log("[Voice][Loopback] ✅ Got local media stream, tracks:", stream.getTracks().map(t => `${t.kind}:${t.label}:enabled=${t.enabled}`));
      setLocalStream(stream);
      localStreamRef.current = stream;
      originalMicTrackRef.current = stream.getAudioTracks()[0] || null;
      startAudioLevelMonitor(stream);

      const localPc = new RTCPeerConnection({ iceServers: iceServersRef.current, iceTransportPolicy: "all" });
      const remotePc = new RTCPeerConnection({ iceServers: iceServersRef.current, iceTransportPolicy: "all" });

      // Wire ICE candidates between the two local peers
      localPc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log("[Voice][Loopback] localPc ICE candidate →", e.candidate.type, e.candidate.protocol);
          remotePc.addIceCandidate(e.candidate).catch(err => console.warn("[Voice][Loopback] remotePc addIce failed:", err));
        }
      };
      remotePc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log("[Voice][Loopback] remotePc ICE candidate →", e.candidate.type, e.candidate.protocol);
          localPc.addIceCandidate(e.candidate).catch(err => console.warn("[Voice][Loopback] localPc addIce failed:", err));
        }
      };

      localPc.oniceconnectionstatechange = () => {
        console.log("[Voice][Loopback] localPc ICE state:", localPc.iceConnectionState);
        if (localPc.iceConnectionState === "connected" || localPc.iceConnectionState === "completed") {
          console.log("[Voice][Loopback] ✅ ICE CONNECTED — loopback audio should be playing!");
          setActiveCall(prev => prev ? { ...prev, state: "connected", startedAt: prev.startedAt || Date.now() } : prev);
        }
        if (localPc.iceConnectionState === "failed") {
          console.error("[Voice][Loopback] ❌ ICE FAILED — TURN/STUN may not be working");
        }
      };

      // When remotePc receives the track, play it back as audio
      remotePc.ontrack = (event) => {
        console.log("[Voice][Loopback] ✅ remotePc received track:", event.track.kind, event.track.label);
        const remote = event.streams[0];
        setRemoteStream(remote);
        const audioEl = document.createElement("audio");
        audioEl.srcObject = remote;
        (audioEl as any).__cubblyRemote = true;
        document.body.appendChild(audioEl);
        armRemoteAudio(audioEl, { volume: settings.outputVolume / 100, sinkId: settings.outputDeviceId });
        document.body.appendChild(audioEl);

        // Remote audio level monitor
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
        } catch {}
      };

      // Add tracks to localPc
      stream.getTracks().forEach(track => localPc.addTrack(track, stream));

      // Create and exchange offer/answer locally
      const offer = await localPc.createOffer();
      console.log("[Voice][Loopback] Offer created, setting local description...");
      await localPc.setLocalDescription(offer);
      await remotePc.setRemoteDescription(offer);
      const answer = await remotePc.createAnswer();
      await remotePc.setLocalDescription(answer);
      await localPc.setRemoteDescription(answer);
      console.log("[Voice][Loopback] ✅ Offer/Answer exchanged, waiting for ICE to connect...");

      loopbackPcRef.current = { local: localPc, remote: remotePc };
      // Store localPc so endCall can close it
      pcRef.current = localPc;
    } catch (e) {
      console.error("[Voice][Loopback] ❌ Failed:", e);
    }
  }, [getUserMedia, startAudioLevelMonitor, settings.outputVolume, settings.outputDeviceId]);

  const startCall = useCallback(async (conversationId: string, peerId: string, peerName: string) => {
    if (!user) return;
    const BOT_ID = "00000000-0000-0000-0000-000000000001";
    const isBotCall = peerId === BOT_ID;

    console.log(`[Voice] 📞 startCall — peer: ${peerName} (${peerId}), bot: ${isBotCall}`);

    try {
      stopLooping("incomingCall");
      stopLooping("outgoingRing");
      setIncomingCall(null);
      isRemoteHangup.current = false;

      if (activeCallRef.current?.conversationId !== conversationId && pcRef.current) {
        try { pcRef.current.close(); } catch {}
        pcRef.current = null;
      }
      if (channelRef.current && activeCallRef.current?.conversationId !== conversationId) {
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
        channelConversationRef.current = null;
      }

      // ─── Hardcoded invariant: only ONE call can ever be ongoing per chat. ───
      // Before starting a fresh one, check the DB for an existing ongoing
      // call_event in this conversation. If it exists, REUSE its id (we're
      // joining the live call) instead of inserting a second event — that
      // was the source of "two Ongoing Call pills" after a restart.
      let callEventId: string | null = null;
      let isJoiningExisting = false;
      // When rejoining, preserve the ORIGINAL call start time from the DB so
      // the elapsed timer (UI + chat pill) doesn't reset to 0 just because
      // one participant briefly dropped out. The call only truly "ends" when
      // the last participant leaves (state flips to "ended").
      let existingStartedAtMs: number | undefined;
      try {
        const { data: existing } = await supabase
          .from("call_events")
          .select("id, started_at")
          .eq("conversation_id", conversationId)
          .eq("state", "ongoing")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          // Liveness: another participant must be FRESHLY live (left_at NULL
          // AND last_seen_at within 30s). Stale ghosts no longer count, so
          // clicking voice/video starts a brand-new real call instead of
          // dropping you into a fake "calling..." with no one on the other end.
          const { data: liveRows } = await supabase
            .from("call_participants")
            .select("user_id, last_seen_at, left_at")
            .eq("call_event_id", existing.id);

          const FRESH_MS = 30_000;
          const now = Date.now();
          const otherActive = (liveRows || []).some((r: any) =>
            r.user_id !== user.id &&
            r.left_at === null &&
            (!r.last_seen_at || now - new Date(r.last_seen_at).getTime() < FRESH_MS)
          );

          if (otherActive) {
            callEventId = existing.id;
            isJoiningExisting = true;
            if (existing.started_at) {
              const t = Date.parse(existing.started_at);
              if (!Number.isNaN(t)) existingStartedAtMs = t;
            }
            console.log("[Voice] 🔁 Joining existing ongoing call_event:", callEventId);
          } else {
            // No real peer present. Ask the backend to close it only if it is
            // genuinely stale; brand-new events can exist for a moment before
            // the first participant heartbeat lands.
            try { await (supabase as any).rpc("end_call_event_if_stale", { _call_event_id: existing.id }); } catch {}
          }
        }
      } catch (e) {
        console.warn("[Voice] could not check for existing call_event:", e);
      }
      if (!callEventId) callEventId = crypto.randomUUID();

      if (isJoiningExisting) {
        await ensureOwnParticipantRow(callEventId!, {
          is_muted: activeCallRef.current?.isMuted ?? false,
          is_deafened: activeCallRef.current?.isDeafened ?? false,
          is_video_on: activeCallRef.current?.isVideoOn ?? false,
          is_screen_sharing: false,
        });
      }

      incomingCandidateQueue.current = [];
      outgoingCandidateBuffer.current = [];
      remoteDescriptionSet.current = false;
      pendingOfferRef.current = null;
      acceptedIncomingCallRef.current = null;

      setActiveCall({
        conversationId,
        peerId,
        peerName,
        // Stay in "calling" until ICE actually connects (the
        // oniceconnectionstatechange handler promotes us to "connected").
        // Pretending we're connected before the handshake completed was the
        // root cause of "rejoin lands you in a fake call with no audio".
        state: "calling",
        startedAt: existingStartedAtMs,
        isMuted: false,
        isDeafened: false,
        isVideoOn: false,
      });
      peerIdRef.current = peerId;
      activeCallRef.current = {
        conversationId,
        peerId,
        peerName,
        state: "calling",
        startedAt: existingStartedAtMs,
        isMuted: false,
        isDeafened: false,
        isVideoOn: false,
      };

      // Only play the outgoing ring when actually starting a brand new call.
      if (!isBotCall && !isJoiningExisting) {
        playLooping("outgoingRing", { volume: 0.4 });
      }

      // Only insert a new call_event row if we're NOT joining an existing one.
      if (!isJoiningExisting) {
        setCallEvents(prev => [...prev, {
          id: callEventId!,
          conversationId,
          state: "ongoing",
          startedAt: new Date().toISOString(),
        }]);
        await supabase.from("call_events").insert({
          id: callEventId,
          conversation_id: conversationId,
          caller_id: user.id,
          state: "ongoing",
        } as any);
        await ensureOwnParticipantRow(callEventId!);
      }
      setCurrentCallEventId(callEventId);

      if (isBotCall) {
        console.log("[Voice] 🤖 Bot call detected — starting loopback self-test");
        await startLoopbackTest(conversationId);
        return;
      }

      const channel = await setupSignaling(conversationId);

      let callerAvatarUrl: string | undefined;
      try {
        const { data: profile } = await supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle();
        callerAvatarUrl = profile?.avatar_url || undefined;
      } catch {}

      outgoingCallMetaRef.current = {
        conversationId,
        callEventId,
        callerAvatarUrl,
      };

      if (isJoiningExisting) {
        console.log("[Voice] 📡 Rejoin requested — asking active peer for an offer (with retries)");
        const sendReady = () => {
          channel.send({
            type: "broadcast",
            event: "voice-signal",
            payload: {
              type: "ready-for-offer",
              senderId: user.id,
              senderName: user.user_metadata?.display_name || "User",
              callEventId,
            },
          });
        };
        sendReady();
        // Retry: broadcast is best-effort; if the staying peer's signaling
        // channel is mid-resubscribe (post tab-wake) the first ready-for-offer
        // gets dropped. Retry a few times, cancel as soon as we have a PC.
        const retryDelays = [800, 1600, 3000, 5000];
        retryDelays.forEach((ms) => {
          setTimeout(() => {
            if (pcRef.current) return;
            console.log(`[Voice] 🔁 Re-sending ready-for-offer (no PC yet, +${ms}ms)`);
            try { sendReady(); } catch {}
          }, ms);
        });
        return;
      }

      const recipientGlobalChannel = supabase.channel(`voice-global:${peerId}`);
      recipientGlobalChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Voice] 📡 Sending incoming-call notification to peer");
          recipientGlobalChannel.send({
            type: "broadcast",
            event: "incoming-call",
            payload: {
              targetId: peerId,
              conversationId,
              callerId: user.id,
              callerName: user.user_metadata?.display_name || "User",
              callerAvatarUrl,
              callEventId,
            },
          });
          setTimeout(() => {
            supabase.removeChannel(recipientGlobalChannel);
          }, 3000);
        }
      });

      console.log("[Voice] ⏳ Waiting for callee to accept and send ready-for-offer...");
      void channel;
    } catch (e) {
      console.error("[Voice] ❌ Failed to start call:", e);
    }
  }, [user, setupSignaling, startLoopbackTest, ensureOwnParticipantRow]);

  /**
   * Dismiss the incoming-call ring on THIS device only — does NOT hang up an
   * already-connected call on a sibling device. Use this when the user clicks
   * the "decline" button on a stale incoming card (e.g. they already answered
   * on the desktop app and the web tab is still ringing). Sends a sibling
   * dismissal so any other tabs of mine also clear their ring.
   */
  const declineIncoming = useCallback(async () => {
    if (!incomingCall) return;
    const { conversationId, callEventId } = incomingCall;
    stopLooping("incomingCall");
    setIncomingCall(null);
    acceptedIncomingCallRef.current = null;
    try { void broadcastIncomingCallDismiss(conversationId, callEventId); } catch {}
  }, [incomingCall, broadcastIncomingCallDismiss]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !user) return;

    const acceptedCall = incomingCall;
    const acceptedCallEventId = acceptedCall.callEventId || crypto.randomUUID();
    console.log("[Voice] ✅ Accepting call from", acceptedCall.callerName, "hasOffer:", !!acceptedCall.offer);

    try {
      const channel = await setupSignaling(acceptedCall.conversationId);
      const stream = await getUserMedia();
      console.log("[Voice] ✅ Callee got media stream, tracks:", stream.getTracks().map(t => `${t.kind}:${t.label}:enabled=${t.enabled}`));
      setLocalStream(stream);
      localStreamRef.current = stream;
      originalMicTrackRef.current = stream.getAudioTracks()[0] || null;
      startAudioLevelMonitor(stream);

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log("[Voice] ➕ Callee added track:", track.kind, track.label);
      });

      outgoingCandidateBuffer.current = [];
      incomingCandidateQueue.current = [];
      remoteDescriptionSet.current = false;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("[Voice] 🧊 Callee ICE candidate:", event.candidate.type, event.candidate.protocol);
          channel.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "ice-candidate", candidate: event.candidate.toJSON(), senderId: user.id },
          });
        }
      };

      acceptedIncomingCallRef.current = acceptedCall;
      setActiveCall({
        conversationId: acceptedCall.conversationId,
        peerId: acceptedCall.callerId,
        peerName: acceptedCall.callerName,
        state: "ringing",
        startedAt: undefined,
        isMuted: false,
        isDeafened: false,
        isVideoOn: false,
      });
      peerIdRef.current = acceptedCall.callerId;
      setIncomingCall(null);
      void broadcastIncomingCallDismiss(acceptedCall.conversationId, acceptedCallEventId);
      await ensureOwnParticipantRow(acceptedCallEventId);

      if (acceptedCall.offer) {
        console.log("[Voice] 📥 Callee has offer, setting remote description and creating answer...");
        remoteDescriptionSet.current = true;
        await pc.setRemoteDescription(new RTCSessionDescription(acceptedCall.offer));
        await flushQueuedIceCandidates(pc);

        const answer = await pc.createAnswer();
        let sdp = answer.sdp || "";
        sdp = setHighQualityOpus(sdp);
        answer.sdp = sdp;
        await pc.setLocalDescription(answer);

        channel.send({
          type: "broadcast",
          event: "voice-signal",
          payload: { type: "answer", sdp: answer, senderId: user.id },
        });
        console.log("[Voice] 📡 Answer sent to caller");

        acceptedIncomingCallRef.current = null;
        setActiveCall(prev => prev ? { ...prev, state: "calling" } : prev);
      } else {
        console.log("[Voice] 📡 No offer yet, sending ready-for-offer to caller (with retries)...");
        const sendReady = () => {
          channel.send({
            type: "broadcast",
            event: "voice-signal",
            payload: {
              type: "ready-for-offer",
              senderId: user.id,
              senderName: user.user_metadata?.display_name || "User",
              callEventId: acceptedCallEventId,
            },
          });
        };
        sendReady();
        // v0.3.9: the very first ready-for-offer often races the caller's
        // signaling subscribe / our own subscribe ack. Retry a few times so
        // the second peer reliably gets placed in the call instead of
        // hanging forever in "ringing" with no offer ever arriving.
        const retryDelays = [600, 1400, 2800, 5000];
        retryDelays.forEach((ms) => {
          setTimeout(() => {
            // Stop retrying once we actually have a remote description set.
            if (remoteDescriptionSet.current) return;
            // Or if the call was ended / changed.
            if (activeCallRef.current?.conversationId !== acceptedCall.conversationId) return;
            console.log(`[Voice] 🔁 Re-sending ready-for-offer (+${ms}ms)`);
            try { sendReady(); } catch {}
          }, ms);
        });
      }

      setCurrentCallEventId(acceptedCallEventId);
      // NOTE: do NOT manually insert a CallEvent here. The realtime INSERT
      // subscription (see `setupCallEventsRealtime`) is the single source of
      // truth and uses the *real* `started_at` from the DB. Inserting a local
      // event with `new Date().toISOString()` (the receiver's accept time)
      // would put the call pill BELOW any messages sent after the call
      // actually started but before the receiver hit accept — wrong order.
    } catch (e) {
      console.error("Failed to accept call:", e);
    }
  }, [incomingCall, user, setupSignaling, getUserMedia, createPeerConnection, startAudioLevelMonitor, flushQueuedIceCandidates, broadcastIncomingCallDismiss, ensureOwnParticipantRow]);

  // Screen share loopback ref for bot calls
  const screenLoopbackPcRef = useRef<{ local: RTCPeerConnection; remote: RTCPeerConnection } | null>(null);

  // Screen sharing
  const startScreenShare = useCallback(async (type?: "screen" | "window" | "tab", options?: { audio?: boolean; fps?: number; quality?: string; sourceId?: string }) => {
    if (!user || !activeCall) return;

    const BOT_ID = "00000000-0000-0000-0000-000000000001";
    const isBotCall = activeCall.peerId === BOT_ID;

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

    // High-quality screenshare *audio* constraints — disabling the voice DSP
    // chain (echo/noise/AGC) is what stops music & game audio from sounding
    // muffled and warbled. Stereo + 48 kHz so we don't downsample.
    const screenAudioConstraints: any = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      sampleRate: 48000,
    };

    try {
      let stream: MediaStream;

      // Electron path: use the modern display-capture pipeline. Main injects
      // the chosen source + 'loopback' audio via setDisplayMediaRequestHandler.
      if (isElectron) {
        const api = (window as any).electronAPI;
        let selectedSourceId = options?.sourceId;
        if (!selectedSourceId && api?.getDesktopSources) {
          const sources = await api.getDesktopSources();
          let selectedSource = sources[0];
          if (type === "screen") {
            selectedSource = sources.find((s: any) => s.id.startsWith("screen:")) || selectedSource;
          } else if (type === "window") {
            selectedSource = sources.find((s: any) => s.id.startsWith("window:")) || selectedSource;
          }
          if (!selectedSource) throw new Error("No screen sources available");
          selectedSourceId = selectedSource.id;
        }
        // ---- Per-source audio strategy (Electron) -------------------------
        // Entire-screen pick → use Chromium's built-in 'loopback' (system mix).
        // Window/tab pick → use the native WASAPI process-loopback addon for
        // TRUE per-window audio. NEVER hand window/tab to Chromium loopback —
        // that leaks every other app's audio to the peer.
        const isScreenPick = typeof selectedSourceId === "string" && selectedSourceId.startsWith("screen:");
        const wantAudio = !!effectiveAudio;
        const electronAPI = (window as any).electronAPI;
        const nativeAvailable = electronAPI?.isWindowAudioCaptureAvailable
          ? await electronAPI.isWindowAudioCaptureAvailable()
          : false;
        const useChromiumLoopback = wantAudio && isScreenPick;
        const useNativeWindowAudio = wantAudio && !isScreenPick && nativeAvailable;

        await api.setSelectedShareSource(selectedSourceId, useChromiumLoopback);

        const videoConstraints: any = {
          frameRate: { ideal: effectiveFps, max: effectiveFps },
          ...(res
            ? { width: { ideal: res.width }, height: { ideal: res.height } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } }),
        };

        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: videoConstraints,
            audio: useChromiumLoopback ? screenAudioConstraints : false,
          } as any);
        } finally {
          try { await api.clearSelectedShareSource?.(); } catch {}
        }

        // Window/tab + native addon → start per-process WASAPI capture and mix
        // PCM frames into a fresh audio MediaStreamTrack added to `stream`.
        if (useNativeWindowAudio && selectedSourceId) {
          try {
            const { audioTrack, stop } = await startNativeWindowAudioStream(selectedSourceId);
            if (audioTrack) {
              stream.addTrack(audioTrack);
              nativeWindowAudioStopRef.current = stop;
              console.log("[Voice] 🎯 Native per-window audio attached to share");
            }
          } catch (e) {
            console.warn("[Voice] Native per-window audio failed, share will be video-only:", e);
          }
        }

        if (wantAudio && !useChromiumLoopback && !useNativeWindowAudio) {
          console.warn("[Voice] Window/tab share-audio requested but native addon unavailable — share is video-only.");
        }
        if (useChromiumLoopback && stream.getAudioTracks().length === 0) {
          console.warn("[Voice] Electron screen-share audio requested but no audio track produced");
        }
      } else {
        // Browser path: standard getDisplayMedia.
        const allowAudio = effectiveAudio && (type === "screen" || type === "tab");

        const videoConstraints: any = {
          frameRate: { ideal: effectiveFps, max: effectiveFps },
          ...(res
            ? { width: { ideal: res.width }, height: { ideal: res.height } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } }),
        };

        if (type === "tab") {
          videoConstraints.displaySurface = "browser";
        } else if (type === "window") {
          videoConstraints.displaySurface = "window";
        } else if (type === "screen") {
          videoConstraints.displaySurface = "monitor";
        }

        const audioConstraint = allowAudio
          ? ({ ...screenAudioConstraints, systemAudio: "include" } as any)
          : false;

        stream = await navigator.mediaDevices.getDisplayMedia({
          video: videoConstraints,
          audio: audioConstraint,
          // @ts-ignore - non-standard but supported in Chromium
          surfaceSwitching: "include",
          selfBrowserSurface: "exclude",
        } as any);

        if (!allowAudio) {
          stream.getAudioTracks().forEach(t => { t.stop(); stream.removeTrack(t); });
        }
      }

      setScreenStream(stream);
      setIsScreenSharing(true);
      playSound("screenshareStart", { volume: 0.4 });

      // Apply Optimization preset to the actual video track. Bitrates are
      // now scaled BY the user's chosen resolution AND optimization mode —
      // the previous "ultra=12 Mbps" cap was tanking both clients' calls
      // (encoder/decoder CPU + jitter buffer underruns) and "low quality"
      // didn't actually lower bitrate. Discord-style caps used here.
      const opt = screenShareSettings.optimizeFor;
      const hint = opt === "motion" ? "motion" : "detail";
      const resBitrateBase: Record<string, number> = {
        "480p":  900_000,
        "720p":  1_800_000,
        "1080p": 2_500_000,
        "1440p": 3_500_000,
      };
      const baseFor = resBitrateBase[effectiveQuality] ?? 1_800_000;
      // "ultra" gets a modest +50%, "motion" shaves quality for smoothness,
      // "detail" stays at base. Hard ceiling at 4 Mbps so a single screen-
      // share never starves the voice transceiver.
      const maxBitrate = Math.min(
        4_000_000,
        opt === "ultra"  ? Math.round(baseFor * 1.5) :
        opt === "motion" ? Math.round(baseFor * 0.85) :
        baseFor
      );

      // Force resolution / FPS via applyConstraints on the actual track —
      // Electron's desktopCapturer ignores constraints at getDisplayMedia time
      // so we must downscale post-capture.
      for (const t of stream.getVideoTracks()) {
        try { (t as any).contentHint = hint; } catch {}
        try {
          await (t as any).applyConstraints?.({
            ...(res ? { width: res.width, height: res.height } : {}),
            frameRate: effectiveFps,
          });
        } catch (e) {
          console.warn("[Voice] applyConstraints on screen track failed:", e);
        }
        try {
          const s = (t as any).getSettings?.();
          console.log("[Voice] 🖥️ screen video track settings:", s);
        } catch {}
      }

      // Bot call → loopback screenshare (echo video + audio back to yourself)
      if (isBotCall) {
        console.log("[Voice][Loopback] 🖥️ Starting screenshare loopback self-test...");
        const localPc = new RTCPeerConnection({ iceServers: iceServersRef.current });
        const remotePc = new RTCPeerConnection({ iceServers: iceServersRef.current });

        localPc.onicecandidate = (e) => {
          if (e.candidate) remotePc.addIceCandidate(e.candidate).catch(() => {});
        };
        remotePc.onicecandidate = (e) => {
          if (e.candidate) localPc.addIceCandidate(e.candidate).catch(() => {});
        };

        remotePc.ontrack = (event) => {
          if (event.track.kind === "video") {
            setRemoteScreenStream(event.streams[0]);
          } else if (event.track.kind === "audio") {
            const audioEl = document.createElement("audio");
            audioEl.srcObject = event.streams[0];
            (audioEl as any).__cubblyRemote = true;
            document.body.appendChild(audioEl);
            armRemoteAudio(audioEl, { volume: settings.outputVolume / 100 });
          }
        };

        stream.getTracks().forEach(track => {
          const sender = localPc.addTrack(track, stream);
          if (track.kind === "video") applyScreenBitrate(sender, maxBitrate);
          if (track.kind === "audio") applyScreenAudioBitrate(sender);
          track.onended = () => { stopScreenShare(); };
        });

        const offer = await localPc.createOffer();
        offer.sdp = patchScreenShareOpusSdp(offer.sdp || "");
        await localPc.setLocalDescription(offer);
        const remoteOffer = { type: offer.type, sdp: offer.sdp };
        await remotePc.setRemoteDescription(remoteOffer as RTCSessionDescriptionInit);
        const answer = await remotePc.createAnswer();
        answer.sdp = patchScreenShareOpusSdp(answer.sdp || "");
        await remotePc.setLocalDescription(answer);
        await localPc.setRemoteDescription({ type: answer.type, sdp: answer.sdp } as RTCSessionDescriptionInit);

        screenLoopbackPcRef.current = { local: localPc, remote: remotePc };
        screenPcOutRef.current = localPc;
        return;
      }

      // Normal call: send via signaling channel
      if (!channelRef.current) return;

      const screenPc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      screenPcOutRef.current = screenPc;

      stream.getTracks().forEach(track => {
        const sender = screenPc.addTrack(track, stream);
        if (track.kind === "video") applyScreenBitrate(sender, maxBitrate);
        if (track.kind === "audio") applyScreenAudioBitrate(sender);
        track.onended = () => {
          stopScreenShare();
        };
      });

      screenPc.onicecandidate = (event) => {
        if (event.candidate) {
          channelRef.current?.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "screen-ice-candidate", role: "out", candidate: event.candidate, senderId: user.id },
          });
        }
      };

      const offer = await screenPc.createOffer();
      offer.sdp = patchScreenShareOpusSdp(offer.sdp || "");
      await screenPc.setLocalDescription(offer);

      // Periodically log outbound stats so we can confirm the encoder is
      // actually delivering the bitrate / resolution we asked for.
      const statsInterval = setInterval(async () => {
        if (!screenPcOutRef.current || screenPcOutRef.current !== screenPc) {
          clearInterval(statsInterval);
          return;
        }
        try {
          const stats = await screenPc.getStats();
          stats.forEach((report: any) => {
            if (report.type === "outbound-rtp" && report.kind === "video") {
              console.log(`[Voice] 🖥️ outbound screen video — ${report.frameWidth}x${report.frameHeight}@${report.framesPerSecond}fps, bitrate≈${Math.round((report.bytesSent || 0) * 8 / 1000)}kbps total`);
            }
          });
        } catch {}
      }, 5000);

      channelRef.current.send({
        type: "broadcast",
        event: "voice-signal",
        payload: { type: "screen-offer", sdp: offer, senderId: user.id },
      });
    } catch (e) {
      console.error("Failed to start screen share:", e);
      setIsScreenSharing(false);
    }
  }, [user, activeCall, screenShareSettings, settings.outputVolume]);

  // Native per-window WASAPI audio capture lives in `@/lib/nativeWindowAudio`
  // (shared with GroupCallContext). See startNativeWindowAudioStream.


  const stopScreenShare = useCallback(() => {
    const wasSharing = screenStream !== null || isScreenSharing;
    screenStream?.getTracks().forEach(t => t.stop());
    setScreenStream(null);
    setIsScreenSharing(false);
    // NOTE: do NOT clear remoteScreenStream here — that belongs to the peer's
    // share and must stay alive when WE stop ours (Discord-style multi-stream).
    if (wasSharing) playSound("screenshareStop", { volume: 0.4 });

    // Tear down native per-window audio if it was active
    if (nativeWindowAudioStopRef.current) {
      try { nativeWindowAudioStopRef.current(); } catch {}
      nativeWindowAudioStopRef.current = null;
    }

    // Clean up screen loopback peers
    if (screenLoopbackPcRef.current) {
      console.log("[Voice][Loopback] Cleaning up screenshare loopback peers");
      screenLoopbackPcRef.current.local.close();
      screenLoopbackPcRef.current.remote.close();
      screenLoopbackPcRef.current = null;
    }

    // Only close OUR outgoing screen PC. Incoming peer share stays untouched.
    screenPcOutRef.current?.close();
    screenPcOutRef.current = null;

    if (channelRef.current && user) {
      channelRef.current.send({
        type: "broadcast",
        event: "voice-signal",
        payload: { type: "screen-stop", senderId: user.id },
      });
    }
  }, [screenStream, isScreenSharing, user]);

  const endCall = useCallback(() => {
    console.log("[Voice] 🔴 endCall — remote hangup:", isRemoteHangup.current);
    const endedAt = new Date().toISOString();

    // Stop all ringtones immediately
    stopLooping("outgoingRing");
    stopLooping("incomingCall");
    // Play leave-call sound (only if we were actually in/joining a call)
    if (activeCall || incomingCall) {
      playSound("leaveCall", { volume: 0.45 });
    }

    // Find the most-recent ongoing call event for this user/conversation.
    // Mark OUR participant row as `left_at` immediately. Only mark the WHOLE
    // call_event as ended when the LAST remaining participant has left —
    // otherwise the other person stays in the call and the chat-thread "Join"
    // pill keeps working for re-joiners (Discord behavior).
    const myUserId = user?.id;
    setCallEvents(prev => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].state === "ongoing") {
          const evt = updated[i];
          // Mark our own participant row left first, then check if anyone
          // else is still in. Do this in an async chain so we don't race.
          if (myUserId) {
            (async () => {
              try {
                // 1) Mark our own row as left.
                await supabase
                  .from("call_participants")
                  .update({ left_at: endedAt })
                  .eq("call_event_id", evt.id)
                  .eq("user_id", myUserId)
                  .is("left_at", null);

                // 2) Let the SERVER decide whether to end the event. The RPC
                // checks live participants with a freshness window so we don't
                // race the database into "ended" while a peer is still in the
                // call (which made Rejoin start a brand-new event instead of
                // dropping us back into the original one).
                try {
                  await (supabase as any).rpc("end_call_event_if_stale", {
                    _call_event_id: evt.id,
                    _stale_seconds: 30,
                  });
                } catch (e) {
                  console.warn("[Voice] end_call_event_if_stale RPC failed:", e);
                }

                // 3) Re-read the event state — only flip our local copy when
                // the server actually ended it. Avoids the leaver's UI showing
                // "ended" while the peer is still live.
                const { data: ev } = await supabase
                  .from("call_events")
                  .select("state, ended_at")
                  .eq("id", evt.id)
                  .maybeSingle();
                if (ev?.state === "ended") {
                  setCallEvents(curr => curr.map(e => e.id === evt.id
                    ? { ...e, state: "ended", endedAt: ev.ended_at || endedAt }
                    : e));
                }
              } catch (e) {
                console.warn("[Voice] endCall participant cleanup failed:", e);
              }
            })();
          }
          break;
        }
      }
      return updated;
    });

    stopScreenShare();
    setRemoteScreenStream(null);

    // Stop local camera
    localVideoStreamRef.current?.getTracks().forEach(t => t.stop());
    localVideoStreamRef.current = null;
    setLocalVideoStream(null);
    setRemoteVideoStream(null);
    videoTransceiverRef.current = null;

    // Tell the peer we left WITHOUT killing their call. They'll close the
    // RTCPeerConnection on their side and stay in the call alone — anyone
    // else in the conversation can still join from the chat-thread pill.
    // The legacy `hangup` event (which forced both sides to end) is gone.
    if (!isRemoteHangup.current && channelRef.current && user && pcRef.current) {
      channelRef.current.send({
        type: "broadcast",
        event: "voice-signal",
        // v0.3.8: stamp the callEventId so peers can ignore stale leaves
        // from a previous call attempt in the same conversation.
        payload: { type: "peer-leave", senderId: user.id, callEventId: currentCallEventIdRef.current },
      });
    }

    // Clean up loopback peers if they exist
    if (loopbackPcRef.current) {
      console.log("[Voice][Loopback] Cleaning up loopback peers");
      loopbackPcRef.current.local.close();
      loopbackPcRef.current.remote.close();
      loopbackPcRef.current = null;
    }

    pcRef.current?.close();
    pcRef.current = null;

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    originalMicTrackRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    peerIdRef.current = null;
    setIncomingCall(null);
    setCurrentCallEventId(null);
    stopAudioLevelMonitor();
    cancelAnimationFrame(remoteAnimFrameRef.current);
    remoteAnalyserRef.current = null;
    setRemoteAudioLevel(0);

    // Reset ICE queues
    incomingCandidateQueue.current = [];
    outgoingCandidateBuffer.current = [];
    remoteDescriptionSet.current = false;
    setPeerInstantState({});
    pendingOfferRef.current = null;
    acceptedIncomingCallRef.current = null;
    outgoingCallMetaRef.current = null;

    document.querySelectorAll("audio").forEach((el: any) => {
      if (el.__cubblyRemote) { el.pause(); el.srcObject = null; el.remove(); }
    });

    // Tear down per-peer gain pipelines so AudioContexts don't leak between calls.
    clearAllPeerGains();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      channelConversationRef.current = null;
    }
    console.log("[Voice] 🔴 Call ended, all resources cleaned up");
  }, [user, stopAudioLevelMonitor, stopScreenShare, activeCall, incomingCall]);

  // Keep endCall ref always current
  useEffect(() => { endCallRef.current = endCall; }, [endCall]);

  const upsertCurrentCallParticipantState = useCallback(async (patch: ParticipantStatePatch) => {
    if (!user || !currentCallEventId) return;

    const updates: ParticipantStatePatch = {};
    if (patch.is_muted !== undefined) updates.is_muted = patch.is_muted;
    if (patch.is_deafened !== undefined) updates.is_deafened = patch.is_deafened;
    if (patch.is_video_on !== undefined) updates.is_video_on = patch.is_video_on;
    if (patch.is_screen_sharing !== undefined) updates.is_screen_sharing = patch.is_screen_sharing;

    try {
      const { data: existing } = await supabase
        .from("call_participants")
        .select("id")
        .eq("call_event_id", currentCallEventId)
        .eq("user_id", user.id)
        .is("left_at", null)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("call_participants")
          .update(updates)
          .eq("id", existing.id);
        return;
      }

      await supabase.from("call_participants").insert({
        call_event_id: currentCallEventId,
        user_id: user.id,
        is_muted: false,
        is_deafened: false,
        is_video_on: false,
        is_screen_sharing: false,
        ...updates,
      });
    } catch (e) {
      console.warn("[Voice] Failed to upsert call participant state:", e);
    }
  }, [user, currentCallEventId]);

  /** Push my current mute/deafen state to call_participants so peers see it live */
  const syncCallParticipantState = useCallback(async (overrides?: { is_muted?: boolean; is_deafened?: boolean }) => {
    const currentMuted = overrides?.is_muted ?? activeCall?.isMuted ?? false;
    const currentDeafened = overrides?.is_deafened ?? activeCall?.isDeafened ?? false;

    await upsertCurrentCallParticipantState({
      is_muted: currentMuted,
      is_deafened: currentDeafened,
      is_video_on: activeCall?.isVideoOn ?? false,
    });
  }, [activeCall, upsertCurrentCallParticipantState]);

  // Keep the forward ref pointing at the latest function so the ICE handler
  // can call it the moment the call connects.
  useEffect(() => {
    syncParticipantRef.current = syncCallParticipantState;
  }, [syncCallParticipantState]);

  /**
   * Mute/unmute the local mic.
   *
   * IMPORTANT (v0.3.1): we used to also call `sender.replaceTrack(null)` /
   * `replaceTrack(originalMicTrackRef.current)` here to absolutely guarantee
   * zero RTP. That path was fragile — if the original track became `ended`
   * (device-change, iOS background trip, getUserMedia churn) the undeafen/
   * unmute call replaced with a dead track and the call was permanently
   * silent until reconnect. The simple `track.enabled = false` toggle is the
   * standard WebRTC pattern, never breaks the SRTP stream, and combined with
   * the `peer-mute` broadcast (which makes the receiver locally silence us
   * regardless) it's both safe and reliable on every platform.
   */
  const applyLocalMicMute = useCallback(async (muted: boolean) => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        try { track.enabled = !muted; } catch {}
      });
    }
    // Also flip the original-mic ref if we're holding one — keeps the two in sync.
    if (originalMicTrackRef.current) {
      try { originalMicTrackRef.current.enabled = !muted; } catch {}
    }
  }, []);

  const toggleMute = useCallback(() => {
    setActiveCall(prev => {
      if (!prev) return null;
      const newMuted = !prev.isMuted;
      void applyLocalMicMute(newMuted);
      playSound(newMuted ? "mute" : "unmute", { volume: 0.4 });
      try {
        channelRef.current?.send({
          type: "broadcast",
          event: "voice-signal",
          payload: { type: "peer-mute", senderId: user?.id, isMuted: newMuted, isDeafened: prev.isDeafened },
        });
      } catch {}
      syncCallParticipantState({ is_muted: newMuted, is_deafened: prev.isDeafened });
      return { ...prev, isMuted: newMuted };
    });
  }, [syncCallParticipantState, user, applyLocalMicMute]);

  const toggleDeafen = useCallback(() => {
    setActiveCall(prev => {
      if (!prev) return null;
      const newDeafened = !prev.isDeafened;

      // Route deafen through the per-peer gain pipeline. Direct el.muted
      // writes here used to corrupt the call: on desktop the audio is played
      // through a WebAudio GainNode while the element is intentionally
      // muted, so flipping el.muted=false on undeafen made the element
      // play in parallel with the graph → garbled audio that survived
      // toggling. setLocalDeafened consults state inside applyPeerGain so
      // both graph- and element-driven peers stay coherent.
      setLocalDeafened(newDeafened);
      playSound(newDeafened ? "deafen" : "undeafen", { volume: 0.4 });

      let nextMuted: boolean;
      if (newDeafened) {
        preMuteStateRef.current = prev.isMuted;
        void applyLocalMicMute(true);
        nextMuted = true;
      } else {
        const restoreMuted = preMuteStateRef.current;
        void applyLocalMicMute(restoreMuted);
        nextMuted = restoreMuted;
      }

      try {
        channelRef.current?.send({
          type: "broadcast",
          event: "voice-signal",
          payload: { type: "peer-mute", senderId: user?.id, isMuted: nextMuted, isDeafened: newDeafened },
        });
      } catch {}
      syncCallParticipantState({ is_muted: nextMuted, is_deafened: newDeafened });
      return { ...prev, isDeafened: newDeafened, isMuted: nextMuted };
    });
  }, [syncCallParticipantState, user, applyLocalMicMute, setLocalDeafened]);

  /**
   * Toggle the local camera on/off. Uses replaceTrack on the pre-allocated video
   * transceiver so no SDP renegotiation is required — the peer instantly sees
   * the new track (or a black frame when we set it back to null).
   */
  const toggleVideo = useCallback(async () => {
    let transceiver = videoTransceiverRef.current;
    const pc = pcRef.current;
    if (!pc) {
      console.warn("[Voice] Cannot toggle video — no peer connection.");
      return;
    }
    // If transceiver is missing (callee on old build), create one on the fly
    // and trigger a renegotiation so the peer sees our video.
    if (!transceiver) {
      try {
        transceiver = pc.addTransceiver("video", { direction: "sendrecv" });
        videoTransceiverRef.current = transceiver;
      } catch (e) {
        console.warn("[Voice] Failed to add video transceiver on demand:", e);
        return;
      }
    }
    // CRITICAL: force sendrecv so the peer's m=video line accepts our track.
    // Without this, replaceTrack succeeds locally but the peer never renders us.
    try { transceiver.direction = "sendrecv"; } catch {}
    const sender = transceiver.sender;
    const currentlyOn = !!sender.track;

    const upsertVideoState = async (isVideoOn: boolean) => {
      await upsertCurrentCallParticipantState({
        is_video_on: isVideoOn,
        is_muted: activeCall?.isMuted ?? false,
        is_deafened: activeCall?.isDeafened ?? false,
      });
    };

    if (currentlyOn) {
      await sender.replaceTrack(null);
      localVideoStreamRef.current?.getTracks().forEach(t => t.stop());
      localVideoStreamRef.current = null;
      setLocalVideoStream(null);
      setActiveCall(prev => prev ? { ...prev, isVideoOn: false } : prev);
      // Instant broadcast so peer hides the tile right away
      try {
        channelRef.current?.send({
          type: "broadcast",
          event: "voice-signal",
          payload: { type: "peer-video", senderId: user?.id, isVideoOn: false },
        });
      } catch {}
      upsertVideoState(false);
      return;
    }

    try {
      const resMap: Record<string, { width: number; height: number }> = {
        "480p": { width: 854, height: 480 },
        "720p": { width: 1280, height: 720 },
        "1080p": { width: 1920, height: 1080 },
      };
      const res = resMap[settings.videoResolution] || resMap["720p"];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: settings.videoDeviceId !== "default" ? { exact: settings.videoDeviceId } : undefined,
          width: { ideal: res.width },
          height: { ideal: res.height },
          frameRate: { ideal: settings.videoFrameRate, max: settings.videoFrameRate },
        },
        audio: false,
      });
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("No video track from camera");

      await sender.replaceTrack(videoTrack);

      // Always renegotiate when turning the camera ON. Even if the transceiver
      // was pre-allocated as "sendrecv", some browsers (Safari/Firefox) don't
      // forward the track to the peer until a fresh offer/answer cycle. Without
      // this, the camera shows for YOU but never for the OTHER person.
      try {
        if (pc.signalingState === "stable") {
          const offer = await pc.createOffer();
          offer.sdp = setHighQualityOpus(offer.sdp || "");
          await pc.setLocalDescription(offer);
          channelRef.current?.send({
            type: "broadcast",
            event: "voice-signal",
            payload: { type: "offer", sdp: offer, senderId: user?.id, callerAvatarUrl: outgoingCallMetaRef.current?.callerAvatarUrl },
          });
        }
      } catch (e) {
        console.warn("[Voice] Renegotiation after enabling video failed:", e);
      }

      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 2_500_000;
        (params.encodings[0] as any).networkPriority = "high";
        (params.encodings[0] as any).priority = "high";
        await sender.setParameters(params);
      } catch (e) {
        console.warn("[Voice] Could not set video encoding params:", e);
      }

      videoTrack.onended = () => {
        setLocalVideoStream(null);
        localVideoStreamRef.current = null;
        setActiveCall(prev => prev ? { ...prev, isVideoOn: false } : prev);
        sender.replaceTrack(null).catch(() => {});
        upsertVideoState(false);
      };

      localVideoStreamRef.current = stream;
      setLocalVideoStream(stream);
      setActiveCall(prev => prev ? { ...prev, isVideoOn: true } : prev);
      try {
        channelRef.current?.send({
          type: "broadcast",
          event: "voice-signal",
          payload: { type: "peer-video", senderId: user?.id, isVideoOn: true },
        });
      } catch {}
      upsertVideoState(true);
    } catch (e) {
      console.error("[Voice] Failed to start camera:", e);
    }
  }, [settings.videoDeviceId, settings.videoResolution, settings.videoFrameRate, activeCall, upsertCurrentCallParticipantState, user]);

  useEffect(() => {
    if (!user) return;
    const globalChannel = supabase.channel(`voice-global:${user.id}`);
    globalChannel
      .on("broadcast", { event: "incoming-call" }, async ({ payload }) => {
        const sameCallAlreadyOpen =
          activeCall?.conversationId === payload.conversationId ||
          incomingCall?.callEventId === payload.callEventId;
        if (payload.targetId !== user.id || activeCall || sameCallAlreadyOpen) return;

        try {
          const channel = await setupSignaling(payload.conversationId);
          setIncomingCall({
            conversationId: payload.conversationId,
            callerId: payload.callerId,
            callerName: payload.callerName || "Unknown",
            callerAvatarUrl: payload.callerAvatarUrl,
            callEventId: payload.callEventId,
          });
          playLooping("incomingCall", { volume: 0.5 });

          // v0.3.12: pre-fetch the SDP offer from the caller IMMEDIATELY,
          // before the user clicks Accept. This makes Accept a single fast
          // setRemoteDescription→createAnswer hop instead of a fragile
          // ready-for-offer round-trip after click (which was the root cause
          // of "Accept does nothing"). The voice-signal `offer` handler stores
          // the SDP into incomingCall via setIncomingCall on the no-pc/no-
          // acceptedCall branch — so by the time the user hits Accept, the
          // offer is already there.
          const sendReady = () => {
            try {
              channel.send({
                type: "broadcast",
                event: "voice-signal",
                payload: {
                  type: "ready-for-offer",
                  senderId: user.id,
                  senderName: user.user_metadata?.display_name || "User",
                  callEventId: payload.callEventId,
                },
              });
            } catch (e) {
              console.warn("[Voice] pre-accept ready-for-offer send failed:", e);
            }
          };
          sendReady();
          // Retry the pre-fetch a few times in case the caller's signaling
          // subscribe lost the first broadcast.
          [500, 1200, 2500, 4500].forEach((ms) => {
            setTimeout(() => {
              // Bail if we already have the offer, or the call is gone, or
              // we already accepted.
              const snap = incomingCallRef.current;
              if (!snap || snap.callEventId !== payload.callEventId) return;
              if (snap.offer) return;
              console.log(`[Voice] 🔁 Pre-accept re-sending ready-for-offer (+${ms}ms)`);
              sendReady();
            }, ms);
          });
        } catch (e) {
          console.error("Failed to setup signaling for incoming call:", e);
        }
      })
      .on("broadcast", { event: "incoming-call-dismiss" }, ({ payload }) => {
        const matchesIncoming =
          incomingCall?.callEventId === payload.callEventId ||
          incomingCall?.conversationId === payload.conversationId;
        const matchesActive =
          activeCall?.conversationId === payload.conversationId && activeCall?.state !== "connected";

        if (!matchesIncoming && !matchesActive) return;

        stopLooping("incomingCall");
        setIncomingCall((current) => {
          if (!current) return current;
          if (current.callEventId === payload.callEventId || current.conversationId === payload.conversationId) {
            return null;
          }
          return current;
        });
      });
    globalChannel.subscribe();
    return () => { supabase.removeChannel(globalChannel); };
  }, [user, activeCall, incomingCall, setupSignaling]);

  // Stop incoming ringtone as soon as we accept (incomingCall cleared) or it's superseded.
  useEffect(() => {
    if (!incomingCall) {
      stopLooping("incomingCall");
    }
  }, [incomingCall]);

  // Stop outgoing ring once the call is connected (or ended)
  useEffect(() => {
    if (!activeCall || activeCall.state === "connected") {
      stopLooping("outgoingRing");
    }
  }, [activeCall?.state]);

  // Auto-end behavior:
  // - 30s timeout while RINGING (unanswered) — Discord-like.
  // NOTE: removed the 5-min "lonely" auto-hangup. It was a blind wall-clock
  // timer that killed connected calls whether or not the peer was actually
  // gone. Discord doesn't auto-end connected calls; neither do we.
  // 30s unanswered timeout: ONLY stop the ringing sound (both sides). Do NOT
  // end the call — the caller stays in the call alone, the call_event stays
  // ongoing, and the callee can still hit "Join" from the chat-thread pill
  // afterwards. The call only ends when the caller explicitly hangs up
  // (Discord behavior).
  useEffect(() => {
    if (!activeCall) return;
    let unansweredTimer: ReturnType<typeof setTimeout> | null = null;
    if (activeCall.state === "calling" || activeCall.state === "ringing") {
      unansweredTimer = setTimeout(() => {
        console.log("[Voice] ⏰ 30s ring timeout — silencing ringtones, flipping UI to 'Not in call' (call stays open)");
        stopLooping("outgoingRing");
        stopLooping("incomingCall");
        // Mark the call as ring-timed-out so the CallPanel switches from
        // "Ringing…" → "Not in call". The call_event stays ongoing so the
        // peer can still Join via the chat-thread pill.
        setActiveCall(prev => prev && (prev.state === "calling" || prev.state === "ringing")
          ? { ...prev, ringTimedOut: true } : prev);
      }, 30_000);
    }
    return () => {
      if (unansweredTimer) clearTimeout(unansweredTimer);
    };
  }, [activeCall?.conversationId, activeCall?.state]);

  useEffect(() => {
    if (!incomingCall) return;
    const t = setTimeout(() => {
      stopLooping("incomingCall");
    }, 30_000);
    return () => clearTimeout(t);
  }, [incomingCall?.callEventId]);

  // Poll RTCPeerConnection.getStats() during a connected call to compute round-trip ping.
  useEffect(() => {
    if (!activeCall || activeCall.state !== "connected") {
      setPing(0);
      return;
    }
    const interval = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt: number | null = null;
        stats.forEach((report: any) => {
          if (report.type === "candidate-pair" && report.state === "succeeded" && typeof report.currentRoundTripTime === "number") {
            rtt = report.currentRoundTripTime;
          }
        });
        if (rtt != null) setPing(Math.round(rtt * 1000));
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeCall?.state]);

  // When the app/tab closes mid-call, mark our own participant row as left.
  // Do NOT force-end the entire call_event — that was kicking the other user
  // out whenever we backgrounded a mobile tab / minimized / hit bfcache.
  // The event will be auto-cleaned by startCall's "no active participants"
  // pruning the next time anyone tries to use it.
  useEffect(() => {
    if (!activeCall || !user || !currentCallEventId) return;
    const handleUnload = (e?: Event) => {
      // Skip bfcache navigations — the page is being frozen, not closed.
      if (e && (e as PageTransitionEvent).persisted) return;
      try {
        const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const headers = {
          apikey,
          Authorization: `Bearer ${apikey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        };
        const endedAt = new Date().toISOString();
        // Only mark our own participant row left. Leave call_event alone.
        fetch(
          `${baseUrl}/rest/v1/call_participants?call_event_id=eq.${currentCallEventId}&user_id=eq.${user.id}&left_at=is.null`,
          { method: "PATCH", headers, keepalive: true, body: JSON.stringify({ left_at: endedAt }) }
        ).catch(() => {});
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
    };
  }, [activeCall, user, currentCallEventId]);

  // Heartbeat: while in a real call, refresh last_seen_at every 10s so other
  // clients can tell us apart from a ghost. Without this, the new liveness
  // check would consider us stale after 30s and the rejoin pill would
  // incorrectly disappear.
  useEffect(() => {
    if (!activeCall || !user || !currentCallEventId) return;
    const tick = () => {
      // NOTE: supabase.rpc() returns a PostgrestBuilder (thenable, not a real
      // Promise) — calling `.catch()` directly on it throws
      // "rpc(...).catch is not a function". Wrap in an async IIFE.
      void (async () => {
        try {
          await (supabase as any).rpc("heartbeat_call_participant", {
            _call_event_id: currentCallEventId,
            _is_muted: activeCall.isMuted ?? null,
            _is_deafened: activeCall.isDeafened ?? null,
            _is_video_on: activeCall.isVideoOn ?? null,
            _is_screen_sharing: isScreenSharing ?? null,
          });
        } catch { /* ignore — heartbeat is best-effort */ }
      })();
    };
    tick();
    const i = setInterval(tick, 10_000);
    return () => clearInterval(i);
  }, [activeCall, user, currentCallEventId, isScreenSharing]);

  return (
    <VoiceContext.Provider value={{
      settings, updateSettings, screenShareSettings, updateScreenShareSettings,
      activeCall, startCall, acceptCall, declineIncoming, endCall,
      incomingCall, toggleMute, toggleDeafen, toggleVideo,
      localStream, remoteStream, localVideoStream, remoteVideoStream,
      audioLevel, remoteAudioLevel, availableDevices, refreshDevices, callEvents, currentCallEventId, detectedRegion,
      isScreenSharing, screenStream, remoteScreenStream, startScreenShare, stopScreenShare,
      ping,
      peerInstantState,
      getUserVolume, setUserVolume, isUserMuted, setUserMuted,
    }}>
      {children}
    </VoiceContext.Provider>
  );
};
