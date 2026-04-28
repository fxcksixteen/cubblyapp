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

/**
 * iOS Safari / iOS PWA: routing a live WebRTC MediaStream through
 * `createMediaStreamSource()` reliably plays SILENCE — it's a well-known
 * WebKit bug. We must keep the element-driven path (HTMLAudioElement plays
 * the stream directly, gain is faked via element.volume 0..1).
 *
 * Without this guard the iOS PWA recipient hears NOTHING in any call.
 */
const IS_IOS = (() => {
  try {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    const platform = (navigator as any).platform || "";
    const maxTouch = (navigator as any).maxTouchPoints || 0;
    const iPadOS = platform === "MacIntel" && maxTouch > 1;
    return /iPad|iPhone|iPod/.test(ua) || iPadOS;
  } catch { return false; }
})();

const loadUserVolumes = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(USER_VOL_KEY) || "{}") || {}; } catch { return {}; }
};
const loadUserMutes = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(USER_MUTE_KEY) || "{}") || {}; } catch { return {}; }
};

// ---- Global "wake up suspended AudioContexts on next user gesture" ----------
// Browsers/Electron may keep an AudioContext suspended even when the call's
// accept/join click fired — especially across renegotiation when we create a
// fresh context mid-call without an immediate gesture. Register every context
// here and the FIRST subsequent click/keydown/touch resumes them all.
const _allPeerCtxs = new Set<AudioContext>();
let _gestureHookInstalled = false;
function registerPeerCtx(ctx: AudioContext) {
  _allPeerCtxs.add(ctx);
  if (typeof window === "undefined") return;
  if (_gestureHookInstalled) return;
  _gestureHookInstalled = true;
  const wake = () => {
    _allPeerCtxs.forEach((c) => {
      if (c.state === "suspended") c.resume().catch(() => {});
    });
  };
  // Capture-phase listeners so we beat React handlers; once: false because
  // a single missed wake on the very first attach can leave audio dead.
  window.addEventListener("pointerdown", wake, true);
  window.addEventListener("keydown", wake, true);
  window.addEventListener("touchstart", wake, true);
}

/**
 * Per-peer gain "registry" — multiple inbound streams (mic + screen audio) for
 * the same peer all route through the SAME GainNode. We track each stream's
 * AudioContext and source separately so we can tear them down individually.
 */
interface AttachedMedia {
  el: HTMLMediaElement;
  /** True when this element is being routed through the WebAudio gain graph
   * (so we mute the element). False when the graph is suspended/unavailable
   * and we have to control loudness via element.volume + element.muted. */
  routedThroughGraph: boolean;
}

interface PeerEntry {
  /** Shared gain node for this peer (every source connects into it). */
  gain: GainNode;
  /** Shared AudioContext (gain + destination live here). */
  ctx: AudioContext;
  /** Map<streamKey, MediaStreamAudioSourceNode> for cleanup on retattach. */
  sources: Map<string, MediaStreamAudioSourceNode>;
  /** Map<streamKey, AttachedMedia> — elements we manage volume/mute on as
   *  fallback when the WebAudio path isn't running. */
  media: Map<string, AttachedMedia>;
}

/** Per-peer "forced mute" — set when the peer broadcasts they've muted
 *  themselves. Combined with the user-set volume so even a misbehaving
 *  peer client cannot leak audio (defensive against the iOS PWA bug
 *  where mute didn't fully silence outgoing RTP). Stored OUTSIDE the
 *  per-instance refs so it survives StrictMode double-mounts. */
const _forcedMutes: Record<string, boolean> = {};

