/**
 * Per-peer playback pipeline (Discord-style).
 *
 * Wraps a WebAudio GainNode keyed by peer userId so that:
 *   - Volume can be scaled 0..2.0 (HTMLAudioElement.volume only does 0..1)
 *   - "Mute (you only)" silences the peer locally without affecting anyone else
 *   - Mic AND screen-share audio for the same peer are routed through the SAME
 *     gain node, so the slider in the right-click menu controls everything
 *     you hear from that user
 *
 * State is persisted to localStorage forever, so volumes survive reloads,
 * call rejoins, and re-installs.
 *
 * Used by both `VoiceContext` (1-on-1) and `GroupCallContext` (N-peer mesh).
 */
import { useRef, useCallback } from "react";

const USER_VOL_KEY = "cubbly-user-volumes";
const USER_MUTE_KEY = "cubbly-user-muted";

const loadUserVolumes = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(USER_VOL_KEY) || "{}") || {}; } catch { return {}; }
};
const loadUserMutes = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(USER_MUTE_KEY) || "{}") || {}; } catch { return {}; }
};

/**
 * Per-peer gain "registry" — multiple inbound streams (mic + screen audio) for
 * the same peer all route through the SAME GainNode. We track each stream's
 * AudioContext and source separately so we can tear them down individually.
 */
interface PeerEntry {
  /** Shared gain node for this peer (every source connects into it). */
  gain: GainNode;
  /** Shared AudioContext (gain + destination live here). */
  ctx: AudioContext;
  /** Map<streamKey, MediaStreamAudioSourceNode> for cleanup on retattach. */
  sources: Map<string, MediaStreamAudioSourceNode>;
}

export interface PeerGainApi {
  getUserVolume: (userId: string) => number;
  setUserVolume: (userId: string, volume: number) => void;
  isUserMuted: (userId: string) => boolean;
  setUserMuted: (userId: string, muted: boolean) => void;
  /**
   * Route the given stream through the per-peer GainNode for `userId`.
   * Mutes the source `audioEl` so playback only flows through the gain pipeline.
   *
   * `streamKind` differentiates concurrent streams from the same peer
   * (e.g. "mic" + "screen") so they can be independently re-attached
   * during renegotiation without tearing down the other.
   */
  attachPeerGain: (
    userId: string,
    stream: MediaStream,
    audioEl: HTMLAudioElement,
    streamKind?: string
  ) => void;
  /** Tear down ALL per-peer pipelines (call this in leaveCall / endCall). */
  clearAllPeerGains: () => void;
}

/**
 * React hook that exposes the per-peer gain API. Used by VoiceContext +
 * GroupCallContext so both call types share one persisted volume table.
 */
export function usePeerGains(): PeerGainApi {
  const userVolumesRef = useRef<Record<string, number>>(loadUserVolumes());
  const userMutesRef = useRef<Record<string, boolean>>(loadUserMutes());
  const peerEntriesRef = useRef<Map<string, PeerEntry>>(new Map());

  const getUserVolume = useCallback((userId: string): number => {
    if (!userId) return 1;
    const v = userVolumesRef.current[userId];
    return typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(2, v)) : 1;
  }, []);

  const isUserMuted = useCallback((userId: string): boolean => !!userMutesRef.current[userId], []);

  const applyPeerGain = useCallback((userId: string) => {
    const entry = peerEntriesRef.current.get(userId);
    if (!entry) return;
    const muted = !!userMutesRef.current[userId];
    const vol = userVolumesRef.current[userId];
    const v = typeof vol === "number" && isFinite(vol) ? Math.max(0, Math.min(2, vol)) : 1;
    entry.gain.gain.value = muted ? 0 : v;
  }, []);

  const setUserVolume = useCallback((userId: string, volume: number) => {
    if (!userId) return;
    const v = Math.max(0, Math.min(2, volume));
    userVolumesRef.current[userId] = v;
    try { localStorage.setItem(USER_VOL_KEY, JSON.stringify(userVolumesRef.current)); } catch {}
    applyPeerGain(userId);
  }, [applyPeerGain]);

  const setUserMuted = useCallback((userId: string, muted: boolean) => {
    if (!userId) return;
    if (muted) userMutesRef.current[userId] = true;
    else delete userMutesRef.current[userId];
    try { localStorage.setItem(USER_MUTE_KEY, JSON.stringify(userMutesRef.current)); } catch {}
    applyPeerGain(userId);
  }, [applyPeerGain]);

  const attachPeerGain = useCallback((
    userId: string,
    stream: MediaStream,
    audioEl: HTMLAudioElement,
    streamKind: string = "mic",
  ) => {
    if (!userId || !stream) return;
    try {
      // If we don't have a pipeline for this peer yet, build one.
      let entry = peerEntriesRef.current.get(userId);
      if (!entry || entry.ctx.state === "closed") {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        const muted = !!userMutesRef.current[userId];
        const vol = userVolumesRef.current[userId];
        const v = typeof vol === "number" && isFinite(vol) ? Math.max(0, Math.min(2, vol)) : 1;
        gain.gain.value = muted ? 0 : v;
        gain.connect(ctx.destination);
        entry = { ctx, gain, sources: new Map() };
        peerEntriesRef.current.set(userId, entry);
      }

      // If this kind of stream is already attached for this peer, disconnect
      // the old source first so we don't double-mix.
      const prev = entry.sources.get(streamKind);
      if (prev) {
        try { prev.disconnect(); } catch {}
        entry.sources.delete(streamKind);
      }

      const src = entry.ctx.createMediaStreamSource(stream);
      src.connect(entry.gain);
      entry.sources.set(streamKind, src);

      // Mute the source element — playback now flows through the gain pipeline.
      audioEl.muted = true;
      audioEl.setAttribute("data-cubbly-peer", userId);
      audioEl.setAttribute("data-cubbly-kind", streamKind);
    } catch (e) {
      console.warn("[PeerGain] attach failed for", userId, streamKind, e);
      // Fallback: leave element playing at its own volume so we at least hear them.
    }
  }, []);

  const clearAllPeerGains = useCallback(() => {
    peerEntriesRef.current.forEach((entry) => {
      try { entry.sources.forEach((s) => { try { s.disconnect(); } catch {} }); } catch {}
      try { if (entry.ctx.state !== "closed") entry.ctx.close().catch(() => {}); } catch {}
    });
    peerEntriesRef.current.clear();
  }, []);

  return { getUserVolume, setUserVolume, isUserMuted, setUserMuted, attachPeerGain, clearAllPeerGains };
}
