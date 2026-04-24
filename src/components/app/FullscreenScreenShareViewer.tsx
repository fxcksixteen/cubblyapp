import { useEffect, useRef, useState, useCallback } from "react";
import { X, Maximize2, Minimize2, Volume2, VolumeX, PictureInPicture2, Pause, RotateCcw } from "lucide-react";
import cubblyLogo from "@/assets/cubbly-logo.png";

interface Props {
  stream: MediaStream;
  sharerName: string;
  /** Whether this is a screen-share or a camera tile (changes the title copy). */
  type?: "screen" | "cam";
  /** Whether viewer is the local user (so we mute their own stream). */
  isLocal?: boolean;
  onClose: () => void;
}

/**
 * Custom branded full-screen viewer for screen-shares and cam tiles.
 *
 * IMPORTANT BEHAVIOUR (rewritten in v0.2.24):
 *  - The volume slider here is STREAM-LEVEL, not user-level. Dragging it
 *    only affects the screen-share / camera audio you hear from this
 *    fullscreen view — it does NOT touch the person's mic volume in your
 *    call. Use the per-user right-click menu (avatar) for that.
 *  - The chrome (top bar with mute / fit / PiP / exit) is anchored OVER
 *    the visible stream frame, not the corners of the entire app window.
 *    This prevents the buttons from ending up in unreachable corners of
 *    the user's monitor when the stream is letterboxed.
 *  - Right-click on the stream opens a stream-volume mini-menu (also
 *    stream-level, with a 0–200% slider so users can boost quiet shares).
 */

const STREAM_VOL_KEY = "cubbly-stream-volumes";

const loadStreamVolume = (key: string): number => {
  try {
    const raw = JSON.parse(localStorage.getItem(STREAM_VOL_KEY) || "{}");
    const v = raw[key];
    return typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(2, v)) : 1;
  } catch { return 1; }
};
const saveStreamVolume = (key: string, v: number) => {
  try {
    const raw = JSON.parse(localStorage.getItem(STREAM_VOL_KEY) || "{}") || {};
    raw[key] = v;
    localStorage.setItem(STREAM_VOL_KEY, JSON.stringify(raw));
  } catch {}
};

