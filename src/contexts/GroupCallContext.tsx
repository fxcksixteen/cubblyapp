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
import { toast } from "sonner";
import { startNativeWindowAudioStream } from "@/lib/nativeWindowAudio";
import { usePeerGains } from "@/lib/peerGain";
import { armRemoteAudio } from "@/lib/iosAudioUnlock";
import { STUN_FALLBACK_SERVERS, sanitizeIceServersForSession } from "@/lib/webrtcIce";
import {
  applyScreenBitrate,
  applyScreenAudioBitrate,
  preferScreenShareCodec,
  patchScreenShareOpusSdp,
  loadScreenShareSettings,
} from "@/contexts/VoiceContext";

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

interface RingingMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface GroupCallContextType {
  activeCall: GroupActiveCall | null;
  incomingCall: GroupIncomingCall | null;
  peers: GroupPeer[];
  /** Members who were invited when we started the call but haven't joined yet.
   *  Empty for server voice channels — those don't ring anyone. */
  ringingMembers: RingingMember[];
  /** Round-trip ping (ms) — averaged across active peer connections. */
  ping: number;
  startCall: (conversationId: string, conversationName: string, memberIds: string[], options?: { isServerChannel?: boolean }) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: (type?: "screen" | "window" | "tab", options?: { audio?: boolean; fps?: number; quality?: string; sourceId?: string }) => Promise<void>;
  /** Local camera stream (for self-tile preview). */
  localVideoStream: MediaStream | null;
  /** Local screenshare stream (for self-tile preview). */
  localScreenStream: MediaStream | null;
  /** Audio level of the LOCAL mic (0-100). */
  selfAudioLevel: number;
  // Per-user volume + local mute API (Discord-style right-click menu).
  getUserVolume: (userId: string) => number;
  setUserVolume: (userId: string, volume: number) => void;
  isUserMuted: (userId: string) => boolean;
  setUserMuted: (userId: string, muted: boolean) => void;
}

const GroupCallContext = createContext<GroupCallContextType>({} as GroupCallContextType);
export const useGroupCall = () => useContext(GroupCallContext);

const STUN_SERVERS: RTCIceServer[] = STUN_FALLBACK_SERVERS;

const GROUP_SCREEN_RESOLUTIONS: Record<string, { width: number; height: number; bitrate: number }> = {
  "480p": { width: 854, height: 480, bitrate: 600_000 },
  "720p": { width: 1280, height: 720, bitrate: 1_200_000 },
  "1080p": { width: 1920, height: 1080, bitrate: 2_200_000 },
  "1440p": { width: 2560, height: 1440, bitrate: 3_000_000 },
};

/**
 * iOS Safari rejects strict sampleRate/sampleSize/channelCount on getUserMedia
 * — match DM-call constraints so server-call audio doesn't sound underwater
 * compared to 1:1 calls. v0.3.17: dropped `sampleSize: 24` (no consumer mic
 * supports it; it was the root cause of OverconstrainedError) and the caller
 * uses `getUserMediaSafe` below which retries with bare constraints on failure.
 *
 * v0.4.6: honour the user's Voice & Video settings (echo cancellation, noise
 * suppression, auto gain control, input device) — previously these were
 * hard-coded to true, which is why group/server-call mic audio sounded
 * "underwater" / heavily processed compared to DM calls even when the user
 * had disabled those toggles.
 */
const isMobileGC = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");

interface StoredVoiceSettings {
  inputDeviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

function loadUserVoiceSettings(): StoredVoiceSettings {
  try {
    const raw = localStorage.getItem("cubbly-voice-settings");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      inputDeviceId: typeof parsed?.inputDeviceId === "string" ? parsed.inputDeviceId : undefined,
      echoCancellation: typeof parsed?.echoCancellation === "boolean" ? parsed.echoCancellation : undefined,
      noiseSuppression: typeof parsed?.noiseSuppression === "boolean" ? parsed.noiseSuppression : undefined,
      autoGainControl: typeof parsed?.autoGainControl === "boolean" ? parsed.autoGainControl : undefined,
    };
  } catch {
    return {};
  }
}

function buildGroupMicConstraints(hiFi: boolean, keepDeviceId: boolean): MediaTrackConstraints {
  const s = loadUserVoiceSettings();
  const base: MediaTrackConstraints = {
    deviceId: keepDeviceId && s.inputDeviceId && s.inputDeviceId !== "default" ? { exact: s.inputDeviceId } : undefined,
    echoCancellation: s.echoCancellation ?? true,
    noiseSuppression: s.noiseSuppression ?? true,
    autoGainControl: s.autoGainControl ?? true,
  };
  if (hiFi && !isMobileGC) {
    (base as any).sampleRate = 48000;
    (base as any).channelCount = 2;
  }
  return base;
}

function clearStoredGroupInputDevice(reason: string) {
  try {
    const raw = localStorage.getItem("cubbly-voice-settings");
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed.inputDeviceId && parsed.inputDeviceId !== "default") {
      parsed.inputDeviceId = "default";
      localStorage.setItem("cubbly-voice-settings", JSON.stringify(parsed));
      window.dispatchEvent(new CustomEvent("cubbly:voice-settings-changed"));
      console.warn(`[GroupCall] 🎙️ stale inputDeviceId cleared (${reason})`);
    }
  } catch {}
}