export interface PeerGainApi {
  getUserVolume: (userId: string) => number;
  setUserVolume: (userId: string, volume: number) => void;
  isUserMuted: (userId: string) => boolean;
  setUserMuted: (userId: string, muted: boolean) => void;
  /** Mark a peer as muted-from-their-side (signaling-driven). */
  setPeerForcedMute: (userId: string, muted: boolean) => void;
  attachPeerGain: (
    userId: string,
    stream: MediaStream,
    mediaEl: HTMLMediaElement,
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
    const localMuted = !!userMutesRef.current[userId];
    const remoteForcedMute = !!_forcedMutes[userId];
    const muted = localMuted || remoteForcedMute;
    const vol = userVolumesRef.current[userId];
    const v = typeof vol === "number" && isFinite(vol) ? Math.max(0, Math.min(2, vol)) : 1;
    // Always update the gain node (covers the running-graph case).
    entry.gain.gain.value = muted ? 0 : v;
    entry.media.forEach((m) => {
      const running = entry.ctx.state === "running";
      if (running && m.routedThroughGraph) {
        try { m.el.muted = true; } catch {}
      } else {
        try {
          m.el.muted = muted;
          m.el.volume = Math.max(0, Math.min(1, v));
        } catch {}
      }
    });
  }, []);

  const setPeerForcedMute = useCallback((userId: string, muted: boolean) => {
    if (!userId) return;
    if (muted) _forcedMutes[userId] = true;
    else delete _forcedMutes[userId];
    applyPeerGain(userId);
  }, [applyPeerGain]);

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
    mediaEl: HTMLMediaElement,
    streamKind: string = "mic",
  ) => {
    if (!userId || !stream) return;
    if (!stream.getAudioTracks().length) return;

    // ── iOS PWA path: do NOT use the Web Audio gain graph at all. ──
    // On iOS Safari / PWA, piping a live WebRTC MediaStream through
    // `createMediaStreamSource()` reliably plays SILENCE (long-standing
    // WebKit bug). The HTMLAudioElement, however, plays the same
    // MediaStream perfectly when left to drive itself. We register the
    // element so volume/mute changes still apply, but we never touch
    // AudioContext.
    if (IS_IOS) {
      try {
        let entry = peerEntriesRef.current.get(userId);
        if (!entry) {
          // Minimal entry — gain/ctx unused on iOS, but the type is shared.
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const gain = ctx.createGain();
          entry = { ctx, gain, sources: new Map(), media: new Map() };
          peerEntriesRef.current.set(userId, entry);
        }
        entry.media.set(streamKind, { el: mediaEl, routedThroughGraph: false });
        mediaEl.setAttribute("data-cubbly-peer", userId);
        mediaEl.setAttribute("data-cubbly-kind", streamKind);
        // Element-driven loudness — make sure it's audible.
        const muted = !!userMutesRef.current[userId];
        const vol = userVolumesRef.current[userId];
        const v = typeof vol === "number" && isFinite(vol) ? Math.max(0, Math.min(1, vol)) : 1;
        try { mediaEl.muted = muted; mediaEl.volume = v; } catch {}
      } catch (e) {
        console.warn("[PeerGain][iOS] attach fallback failed:", e);
        try { mediaEl.muted = !!userMutesRef.current[userId]; } catch {}
      }
      return;
    }

    try {
      let entry = peerEntriesRef.current.get(userId);
      if (!entry || entry.ctx.state === "closed") {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        const muted = !!userMutesRef.current[userId];
        const vol = userVolumesRef.current[userId];
        const v = typeof vol === "number" && isFinite(vol) ? Math.max(0, Math.min(2, vol)) : 1;
        gain.gain.value = muted ? 0 : v;
        gain.connect(ctx.destination);
        entry = { ctx, gain, sources: new Map(), media: new Map() };
        peerEntriesRef.current.set(userId, entry);
        registerPeerCtx(ctx);
      }

      if (entry.ctx.state === "suspended") {
        entry.ctx.resume().catch((e) => {
          console.warn("[PeerGain] AudioContext resume failed (will retry on next user gesture):", e);
        });
      }

      // Disconnect any previous source for this stream kind so we don't double-mix.
      const prev = entry.sources.get(streamKind);
      if (prev) {
        try { prev.disconnect(); } catch {}
        entry.sources.delete(streamKind);
      }

      let routedThroughGraph = false;
      try {
        const src = entry.ctx.createMediaStreamSource(stream);
        src.connect(entry.gain);
        entry.sources.set(streamKind, src);
        routedThroughGraph = true;
      } catch (e) {
        console.warn("[PeerGain] createMediaStreamSource failed; falling back to element volume:", e);
      }

      // Track this element so applyPeerGain can update its volume/mute.
      entry.media.set(streamKind, { el: mediaEl, routedThroughGraph });

      mediaEl.setAttribute("data-cubbly-peer", userId);
      mediaEl.setAttribute("data-cubbly-kind", streamKind);

      // Apply current volume/mute state immediately AND after a tick (resume()
      // resolves async — until it does the element must stay audible).
      applyPeerGain(userId);
      setTimeout(() => applyPeerGain(userId), 100);
      setTimeout(() => applyPeerGain(userId), 500);
    } catch (e) {
      console.warn("[PeerGain] attach failed for", userId, streamKind, e);
      // Last-resort fallback: leave element playing at its own volume so we hear them.
      try { mediaEl.muted = !!userMutesRef.current[userId]; } catch {}
      try {
        const v = userVolumesRef.current[userId];
        const cv = typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
        mediaEl.volume = cv;
      } catch {}
    }
  }, [applyPeerGain]);

  const clearAllPeerGains = useCallback(() => {
    peerEntriesRef.current.forEach((entry) => {
      try { entry.sources.forEach((s) => { try { s.disconnect(); } catch {} }); } catch {}
      try { entry.media.forEach((m) => { try { m.el.muted = false; } catch {} }); } catch {}
      try { if (entry.ctx.state !== "closed") entry.ctx.close().catch(() => {}); } catch {}
    });
    peerEntriesRef.current.clear();
  }, []);

  return { getUserVolume, setUserVolume, isUserMuted, setUserMuted, attachPeerGain, clearAllPeerGains };
}
