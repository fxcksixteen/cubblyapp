import { useEffect, useRef, useState, useCallback } from "react";
import { X, Maximize2, Minimize2, Volume2, VolumeX, PictureInPicture2, Pause } from "lucide-react";
import cubblyLogo from "@/assets/cubbly-logo.png";
import type { PeerGainApi } from "@/lib/peerGain";
import UserVolumeMenu from "./UserVolumeMenu";

interface Props {
  stream: MediaStream;
  sharerName: string;
  /** Whether this is a screen-share or a camera tile (changes the title copy). */
  type?: "screen" | "cam";
  /** Whether viewer is the local user (so we mute their own stream). */
  isLocal?: boolean;
  onClose: () => void;
  /**
   * Peer userId whose audio this screen-share carries. When provided, the
   * volume slider drives the per-peer GainNode (set up in VoiceContext /
   * GroupCallContext), NOT the <video>'s own volume — because the inbound
   * screen audio is already routed through the gain pipeline (the inline
   * <video> stays muted to avoid double-playback).
   */
  audioPeerId?: string;
  /** Volume API from whichever call context is active. Required when audioPeerId is set. */
  volumeApi?: Pick<PeerGainApi, "getUserVolume" | "setUserVolume" | "isUserMuted" | "setUserMuted">;
}

/**
 * Custom branded full-screen viewer for screen-shares and cam tiles.
 *
 * We deliberately do NOT use the native HTML5 `<video controls>` and we do NOT
 * call `requestFullscreen()`. The native browser fullscreen exposes a pause
 * button, picture-in-picture, download and playback-speed controls, which let
 * viewers freeze an inbound MediaStream we don't control. Our own overlay
 * keeps the viewer purely passive — they can change volume, fit/fill, PiP,
 * and exit, nothing else.
 */
const FullscreenScreenShareViewer = ({ stream, sharerName, type = "screen", isLocal, onClose, audioPeerId, volumeApi }: Props) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // When we have a peer-gain pipeline, the slider drives THAT (0..200%).
  // Otherwise we fall back to controlling the <video> element's audio directly.
  const usePeerGain = !!(audioPeerId && volumeApi && !isLocal);
  const [volume, setVolume] = useState<number>(() => usePeerGain ? volumeApi!.getUserVolume(audioPeerId!) : 1);
  const [muted, setMuted] = useState<boolean>(() => {
    if (isLocal) return true;
    if (usePeerGain) return volumeApi!.isUserMuted(audioPeerId!);
    return false;
  });
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [chromeVisible, setChromeVisible] = useState(true);
  const idleTimerRef = useRef<number | null>(null);
  // Right-click → inline volume menu (same component as the avatar right-click).
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  // Local preview pause-when-unfocused. Only affects what WE see — the
  // outbound MediaStream tracks keep flowing to peers untouched.
  const [previewPaused, setPreviewPaused] = useState(false);

  // Wire stream + autoplay. When using the per-peer gain pipeline, keep the
  // <video> element muted forever — audio plays through the GainNode → the
  // hidden <audio data-cubbly-kind="screen"> element.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    if (usePeerGain || isLocal) {
      v.muted = true;
      v.volume = 1;
    } else {
      v.muted = muted;
      v.volume = volume;
    }
    v.play().catch(() => {});
  }, [stream, isLocal, usePeerGain]);

  // Keep volume props in sync (only relevant when NOT using peer-gain).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (usePeerGain || isLocal) return;
    v.muted = muted;
    v.volume = volume;
  }, [muted, volume, isLocal, usePeerGain]);

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
  }, [onClose, bumpChrome, muted, usePeerGain]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleVolumeChange = (next: number) => {
    setVolume(next);
    if (usePeerGain) {
      volumeApi!.setUserVolume(audioPeerId!, next);
      if (next > 0 && muted) {
        setMuted(false);
        volumeApi!.setUserMuted(audioPeerId!, false);
      }
    }
  };

  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    if (usePeerGain) volumeApi!.setUserMuted(audioPeerId!, next);
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

  // For peer-gain pipeline, the slider goes 0..2 (200%). Otherwise 0..1.
  const sliderMax = usePeerGain ? 2 : 1;
  const sliderStep = usePeerGain ? 0.01 : 0.01;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black animate-fade-in"
      style={{ cursor: chromeVisible ? "default" : "none" }}
      onMouseMove={bumpChrome}
      onClick={bumpChrome}
    >
      {/*
        Note: we deliberately DO NOT set `disablePictureInPicture` here —
        otherwise `requestPictureInPicture()` rejects silently. We keep
        `controls={false}` and a controlsList that blocks download/native
        fullscreen/playback-rate, so the only way to manipulate the stream
        is still through OUR overlay (PiP being the one explicit exception).
      */}
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
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      <div
        className="absolute top-0 inset-x-0 flex items-center justify-between gap-3 px-4 py-3 transition-opacity duration-200"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0))",
          opacity: chromeVisible ? 1 : 0,
          pointerEvents: chromeVisible ? "auto" : "none",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={cubblyLogo} alt="Cubbly" className="h-7 w-7 rounded-md shrink-0" />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ed4245] animate-pulse" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
                Live · {type === "screen" ? "Screen Share" : "Camera"}
              </span>
            </div>
            <span className="text-sm font-semibold text-white truncate">
              Watching {sharerName}'s {type === "screen" ? "screen" : "camera"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isLocal && (
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
              <button
                onClick={handleMuteToggle}
                className="text-white hover:text-white/80"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={sliderStep}
                value={muted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="h-1 w-24 accent-[#3ba55c]"
              />
              {usePeerGain && (
                <span className="text-[10px] font-semibold tabular-nums text-white/80 w-8 text-right">
                  {Math.round((muted ? 0 : volume) * 100)}%
                </span>
              )}
            </div>
          )}

          <button
            onClick={handlePip}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Picture in picture"
            title="Picture in picture"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>

          <button
            onClick={() => setFitMode((m) => m === "contain" ? "cover" : "contain")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Toggle fit"
            title={fitMode === "contain" ? "Fill screen" : "Fit screen"}
          >
            {fitMode === "contain" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>

          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-[#ed4245] text-white transition-colors"
            aria-label="Exit fullscreen"
            title="Exit (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 transition-opacity duration-200 px-3 py-1.5 rounded-full bg-black/60 text-white/70 text-[11px] font-medium"
        style={{ opacity: chromeVisible ? 1 : 0 }}
      >
        Press <kbd className="px-1 py-0.5 rounded bg-white/15 mx-0.5">Esc</kbd> to exit · <kbd className="px-1 py-0.5 rounded bg-white/15 mx-0.5">F</kbd> fit · <kbd className="px-1 py-0.5 rounded bg-white/15 mx-0.5">M</kbd> mute
      </div>

      <style>{`
        @keyframes cubbly-fs-zoom {
          from { transform: scale(0.96); opacity: 0; }
          to   { transform: scale(1);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default FullscreenScreenShareViewer;