const FullscreenScreenShareViewer = ({ stream, sharerName, type = "screen", isLocal, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hiddenAudioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

  // Persistence key — per stream id so each share remembers its own volume.
  const persistKey = `${type}:${stream.id || "unknown"}`;

  // 0..2 (200%). Stream-level volume — drives the playback element directly.
  const [volume, setVolume] = useState<number>(() => isLocal ? 1 : loadStreamVolume(persistKey));
  const [muted, setMuted] = useState<boolean>(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [chromeVisible, setChromeVisible] = useState(true);
  const idleTimerRef = useRef<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [previewPaused, setPreviewPaused] = useState(false);

  // Wire stream + autoplay. The visible <video> element only ever PLAYS
  // VIDEO — its audio is muted because we route the audible playback
  // through a hidden <audio> element with the same MediaStream. That gives
  // us reliable >100% volume boost via WebAudio when needed.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    v.muted = true;          // visible <video> stays silent
    v.volume = 1;
    v.play().catch(() => {});
  }, [stream]);

  // Hidden <audio> element drives the audible playback (when not local).
  useEffect(() => {
    if (isLocal) return;
    let audioEl = hiddenAudioRef.current;
    if (!audioEl) {
      audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioEl.setAttribute("playsinline", "true");
      (audioEl as any).playsInline = true;
      audioEl.style.display = "none";
      document.body.appendChild(audioEl);
      hiddenAudioRef.current = audioEl;
    }
    audioEl.srcObject = stream;
    audioEl.muted = muted;
    audioEl.volume = Math.max(0, Math.min(1, volume));
    audioEl.play().catch(() => {});
    return () => {
      // Clean up only when component unmounts — handled in the unmount effect below.
    };
  }, [stream, isLocal]);

  // Apply volume/mute to the hidden <audio> element + (above 1.0) a WebAudio
  // gain stage so users can boost a quiet stream up to 200%.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  useEffect(() => {
    if (isLocal) return;
    const audioEl = hiddenAudioRef.current;
    if (!audioEl) return;
    // Below 100%: just use element.volume — works everywhere incl. iOS.
    if (volume <= 1) {
      audioEl.muted = muted;
      audioEl.volume = volume;
      // If a graph was active, tear it down so we go back to element-driven.
      if (audioCtxRef.current) {
        try { audioSrcRef.current?.disconnect(); } catch {}
        try { audioGainRef.current?.disconnect(); } catch {}
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
        audioGainRef.current = null;
        audioSrcRef.current = null;
      }
      return;
    }
    // > 100%: spin up a gain graph (does not work on iOS — boost capped at 1.0).
    try {
      if (!audioCtxRef.current) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        src.connect(gain).connect(ctx.destination);
        audioCtxRef.current = ctx;
        audioGainRef.current = gain;
        audioSrcRef.current = src;
        // Mute the element so we don't double-play.
        audioEl.muted = true;
      }
      audioGainRef.current!.gain.value = muted ? 0 : volume;
    } catch (e) {
      console.warn("[FullscreenViewer] WebAudio boost failed, falling back to element:", e);
      audioEl.muted = muted;
      audioEl.volume = 1;
    }
  }, [volume, muted, isLocal, stream]);

  // Persist stream volume.
  useEffect(() => {
    if (isLocal) return;
    saveStreamVolume(persistKey, volume);
  }, [volume, persistKey, isLocal]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      try { audioSrcRef.current?.disconnect(); } catch {}
      try { audioGainRef.current?.disconnect(); } catch {}
      try { audioCtxRef.current?.close(); } catch {}
      const audioEl = hiddenAudioRef.current;
      if (audioEl) {
        try { audioEl.pause(); } catch {}
        try { audioEl.srcObject = null; } catch {}
        try { audioEl.remove(); } catch {}
      }
    };
  }, []);

  // Auto-hide chrome after idle
  const bumpChrome = useCallback(() => {
    setChromeVisible(true);
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setChromeVisible(false), 2500);
  }, []);

  useEffect(() => {
    bumpChrome();
    return () => { if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current); };
  }, [bumpChrome]);

  // ESC + key handling
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "f" || e.key === "F") setFitMode((m) => m === "contain" ? "cover" : "contain");
      if (e.key === "m" || e.key === "M") handleMuteToggle();
      bumpChrome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, bumpChrome, muted]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Pause LOCAL preview when window loses focus (saves GPU). Outbound
  // MediaStream tracks are unaffected.
  useEffect(() => {
    if (!isLocal) return;
    const onBlur = () => setPreviewPaused(true);
    const onFocus = () => setPreviewPaused(false);
    const onVis = () => {
      if (document.visibilityState === "hidden") setPreviewPaused(true);
      else if (document.hasFocus()) setPreviewPaused(false);
    };
    if (typeof document !== "undefined" && !document.hasFocus()) setPreviewPaused(true);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isLocal]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isLocal) return;
    if (previewPaused) { try { v.pause(); } catch {} }
    else { v.play().catch(() => {}); }
  }, [previewPaused, isLocal]);

  const handleVolumeChange = (next: number) => {
    setVolume(next);
    if (next > 0 && muted) setMuted(false);
  };

  const handleMuteToggle = () => setMuted((m) => !m);

  const handleResetVolume = () => {
    setVolume(1);
    setMuted(false);
  };

  const handlePip = async () => {
    const v = videoRef.current as any;
    if (!v) return;
    try {
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch (e) {
      console.warn("[FullscreenViewer] PiP failed:", e);
    }
  };

  // Slider can boost up to 200% — but on iOS we can't do >100%, so cap there.
  const isIOS = (() => {
    try {
      const ua = navigator.userAgent || "";
      return /iPad|iPhone|iPod/.test(ua) || (((navigator as any).platform === "MacIntel") && ((navigator as any).maxTouchPoints || 0) > 1);
    } catch { return false; }
  })();
  const sliderMax = isIOS ? 1 : 2;
  const volumePct = Math.round((muted ? 0 : volume) * 100);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black animate-fade-in flex items-center justify-center"
      style={{ cursor: chromeVisible ? "default" : "none" }}
      onMouseMove={bumpChrome}
      onClick={bumpChrome}
    >
      {/*
        Inner FRAME wrapping the <video> — the chrome is positioned RELATIVE
        to this frame (not the whole viewport), so the buttons sit inside
        the visible stream area regardless of letterboxing.
      */}
      <div
        ref={frameRef}
        className="relative w-full h-full flex items-center justify-center"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls={false}
          controlsList="nodownload nofullscreen noplaybackrate"
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: fitMode,
            transform: "scale(1)",
            transformOrigin: "center",
            animation: "cubbly-fs-zoom 220ms ease-out",
            opacity: previewPaused ? 0.25 : 1,
            transition: "opacity 200ms ease",
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isLocal) setCtxMenu({ x: e.clientX, y: e.clientY });
          }}
        />

        {isLocal && previewPaused && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
              <Pause className="h-6 w-6 text-white" />
            </div>
            <p className="text-sm font-semibold text-white/90">Preview paused</p>
            <p className="text-[11px] text-white/60 max-w-xs text-center px-4">
              Saving resources while Cubbly isn't focused. Your screen is still being shared — viewers see it normally.
            </p>
          </div>
        )}

        {/* TOP CHROME BAR — anchored to the inner frame top so it's always
            inside the visible stream area, and constrained to a max width
            with margin so the buttons don't crawl into unreachable corners
            on ultrawide monitors. */}
        <div
          className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 transition-opacity duration-200 pointer-events-none"
          style={{ opacity: chromeVisible ? 1 : 0 }}
        >
          <div
            className="flex items-center gap-2.5 min-w-0 rounded-full bg-black/60 backdrop-blur-md px-3 py-2 pointer-events-auto"
            style={{ maxWidth: "60%" }}
          >
            <img src={cubblyLogo} alt="Cubbly" className="h-6 w-6 rounded-md shrink-0" />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ed4245] animate-pulse" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80">
                  Live · {type === "screen" ? "Screen" : "Camera"}
                </span>
              </div>
              <span className="text-[12px] font-semibold text-white truncate leading-tight">
                {sharerName}
              </span>
            </div>
          </div>

          <div
            className="flex items-center gap-2 shrink-0 rounded-full bg-black/60 backdrop-blur-md px-2 py-1.5 pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {!isLocal && (
              <div className="flex items-center gap-2 px-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleMuteToggle(); }}
                  className="text-white hover:text-white/80"
                  aria-label={muted ? "Unmute stream" : "Mute stream"}
                  title={muted ? "Unmute stream" : "Mute stream"}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={sliderMax}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="h-1 w-24 accent-[#3ba55c]"
                  aria-label="Stream volume"
                  title="Stream volume (right-click stream for advanced)"
                />
                <span className="text-[10px] font-semibold tabular-nums text-white/80 w-9 text-right">
                  {volumePct}%
                </span>
              </div>
            )}

            <button
              onClick={(e) => { e.stopPropagation(); handlePip(); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Picture in picture"
              title="Picture in picture"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); setFitMode((m) => m === "contain" ? "cover" : "contain"); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Toggle fit"
              title={fitMode === "contain" ? "Fill screen" : "Fit screen"}
            >
              {fitMode === "contain" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 hover:bg-[#ed4245] text-white transition-colors"
              aria-label="Exit fullscreen"
              title="Exit (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Bottom hint pill — also anchored to inner frame */}
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 transition-opacity duration-200 px-3 py-1.5 rounded-full bg-black/60 text-white/70 text-[11px] font-medium pointer-events-none"
          style={{ opacity: chromeVisible ? 1 : 0 }}
        >
          <kbd className="px-1 py-0.5 rounded bg-white/15 mx-0.5">Esc</kbd> exit ·
          <kbd className="px-1 py-0.5 rounded bg-white/15 mx-0.5">F</kbd> fit ·
          <kbd className="px-1 py-0.5 rounded bg-white/15 mx-0.5">M</kbd> mute ·
          right-click stream for stream volume
        </div>
      </div>

      <style>{`
        @keyframes cubbly-fs-zoom {
          from { transform: scale(0.96); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>

      {/* Right-click STREAM volume menu (stream-level, NOT user-level). */}
      {ctxMenu && !isLocal && (
        <StreamVolumeMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          sharerName={sharerName}
          volume={volume}
          muted={muted}
          maxBoost={sliderMax}
          onChangeVolume={handleVolumeChange}
          onToggleMute={handleMuteToggle}
          onReset={handleResetVolume}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
};

/** Small floating menu for STREAM volume (stream-level, not user-level). */
const StreamVolumeMenu = ({
  x, y, sharerName, volume, muted, maxBoost,
  onChangeVolume, onToggleMute, onReset, onClose,
}: {
  x: number; y: number; sharerName: string;
  volume: number; muted: boolean; maxBoost: number;
  onChangeVolume: (v: number) => void;
  onToggleMute: () => void;
  onReset: () => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const W = 264, H = 200;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - H - 8);
  const pct = Math.round((muted ? 0 : volume) * 100);
  const trackColor = pct <= 100 ? "#3ba55c" : pct <= 150 ? "#faa61a" : "#ed4245";

  return (
    <div
      ref={ref}
      className="fixed z-[300] w-[264px] rounded-xl border shadow-2xl animate-in fade-in-0 zoom-in-95"
      style={{
        left, top,
        backgroundColor: "var(--app-bg-secondary, #2b2d31)",
        borderColor: "var(--app-border, rgba(255,255,255,0.08))",
        color: "var(--app-text-primary, #f2f3f5)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 pt-3 pb-2">
        <p className="truncate text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
          {sharerName}'s stream
        </p>
      </div>
      <div className="px-3 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold">Stream Volume</span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: trackColor }}>
            {pct}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={maxBoost}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
          className="w-full"
          style={{ accentColor: trackColor }}
        />
        <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
          <span>0%</span>
          <span>100%</span>
          <span>{Math.round(maxBoost * 100)}%</span>
        </div>
      </div>
      <div className="h-px mx-2" style={{ backgroundColor: "var(--app-border, rgba(255,255,255,0.06))" }} />
      <div className="p-1">
        <button
          onClick={onToggleMute}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-white/5 text-left"
        >
          {muted ? <VolumeX className="h-4 w-4" style={{ color: "#ed4245" }} /> : <Volume2 className="h-4 w-4" />}
          <span>{muted ? "Unmute stream" : "Mute stream"}</span>
        </button>
        <button
          onClick={onReset}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-white/5 text-left"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset to 100%</span>
        </button>
      </div>
    </div>
  );
};

export default FullscreenScreenShareViewer;