async function getGroupMicSafe(): Promise<MediaStream> {
  const isConstraintErr = (e: any) => {
    const n = e?.name || "";
    return n === "OverconstrainedError" || n === "NotReadableError" || n === "NotFoundError" || n === "TypeError";
  };
  const tryGet = (audio: MediaTrackConstraints | true) =>
    navigator.mediaDevices.getUserMedia({ audio, video: false });

  // Tier A: hi-fi + deviceId
  try {
    const s = await tryGet(buildGroupMicConstraints(true, true));
    try { console.log("[GroupCall] 🎙️ mic settings:", s.getAudioTracks()[0]?.getSettings?.()); } catch {}
    return s;
  } catch (e: any) {
    if (!isConstraintErr(e)) throw e;
    console.warn("[GroupCall] 🎙️ hi-fi constraints rejected (", e?.name, ")");
  }

  // Tier B: base + deviceId
  try {
    const s = await tryGet(buildGroupMicConstraints(false, true));
    try { console.log("[GroupCall] 🎙️ mic settings (base):", s.getAudioTracks()[0]?.getSettings?.()); } catch {}
    return s;
  } catch (e: any) {
    if (!isConstraintErr(e)) throw e;
    console.warn("[GroupCall] 🎙️ base constraints rejected (", e?.name, ")");
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      console.warn("[GroupVoiceTrace] mic.devices", devs.filter(d => d.kind === "audioinput").map(d => ({ id: d.deviceId, label: d.label })));
    } catch {}
  }

  // Tier C: drop deviceId
  try {
    const s = await tryGet(buildGroupMicConstraints(false, false));
    try { console.log("[GroupCall] 🎙️ mic settings (no-device):", s.getAudioTracks()[0]?.getSettings?.()); } catch {}
    clearStoredGroupInputDevice("tier-c");
    return s;
  } catch (e: any) {
    if (!isConstraintErr(e)) throw e;
    console.warn("[GroupCall] 🎙️ no-device constraints rejected (", e?.name, ")");
  }

  // Tier D: bare
  try {
    const s = await tryGet(true);
    try { console.log("[GroupCall] 🎙️ mic settings (bare):", s.getAudioTracks()[0]?.getSettings?.()); } catch {}
    clearStoredGroupInputDevice("tier-d");
    return s;
  } catch (e: any) {
    console.error("[GroupCall] 🎙️ mic acquisition failed on all tiers:", e);
    try {
      toast.error("Couldn't open your microphone", {
        description: "Check that a mic is connected and Cubbly has mic permission, then rejoin the call.",
      });
    } catch {}
    throw e;
  }
}

/**
 * Force stereo high-bitrate Opus on outgoing SDP so server-call audio matches
 * DM-call fidelity. Without this the encoder defaults to ~32kbps mono speech
 * and music/background audio sounds muffled.
 */
function mungeGroupCallOpusSdp(sdp: string | undefined | null): string {
  if (!sdp) return sdp || "";
  return sdp.replace(/a=fmtp:111 ([^\r\n]*)/g, (_m, existing) => {
    const filtered = String(existing)
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !/^(stereo|sprop-stereo|maxaveragebitrate|useinbandfec|maxplaybackrate)=/i.test(s));
    filtered.push("stereo=1", "sprop-stereo=1", "maxaveragebitrate=256000", "useinbandfec=1", "maxplaybackrate=48000");
    return `a=fmtp:111 ${filtered.join(";")}`;
  });
}

async function applyGroupScreenVideoParams(sender: RTCRtpSender, opts: { bitrate: number; maxFramerate: number; scaleResolutionDownBy: number }) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = opts.bitrate;
    (params.encodings[0] as any).maxFramerate = opts.maxFramerate;
    if (opts.scaleResolutionDownBy > 1) {
      (params.encodings[0] as any).scaleResolutionDownBy = opts.scaleResolutionDownBy;
    }
    (params.encodings[0] as any).networkPriority = "medium";
    (params.encodings[0] as any).priority = "medium";
    (params as any).degradationPreference = "maintain-framerate";
    await sender.setParameters(params);
  } catch {}
}

async function applyRealtimeAudioParams(sender: RTCRtpSender, bitrate = 128_000) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].maxBitrate = bitrate;
    (params.encodings[0] as any).networkPriority = "high";
    (params.encodings[0] as any).priority = "high";
    await sender.setParameters(params);
  } catch {}
}

/**
 * Ring one member on their `voice-global:<uid>` broadcast channel. Waits for
 * the JOIN ack before publishing — supabase-js resolves `.subscribe()`
 * BEFORE the topic is actually joined server-side, and any broadcast fired
 * in that window is dropped on the floor. That race is the reason group-call
 * rings intermittently failed to reach every member. Retries once on failure
 * so a transient Realtime hiccup never leaves a friend with no way to join.
 */
async function ringMemberWithRetry(mid: string, payload: Record<string, unknown>, attempt = 0): Promise<void> {
  const ch = supabase.channel(`voice-global:${mid}`);
  const joined = await new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => { if (!settled) { settled = true; resolve(false); } }, 4000);
    ch.subscribe((status) => {
      if (settled) return;
      if (status === "SUBSCRIBED") { settled = true; window.clearTimeout(timer); resolve(true); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true; window.clearTimeout(timer); resolve(false);
      }
    });
  });
  try {
    if (joined) {
      const res: any = await ch.send({ type: "broadcast", event: "group-incoming-call", payload });
      if (res !== "ok" && attempt === 0) {
        setTimeout(() => { supabase.removeChannel(ch); void ringMemberWithRetry(mid, payload, 1); }, 400);
        return;
      }
    } else if (attempt === 0) {
      setTimeout(() => { supabase.removeChannel(ch); void ringMemberWithRetry(mid, payload, 1); }, 400);
      return;
    }
  } catch {
    if (attempt === 0) {
      setTimeout(() => { supabase.removeChannel(ch); void ringMemberWithRetry(mid, payload, 1); }, 400);
      return;
    }
  }
  setTimeout(() => supabase.removeChannel(ch), 3000);
}

async function sendGroupSignalReliably(
  channel: ReturnType<typeof supabase.channel> | null,
  payload: Record<string, unknown>,
  label: string,
  attempts = 3,
): Promise<void> {
  if (!channel) return;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res: any = await channel.send({ type: "broadcast", event: "group-signal", payload });
      if (res === "ok") return;
      if (attempt === attempts - 1) {
        console.warn(`[GroupCall] group-signal ${label} returned ${res}`);
        return;
      }
    } catch (e) {
      if (attempt === attempts - 1) {
        console.warn(`[GroupCall] group-signal ${label} failed:`, e);
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 180 * (attempt + 1)));
  }
}

const groupTrace = (phase: string, details?: Record<string, unknown>) => {
  try {
    console.log(`[GroupVoiceTrace] ${phase}`, details || {});
  } catch {
    console.log(`[GroupVoiceTrace] ${phase}`);
  }
};

async function logGroupVoiceDiagnostic(conversationId: string | null | undefined, tag: string, callEventId?: string | null) {
  if (!conversationId) return;
  try {
    const { data, error } = await (supabase as any).rpc("debug_voice_snapshot", {
      _conversation_id: conversationId,
      _call_event_id: callEventId ?? null,
    });
    if (error) console.warn(`[GroupVoiceTrace] diag.${tag}.error`, error);
    else console.log(`[GroupVoiceTrace] diag.${tag}`, data);
  } catch (e) {
    console.warn(`[GroupVoiceTrace] diag.${tag}.threw`, e);
  }
}

async function heartbeatGroupParticipantWithRetry(
  callEventId: string,
  userId: string,
  tag: string,
  patch?: { is_muted?: boolean | null; is_deafened?: boolean | null; is_video_on?: boolean | null; is_screen_sharing?: boolean | null },
): Promise<void> {
  let lastError: unknown = null;
  const delays = [0, 350, 900, 1800];
  for (const delay of delays) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const res: any = await (supabase as any).rpc("heartbeat_call_participant", {
        _call_event_id: callEventId,
        _is_muted: patch?.is_muted ?? false,
        _is_deafened: patch?.is_deafened ?? false,
        _is_video_on: patch?.is_video_on ?? false,
        _is_screen_sharing: patch?.is_screen_sharing ?? false,
      });
      if (res?.error) throw res.error;

      const { data: row, error: verifyError } = await (supabase as any)
        .from("call_participants")
        .select("user_id, left_at")
        .eq("call_event_id", callEventId)
        .eq("user_id", userId)
        .is("left_at", null)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (!row) throw new Error("participant row was not visible after heartbeat");
      groupTrace("participant.heartbeat.ok", { callEventId, userId, tag });
      return;
    } catch (e) {
      lastError = e;
      groupTrace("participant.heartbeat.retry", { callEventId, userId, tag, delay, error: e instanceof Error ? e.message : String(e) });
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Group heartbeat failed (${tag})`);
}



export const GroupCallProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [activeCall, setActiveCall] = useState<GroupActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<GroupIncomingCall | null>(null);
  const [peers, setPeers] = useState<GroupPeer[]>([]);
  const [ringingMembers, setRingingMembers] = useState<RingingMember[]>([]);
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
  const screenAudioSendersRef = useRef<Map<string, RTCRtpSender[]>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  // Local camera + screenshare track refs
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const localScreenTrackRef = useRef<MediaStreamTrack | null>(null);
  const localScreenEncodingRef = useRef<{ bitrate: number; maxFramerate: number; scaleResolutionDownBy: number } | null>(null);
  /** Cleanup fn for an active native (WASAPI) per-window audio capture, if any. */
  const nativeWindowAudioStopRef = useRef<(() => void) | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callEventIdRef = useRef<string | null>(null);
  const callConvIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const selfAnimRef = useRef<number>(0);
  const profileCacheRef = useRef<Map<string, { display_name: string; avatar_url: string | null }>>(new Map());
  const preMuteRef = useRef<boolean>(false);

  // Per-user volume / local mute (shared with VoiceContext via localStorage).
  const { getUserVolume, setUserVolume, isUserMuted, setUserMuted, setLocalDeafened, attachPeerGain, clearAllPeerGains } = usePeerGains();

  useEffect(() => {
    (window as any).__cubblyInCall = !!activeCall;
    (window as any).__cubblyScreenSharing = !!activeCall?.isScreenSharing;
    try { window.dispatchEvent(new Event("cubbly:realtime-media-load-change")); } catch {}
    return () => {
      (window as any).__cubblyInCall = false;
      (window as any).__cubblyScreenSharing = false;
    };
  }, [activeCall?.conversationId, activeCall?.isScreenSharing]);

  // v0.4.6: keep group/server-call mic in sync with Voice & Video settings.
  // Without this, the mic track keeps whatever processing it was created with
  // and toggling noise-suppression / AGC / echo-cancellation in Settings has
  // no effect until the user leaves and rejoins — which is what made server
  // calls sound "underwater" for users who preferred those toggles off.
  useEffect(() => {
    if (!activeCall) return;
    const reapply = () => {
      const track = localStreamRef.current?.getAudioTracks()[0];
      if (!track) return;
      const s = loadUserVoiceSettings();
      const constraints: MediaTrackConstraints = {
        echoCancellation: s.echoCancellation ?? true,
        noiseSuppression: s.noiseSuppression ?? true,
        autoGainControl: s.autoGainControl ?? true,
      };
      track.applyConstraints(constraints).catch((e) => {
        console.warn("[GroupCall] applyConstraints failed:", e);
      });
    };
    const onCustom = () => reapply();
    const onStorage = (e: StorageEvent) => {
      if (e.key === "cubbly-voice-settings") reapply();
    };
    window.addEventListener("cubbly:voice-settings-changed", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("cubbly:voice-settings-changed", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [activeCall?.conversationId]);


  // Fetch ICE servers (same as 1-on-1)
  useEffect(() => {
    if (!user) return;
    supabase.functions.invoke("get-turn-credentials").then(async ({ data, error }) => {
      iceServersRef.current = !error && data?.iceServers
        ? await sanitizeIceServersForSession(data.iceServers)
        : STUN_SERVERS;
    }).catch(() => { iceServersRef.current = STUN_SERVERS; });
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
      analyser.smoothingTimeConstant = 0.35;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastSelf = 0;
      const tick = () => {
        if (typeof document !== "undefined" && document.hidden) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const next = (avg / 255) * 100;
        if (Math.abs(next - lastSelf) > 0.3) {
          lastSelf = next;
          setSelfAudioLevel(next);
        }
      };
      tick();
      selfAnimRef.current = window.setInterval(tick, 100) as unknown as number;
    } catch (e) {
      console.warn("[GroupCall] Failed to start self audio monitor:", e);
    }
  }, []);

  const stopSelfMonitor = useCallback(() => {
    try { window.clearInterval(selfAnimRef.current as unknown as number); } catch {}
    try { cancelAnimationFrame(selfAnimRef.current); } catch {}
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
      analyser.smoothingTimeConstant = 0.35;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let interval = 0;
      let lastLevel = 0;
      const tick = () => {
        if (typeof document !== "undefined" && document.hidden) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        const next = (avg / 255) * 100;
        // Smaller gate keeps the speaking-ring smooth & reactive without
        // re-rendering every PeerTile 60×/s during silence.
        if (Math.abs(next - lastLevel) > 0.3) {
          lastLevel = next;
          setPeers(prev => prev.map(p => p.userId === peerId ? { ...p, audioLevel: next } : p));
        }
      };
      tick();
      interval = window.setInterval(tick, 100);
      audioCleanupRef.current.set(peerId, () => {
        window.clearInterval(interval);
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
        const sender = pc.addTrack(track, localStreamRef.current!);
        if (track.kind === "audio") void applyRealtimeAudioParams(sender);
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
      if (localScreenEncodingRef.current) void applyGroupScreenVideoParams(sender, localScreenEncodingRef.current);
    }

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (event.track.kind === "audio") {
        // Lower jitter buffer for snappier real-time feel
        try { (event.receiver as any).playoutDelayHint = 0.05; } catch { /* ignore */ }
        // Distinguish mic audio from screen-share audio (the sender labels its
        // screen stream id as `cubbly-screen-<userId>`). Mic + screen audio
        // need their own <audio> elements so concurrent tracks don't clobber
        // each other's srcObject. Both then route through the SAME per-peer
        // GainNode so one slider controls everything you hear from this peer.
        const isScreenAudio = !!stream?.id?.startsWith("cubbly-screen-");
        const kind = isScreenAudio ? "screen" : "mic";
        const selector = isScreenAudio
          ? `audio[data-group-peer="${peerId}"][data-cubbly-kind="screen"]`
          : `audio[data-group-peer="${peerId}"]:not([data-cubbly-kind="screen"])`;
        let audioEl = document.querySelector<HTMLAudioElement>(selector);
        const isNew = !audioEl;
        if (!audioEl) {
          audioEl = document.createElement("audio");
          audioEl.dataset.groupPeer = peerId;
          document.body.appendChild(audioEl);
        }
        audioEl.srcObject = stream;
        if (isNew) {
          // iOS PWA: arm with playsinline + autoplay + gesture-retry so the
          // recipient actually hears anything when they accept on iPhone.
          armRemoteAudio(audioEl);
        } else {
          audioEl.play().catch(() => {});
        }

        // Route every audible track for this peer through the per-peer
        // GainNode (Discord-style 0–200% slider + local mute).
        attachPeerGain(peerId, stream, audioEl, kind);

        // Only run the speaking-ring analyser on the MIC stream — running it
        // on screen audio would light up the ring whenever someone's video
        // makes noise.
        if (!isScreenAudio) {
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
        }
        return;
      }
      if (event.track.kind === "video") {
        // Decide camera vs screen by stream id label.
        const isScreen = stream?.id?.startsWith("cubbly-screen-");
        // Lower video jitter buffer so screen-share / game streams play in
        // near-real-time instead of buffering 200-400ms — that's what made
        // streams feel "laggy" even on fast networks.
        try { (event.receiver as any).playoutDelayHint = isScreen ? 0.05 : 0.08; } catch {}
        try { (event.receiver as any).jitterBufferTarget = isScreen ? 50 : 80; } catch {}
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
        void sendGroupSignalReliably(channelRef.current, {
          type: "ice-candidate",
          fromUserId: user.id,
          toUserId: peerId,
          candidate: event.candidate.toJSON(),
        }, "ice-candidate", 2);
    };

    // Perfect-negotiation: triggered automatically when we add/remove tracks
    pc.onnegotiationneeded = async () => {
      if (!channelRef.current || !user) return;
      try {
        makingOfferRef.current.set(peerId, true);
        // Explicit createOffer so we can patch the SDP for stereo high-bitrate
        // Opus before publishing it; without this, server-call audio defaults
        // to mono ~32kbps and sounds underwater compared to DM calls.
        const offer = await pc.createOffer();
        offer.sdp = mungeGroupCallOpusSdp(offer.sdp);
        await pc.setLocalDescription(offer);
        await sendGroupSignalReliably(channelRef.current, {
          type: "offer",
          fromUserId: user.id,
          toUserId: peerId,
          sdp: pc.localDescription,
        }, "offer(negotiationneeded)");
      } catch (e) {
        console.error("[GroupCall] negotiationneeded failed:", e);
      } finally {
        makingOfferRef.current.set(peerId, false);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === "audio") void applyRealtimeAudioParams(sender);
        });
      }
      if (pc.iceConnectionState === "failed") {
        try { (pc as any).restartIce?.(); } catch {}
        return;
      }
      if (pc.iceConnectionState === "closed") {
        removePeer(peerId);
      }
    };

    return pc;
  }, [user, startPeerMonitor, removePeer]);

  /** Build a peer entry in `peers` (lazy — avoids duplicates). Also removes
   *  the peer from `ringingMembers` since they've now joined. */
  const ensurePeerEntry = useCallback(async (peerId: string) => {
    setPeers(prev => prev.some(p => p.userId === peerId) ? prev : [...prev, { userId: peerId, displayName: "…", isMuted: false, audioLevel: 0, isVideoOn: false, isScreenSharing: false, videoStream: null, screenStream: null }]);
    setRingingMembers(prev => prev.some(r => r.userId === peerId) ? prev.filter(r => r.userId !== peerId) : prev);
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
  const startCall = useCallback(async (conversationId: string, conversationName: string, memberIds: string[], options?: { isServerChannel?: boolean }) => {
    if (!user) return;
    if (activeCall) {
      const channelState = (channelRef.current as any)?.state || (channelRef.current as any)?._state;
      const staleActiveCall =
        !localStreamRef.current &&
        pcsRef.current.size === 0 &&
        (!channelRef.current || channelState === "closed" || channelState === "errored" || channelState === "leaving");
      if (!staleActiveCall) {
        console.warn("[GroupCall] Already in a call");
        return;
      }
      groupTrace("start.stale-active-reset", { conversationId: activeCall.conversationId, channelState: channelState || "missing" });
      try { channelRef.current && supabase.removeChannel(channelRef.current); } catch {}
      channelRef.current = null;
      callEventIdRef.current = null;
      callConvIdRef.current = null;
      queuedIceRef.current.clear();
      remoteDescSetRef.current.clear();
      setPeers([]);
      setRingingMembers([]);
      setActiveCall(null);
    }
    const isServerChannel = !!options?.isServerChannel;
    console.log("[GroupCall] 📞 Starting group call in", conversationId, "with", memberIds.length, "members", isServerChannel ? "(server channel)" : "");
    groupTrace("start", { conversationId, memberCount: memberIds.length, isServerChannel });

    // v0.3.17: defensively wipe any stale PCs/senders left over from a prior
    // call that didn't fully clean up. Reusing an existing PC from a prior
    // session caused `setLocalDescription` to throw "order of m-lines in
    // subsequent offer doesn't match" because new addTrack calls extended the
    // m-line list past the previous answer.
    for (const [, pc] of pcsRef.current) { try { pc.close(); } catch {} }
    pcsRef.current.clear();
    videoSendersRef.current.clear();
    screenSendersRef.current.clear();
    queuedIceRef.current.clear();
    remoteDescSetRef.current.clear();

    // Get mic
    let stream: MediaStream;
    try {
      stream = await getGroupMicSafe();
    } catch (e) {
      console.error("[GroupCall] Failed to get mic:", e);
      toast.error("Couldn't join voice — check microphone access");
      return;
    }
    localStreamRef.current = stream;
    startSelfMonitor(stream);

    // Reuse an existing ongoing call_event for this conversation if one
    // exists — that's how "rejoin" works after everyone left or after a
    // user dropped out and wants to come back. For SERVER voice channels we
    // ALWAYS reuse any ongoing event (the channel is a persistent room, so a
    // fresh joiner must land in the same call as anyone already there — even
    // if their heartbeat is stale from a brief network hiccup). For group DMs
    // we only reuse when at least one OTHER participant is genuinely fresh,
    // otherwise the elapsed timer would jump to hours-old on a ghost event.
    let callEventId: string;
    let callStartedAt: number = Date.now();
    try {
      const { data: existing } = await supabase
        .from("call_events")
        .select("id, started_at")
        .eq("conversation_id", conversationId)
        .eq("state", "ongoing")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let reused = false;
      if (existing?.id) {
        try {
          const { data: canonicalId } = await (supabase as any).rpc("canonicalize_ongoing_call_event", {
            _conversation_id: conversationId,
            _preferred_call_event_id: existing.id,
          });
          if (canonicalId && canonicalId !== existing.id) existing.id = canonicalId;
        } catch { /* older backend: continue with newest event */ }
        if (isServerChannel) {
          // Server voice channels: unconditionally reuse. One channel = one call.
          callEventId = existing.id;
          if (existing.started_at) callStartedAt = new Date(existing.started_at).getTime();
          reused = true;
        } else {
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
            if (existing.started_at) callStartedAt = new Date(existing.started_at).getTime();
            reused = true;
          } else {
            // Close the stale ghost so it doesn't keep haunting future joins.
            try { await (supabase as any).rpc("end_call_event_if_stale", { _call_event_id: existing.id }); } catch {}
          }
        }
      }
      if (!reused) {
        callEventId = crypto.randomUUID();
        callStartedAt = Date.now();
        await supabase.from("call_events").insert({
          id: callEventId,
          conversation_id: conversationId,
          caller_id: user.id,
          state: "ongoing",
        } as any);
      }
    } catch {
      callEventId = crypto.randomUUID();
      callStartedAt = Date.now();
      await supabase.from("call_events").insert({
        id: callEventId,
        conversation_id: conversationId,
        caller_id: user.id,
        state: "ongoing",
      } as any);
    }
    callEventIdRef.current = callEventId;
    callConvIdRef.current = conversationId;

    // Insert participant row for self via the heartbeat RPC so left_at is
    // cleared and last_seen_at is fresh (revives any prior row instead of
    // failing the unique constraint).
    try {
      await heartbeatGroupParticipantWithRetry(callEventId, user.id, "join", {
        is_muted: false,
        is_deafened: false,
        is_video_on: false,
        is_screen_sharing: false,
      });
    } catch (e) {
      console.error("[GroupVoiceTrace] participant.heartbeat.failed", { conversationId, callEventId, error: e });
      void logGroupVoiceDiagnostic(conversationId, "join-heartbeat-failed", callEventId);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      stopSelfMonitor();
      toast.error("Couldn't join voice — try again");
      return;
    }
    void logGroupVoiceDiagnostic(conversationId, isServerChannel ? "server-join" : "group-join", callEventId);

    setActiveCall({ conversationId, conversationName, joinedAt: callStartedAt, isMuted: false, isDeafened: false, isVideoOn: false, isScreenSharing: false });
    playSound("joinCall", { volume: 0.4 });

    // Subscribe to call channel
    await joinCallChannel(conversationId);

    // Server voice channels are drop-in rooms — they must NEVER ring the
    // server roster. Group DMs do ring every member so friends get the
    // incoming-call overlay.
    if (isServerChannel) return;

    // Notify each member individually via their global channel. Wait for the
    // JOIN ack before sending (supabase.channel().subscribe() resolves BEFORE
    // the server has actually joined the topic, and a broadcast fired in that
    // window is silently dropped — which is why rings intermittently didn't
    // reach every member). Retry once on failure so a transient dropout
    // doesn't leave a friend with no way to join.
    let callerAvatarUrl: string | undefined;
    try {
      const { data } = await supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle();
      callerAvatarUrl = data?.avatar_url || undefined;
    } catch {}
    const payloadFor = (mid: string) => ({
      targetId: mid,
      conversationId,
      conversationName,
      callerId: user.id,
      callerName: user.user_metadata?.display_name || "Member",
      callerAvatarUrl,
      callEventId,
    });
    // Seed the ringing tiles immediately so the caller sees "Calling…" per
    // invited member before their profiles resolve.
    const rungIds = memberIds.filter(mid => mid !== user.id);
    setRingingMembers(rungIds.map(mid => ({ userId: mid, displayName: "…", avatarUrl: null })));
    // Hydrate names/avatars in the background.
    void Promise.all(rungIds.map(async (mid) => {
      const p = await loadProfile(mid);
      setRingingMembers(prev => prev.map(r => r.userId === mid ? { ...r, displayName: p.display_name, avatarUrl: p.avatar_url } : r));
    }));
    // Auto-hide "Calling…" tiles for anyone who hasn't picked up in 30s —
    // only if we're still in this same call (avoid clobbering a subsequent
    // call started right after this one).
    const ringTimeoutForConv = conversationId;
    window.setTimeout(() => {
      if (callConvIdRef.current !== ringTimeoutForConv) return;
      setRingingMembers([]);
    }, 30_000);

    for (const mid of memberIds) {
      if (mid === user.id) continue;
      void ringMemberWithRetry(mid, payloadFor(mid));
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
      if (channelRef.current) {
        try { supabase.removeChannel(channelRef.current); } catch {}
        channelRef.current = null;
      }
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
              offer.sdp = mungeGroupCallOpusSdp(offer.sdp);
              await pc.setLocalDescription(offer);
              await sendGroupSignalReliably(channel, { type: "offer", fromUserId: user.id, toUserId: payload.fromUserId, sdp: pc.localDescription }, "offer(peer-join)");
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
            if (offerCollision && polite) {
              try { await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit); } catch {}
            }
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
            remoteDescSetRef.current.set(payload.fromUserId, true);
            const queued = queuedIceRef.current.get(payload.fromUserId) || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            queuedIceRef.current.delete(payload.fromUserId);

            const answer = await pc.createAnswer();
            answer.sdp = mungeGroupCallOpusSdp(answer.sdp);
            await pc.setLocalDescription(answer);
            await sendGroupSignalReliably(channel, { type: "answer", fromUserId: user.id, toUserId: payload.fromUserId, sdp: pc.localDescription }, "answer(offer)");
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
          if (ignoreOfferRef.current.get(payload.fromUserId)) return;
          const pc = pcsRef.current.get(payload.fromUserId);
          if (pc && remoteDescSetRef.current.get(payload.fromUserId)) {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(() => {});
          } else {
            const queue = queuedIceRef.current.get(payload.fromUserId) || [];
            if (queue.length >= 50) queue.shift();
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

      channel.subscribe((status, err) => {
        groupTrace("channel.status", { conversationId, status, error: err instanceof Error ? err.message : undefined });
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          // Announce our presence so existing peers offer to us
          const sendJoin = (delay = 0) => {
            window.setTimeout(() => {
              void sendGroupSignalReliably(channel, { type: "peer-join", fromUserId: user.id }, "peer-join");
            }, delay);
          };
          sendJoin(0);
          sendJoin(700);
          sendJoin(1800);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void logGroupVoiceDiagnostic(conversationId, `channel-${status.toLowerCase()}`, callEventIdRef.current);
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
      stream = await getGroupMicSafe();
    } catch (e) {
      console.error("[GroupCall] Mic permission denied:", e);
      toast.error("Couldn't join voice — check microphone access");
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
    playSound("joinCall", { volume: 0.4 });

    // Insert participant row via the heartbeat RPC so a previously-left
    // row is REVIVED (left_at cleared) instead of failing the unique
    // (call_event_id, user_id) constraint.
    if (inc.callEventId) {
      try {
        await heartbeatGroupParticipantWithRetry(inc.callEventId, user.id, "accept", {
          is_muted: false,
          is_deafened: false,
          is_video_on: false,
          is_screen_sharing: false,
        });
      } catch (e) {
        console.error("[GroupVoiceTrace] accept.heartbeat.failed", { conversationId: inc.conversationId, callEventId: inc.callEventId, error: e });
        void logGroupVoiceDiagnostic(inc.conversationId, "accept-heartbeat-failed", inc.callEventId);
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        stopSelfMonitor();
        setActiveCall(null);
        toast.error("Couldn't join voice — try again");
        return;
      }
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
      void sendGroupSignalReliably(channelRef.current, { type: "peer-leave", fromUserId: user.id }, "peer-leave", 2);
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
    clearAllPeerGains();
    stopSelfMonitor();

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (activeCall) playSound("leaveCall", { volume: 0.4 });
    setActiveCall(null);
    setPeers([]);
    setRingingMembers([]);
    setPing(0);
    callEventIdRef.current = null;
    callConvIdRef.current = null;
  }, [user, removePeer, stopSelfMonitor, activeCall]);

  const toggleMute = useCallback(() => {
    setActiveCall(prev => {
      if (!prev) return null;
      const newMuted = !prev.isMuted;
      localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
      playSound(newMuted ? "mute" : "unmute", { volume: 0.4 });
      // Broadcast to peers
      if (channelRef.current && user) {
        void sendGroupSignalReliably(channelRef.current, { type: "peer-mute", fromUserId: user.id, isMuted: newMuted }, "peer-mute", 2);
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
      // Use the gain-pipeline deafen instead of writing el.muted directly:
      // group calls route every peer through a per-peer GainNode while the
      // <audio> element stays muted. Flipping el.muted on undeafen made the
      // element start playing IN ADDITION to the graph → garbled audio that
      // didn't recover until the call was rebuilt.
      setLocalDeafened(newDeafened);
      playSound(newDeafened ? "deafen" : "undeafen", { volume: 0.4 });
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
        void sendGroupSignalReliably(channelRef.current, { type: "peer-mute", fromUserId: user.id, isMuted: nextMuted }, "peer-mute(deafen)", 2);
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
  }, [user, setLocalDeafened]);

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
      void sendGroupSignalReliably(channelRef.current, { type: "peer-video", fromUserId: user.id, isVideoOn: true }, "peer-video", 2);
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
      void sendGroupSignalReliably(channelRef.current, { type: "peer-video", fromUserId: user.id, isVideoOn: false }, "peer-video", 2);
    }
  }, [activeCall, user]);

  /**
   * Toggle screen share. Unified with DM 1-on-1 pipeline (v0.4.5): honors the
   * user's `screenShareSettings` (resolution/fps/audio/optimizeFor), applies
   * the same Ultra vs Discord-parity bitrate ladder, prefers VP9/AV1, patches
   * Opus SDP for stereo high-bitrate share audio, and re-asserts the mic mute
   * state after renegotiation so starting a share never auto-unmutes/mutes.
   * Same per-source audio strategy on Electron (Chromium loopback only for
   * full-screen picks, native WASAPI addon for window/tab picks).
   */
  const toggleScreenShare = useCallback(async (type?: "screen" | "window" | "tab", options?: { audio?: boolean; fps?: number; quality?: string; sourceId?: string }) => {
    if (!activeCall || !user) return;
    if (!activeCall.isScreenSharing) {
      const shareSettings = loadScreenShareSettings();
      const effectiveAudio = options?.audio ?? shareSettings.audioShare;
      const effectiveFps = options?.fps ?? shareSettings.frameRate;
      const effectiveQuality = options?.quality ?? shareSettings.resolution;

      const resolutionMap: Record<string, { width: number; height: number } | undefined> = {
        "480p": { width: 854, height: 480 },
        "720p": { width: 1280, height: 720 },
        "1080p": { width: 1920, height: 1080 },
        "1440p": { width: 2560, height: 1440 },
      };
      const res = resolutionMap[effectiveQuality];

      // Same DSP-off stereo constraints DM uses so music/game audio isn't crushed.
      const screenAudioConstraints: any = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      };

      let stream: MediaStream;
      try {
        const api = (window as any).electronAPI;
        if (api?.isElectron) {
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
          // ---- Per-source audio strategy (Electron) — identical to DM path.
          // screen:*  → Chromium 'loopback' (system mix, matches picked screen).
          // window:*/tab → native WASAPI process-loopback addon (per-app only).
          // NEVER hand a window/tab to Chromium loopback — that would leak
          // every other app's audio (including the sharer hearing herself).
          const isScreenPick = typeof selectedSourceId === "string" && selectedSourceId.startsWith("screen:");
          const wantAudio = !!effectiveAudio;
          const nativeAvailable = api?.isWindowAudioCaptureAvailable
            ? await api.isWindowAudioCaptureAvailable()
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

          if (useNativeWindowAudio && selectedSourceId) {
            try {
              const { audioTrack, stop } = await startNativeWindowAudioStream(selectedSourceId);
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
          // Browser path — same DM constraints incl. selfBrowserSurface:exclude.
          const allowAudio = !!effectiveAudio && (type === "screen" || type === "tab");
          const videoConstraints: any = {
            frameRate: { ideal: effectiveFps, max: effectiveFps },
            ...(res
              ? { width: { ideal: res.width }, height: { ideal: res.height } }
              : { width: { ideal: 1920 }, height: { ideal: 1080 } }),
          };
          if (type === "tab") videoConstraints.displaySurface = "browser";
          else if (type === "window") videoConstraints.displaySurface = "window";
          else if (type === "screen") videoConstraints.displaySurface = "monitor";

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
      } catch (e) {
        console.error("[GroupCall] Screen share denied:", e);
        return;
      }

      // ---- Encoding params — identical ladder & degradation prefs to DM.
      const opt = shareSettings.optimizeFor;
      const hint = opt === "ultra" ? "" : opt === "motion" ? "motion" : "detail";
      const isHighFps = effectiveFps >= 50;
      const isUltra = opt === "ultra";
      const resBitrateBase: Record<string, number> = isUltra ? {
        "480p":  1_500_000,
        "720p":  isHighFps ? 4_500_000 : 3_500_000,
        "1080p": isHighFps ? 10_000_000 : 6_000_000,
        "1440p": isHighFps ? 16_000_000 : 11_000_000,
      } : {
        "480p":  1_000_000,
        "720p":  isHighFps ? 3_000_000 : 2_500_000,
        "1080p": isHighFps ? 7_500_000 : 4_500_000,
        "1440p": isHighFps ? 12_000_000 : 8_000_000,
      };
      const maxBitrate = resBitrateBase[effectiveQuality] ?? 2_500_000;
      const targetHeight = res?.height ?? 1080;
      const fpsCap =
        targetHeight <= 480 ? Math.max(20, Math.min(effectiveFps, 24)) :
        effectiveFps;

      let capturedHeight = 0;
      for (const t of stream.getVideoTracks()) {
        try { (t as any).contentHint = hint; } catch {}
        try {
          await (t as any).applyConstraints?.({
            ...(res ? { width: res.width, height: res.height } : {}),
            frameRate: fpsCap,
          });
        } catch {}
        try {
          const s = (t as any).getSettings?.();
          if (s?.height) capturedHeight = Math.max(capturedHeight, s.height);
        } catch {}
      }
      const scaleResolutionDownBy = capturedHeight > targetHeight
        ? +(capturedHeight / targetHeight).toFixed(2)
        : 1;
      const encodingOpts = {
        scaleResolutionDownBy,
        maxFramerate: fpsCap,
        preferMotion: opt === "motion",
        ultra: isUltra,
      };

      const videoTrack = stream.getVideoTracks()[0];
      localScreenEncodingRef.current = {
        bitrate: maxBitrate,
        maxFramerate: fpsCap,
        scaleResolutionDownBy,
      };
      localScreenTrackRef.current = videoTrack;
      setLocalScreenStream(stream);

      // Attach to every peer's existing PC. Renegotiation fires via the
      // per-peer `onnegotiationneeded` handler, which already runs
      // `mungeGroupCallOpusSdp` on the mic transceiver and now benefits from
      // `preferScreenShareCodec` on the newly-added screen transceiver.
      for (const [peerId, pc] of pcsRef.current) {
        const labeledStream = new MediaStream([videoTrack]);
        Object.defineProperty(labeledStream, "id", { value: `cubbly-screen-${user.id}` });
        const vSender = pc.addTrack(videoTrack, labeledStream);
        screenSendersRef.current.set(peerId, vSender);
        void applyScreenBitrate(vSender, maxBitrate, encodingOpts);
        const tx = pc.getTransceivers().find((t) => t.sender === vSender);
        preferScreenShareCodec(tx || null);

        const audioSenders: RTCRtpSender[] = [];
        stream.getAudioTracks().forEach((atrack) => {
          try {
            const aSender = pc.addTrack(atrack, labeledStream);
            void applyScreenAudioBitrate(aSender);
            audioSenders.push(aSender);
          } catch (e) {
            console.warn("[GroupCall] add screen audio failed:", e);
          }
        });
        screenAudioSendersRef.current.set(peerId, audioSenders);
      }
      videoTrack.onended = () => { toggleScreenShare(); };

      // v0.4.5 mute-survival: renegotiation must NEVER silently flip the mic
      // track's enabled bit. Re-assert the caller's chosen mute state right
      // after the new senders are attached so starting a share can't auto-mute
      // or auto-unmute the sharer.
      const isMutedNow = activeCall.isMuted;
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !isMutedNow; });

      setActiveCall(prev => prev ? { ...prev, isScreenSharing: true } : null);
      playSound("screenshareStart", { volume: 0.4 });
      void sendGroupSignalReliably(channelRef.current, { type: "peer-screen", fromUserId: user.id, isScreenSharing: true }, "peer-screen", 2);
    } else {
      // ---- Stop share — mirrors DM stopScreenShare cleanup.
      const track = localScreenTrackRef.current;
      if (track) track.stop();
      localScreenTrackRef.current = null;
      localScreenEncodingRef.current = null;
      if (localScreenStream) {
        try { localScreenStream.getTracks().forEach((t) => t.stop()); } catch {}
      }
      setLocalScreenStream(null);

      if (nativeWindowAudioStopRef.current) {
        try { nativeWindowAudioStopRef.current(); } catch {}
        nativeWindowAudioStopRef.current = null;
      }

      for (const [peerId, sender] of screenSendersRef.current) {
        try { await sender.replaceTrack(null); } catch {}
        const pc = pcsRef.current.get(peerId);
        if (pc) { try { pc.removeTrack(sender); } catch {} }
        const audioSenders = screenAudioSendersRef.current.get(peerId) || [];
        for (const aSender of audioSenders) {
          try { await aSender.replaceTrack(null); } catch {}
          if (pc) { try { pc.removeTrack(aSender); } catch {} }
        }
      }
      screenSendersRef.current.clear();
      screenAudioSendersRef.current.clear();

      // Re-assert mic state after teardown renegotiation too.
      const isMutedNow = activeCall.isMuted;
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !isMutedNow; });

      setActiveCall(prev => prev ? { ...prev, isScreenSharing: false } : null);
      playSound("screenshareStop", { volume: 0.4 });
      void sendGroupSignalReliably(channelRef.current, { type: "peer-screen", fromUserId: user.id, isScreenSharing: false }, "peer-screen", 2);
    }
  }, [activeCall, user, localScreenStream]);


  // Listen for global incoming group calls.
  // v0.4.0: read activeCall via ref so we don't tear down and rebuild this
  // subscription on every mute/state change — the resulting ~200ms window was
  // swallowing incoming-call broadcasts.
  const activeCallRef = useRef(activeCall);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`voice-global:${user.id}`);
    ch.on("broadcast", { event: "group-incoming-call" }, ({ payload }) => {
      if (payload.targetId !== user.id) return;
      if (activeCallRef.current) return; // already in a call
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
  }, [user]);

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

  // Heartbeat: refresh last_seen_at every 10s while in a group call so other
  // clients can tell us apart from a ghost participant row. Without this,
  // peers' liveness check (FRESH_MS = 30s) would mark us stale and the
  // rejoin pill would incorrectly disappear.
  useEffect(() => {
    if (!activeCall || !user) return;
    const evtId = callEventIdRef.current;
    if (!evtId) return;
    const tick = () => {
      // supabase.rpc() returns a PostgrestBuilder (thenable, not a Promise) —
      // `.catch()` on it throws "rpc(...).catch is not a function". Wrap.
      void (async () => {
        try {
          await heartbeatGroupParticipantWithRetry(evtId, user.id, "interval", {
            is_muted: activeCall.isMuted ?? null,
            is_deafened: activeCall.isDeafened ?? null,
            is_video_on: activeCall.isVideoOn ?? null,
            is_screen_sharing: activeCall.isScreenSharing ?? null,
          });
        } catch { /* best-effort */ }
      })();
    };
    tick();
    const i = setInterval(tick, 10_000);
    return () => clearInterval(i);
  }, [activeCall, user]);

  // DB-driven peer reconcile: every 5s, scan call_participants for live peers
  // we don't yet have a PC for. If we're the higher-id side we IMMEDIATELY
  // create the offer ourselves (a re-broadcast of `peer-join` alone wouldn't
  // trigger anything — the handler only makes an offer when the OTHER side
  // has a higher id). If we're the lower-id side we send a directed peer-join
  // to nudge the higher-id peer to re-offer. Fixes "A and B in the same call
  // don't see each other after joining".
  useEffect(() => {
    if (!activeCall || !user || !channelRef.current) return;
    const evtId = callEventIdRef.current;
    if (!evtId) return;
    let cancelled = false;
    const lastAttemptAt = new Map<string, number>();
    const tick = async () => {
      try {
        const { data: rows } = await supabase
          .from("call_participants")
          .select("user_id, last_seen_at, joined_at, left_at")
          .eq("call_event_id", evtId);
        if (cancelled || !rows) return;
        const FRESH_MS = 30_000;
        const now = Date.now();
        for (const r of rows as any[]) {
          if (r.user_id === user.id) continue;
          if (r.left_at !== null) continue;
          const baselineStr = r.last_seen_at ?? r.joined_at;
          if (!baselineStr) continue;
          if (now - new Date(baselineStr).getTime() >= FRESH_MS) continue;
          if (pcsRef.current.has(r.user_id)) continue;
          const lastAt = lastAttemptAt.get(r.user_id) || 0;
          if (now - lastAt < 4_500) continue; // don't retry same peer every tick
          lastAttemptAt.set(r.user_id, now);

          await ensurePeerEntry(r.user_id);

          if (user.id > r.user_id) {
            // We're the offering side — build the PC and send an offer directly.
            console.log("[GroupCall] 🔁 Reconcile: offering to missing peer", r.user_id);
            try {
              const pc = ensurePc(r.user_id);
              const offer = await pc.createOffer();
              offer.sdp = mungeGroupCallOpusSdp(offer.sdp);
              await pc.setLocalDescription(offer);
              await sendGroupSignalReliably(channelRef.current, { type: "offer", fromUserId: user.id, toUserId: r.user_id, sdp: pc.localDescription }, "offer(reconcile)");
            } catch (e) {
              console.warn("[GroupCall] Reconcile offer failed:", e);
            }
          } else {
            // We're the lower-id side — poke the higher-id peer to re-offer.
            console.log("[GroupCall] 🔁 Reconcile: nudging higher-id peer", r.user_id, "to offer");
            await sendGroupSignalReliably(channelRef.current, { type: "peer-join", fromUserId: user.id, toUserId: r.user_id }, "peer-join(reconcile)");
          }
        }
      } catch { /* best-effort */ }
    };
    const i = setInterval(tick, 5_000);
    // Fire the first tick almost immediately so a fresh joiner picks up
    // existing peers within ~500ms instead of waiting 2s.
    const seed = setTimeout(tick, 500);
    return () => { cancelled = true; clearInterval(i); clearTimeout(seed); };
  }, [activeCall?.conversationId, user, ensurePc, ensurePeerEntry]);

  // Recover if the group/server broadcast channel closes while the user is
  // still in the room. Rejoin signaling and rebroadcast peer-join so peers can
  // offer without forcing a manual leave/rejoin.
  useEffect(() => {
    if (!activeCall || !user) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const ch: any = channelRef.current;
      const state = ch?.state || ch?._state;
      if (ch && state !== "closed" && state !== "errored" && state !== "leaving") return;
      groupTrace("channel.recover", { conversationId: activeCall.conversationId, state: state || "missing" });
      try {
        await joinCallChannel(activeCall.conversationId);
        if (channelRef.current) {
          void sendGroupSignalReliably(channelRef.current, { type: "peer-join", fromUserId: user.id }, "peer-join(channel-recover)");
        }
      } catch (e) {
        console.warn("[GroupVoiceTrace] channel.recover.failed", e);
        void logGroupVoiceDiagnostic(activeCall.conversationId, "channel-recover-failed", callEventIdRef.current);
      }
    };
    const i = window.setInterval(tick, 3000);
    return () => { cancelled = true; window.clearInterval(i); };
  }, [activeCall?.conversationId, user, joinCallChannel]);



  return (
    <GroupCallContext.Provider value={{
      activeCall, incomingCall, peers, ringingMembers, ping,
      startCall, acceptCall, declineCall, leaveCall,
      toggleMute, toggleDeafen, toggleVideo, toggleScreenShare,
      localVideoStream, localScreenStream, selfAudioLevel,
      getUserVolume, setUserVolume, isUserMuted, setUserMuted,
    }}>
      {children}
    </GroupCallContext.Provider>
  );
};
