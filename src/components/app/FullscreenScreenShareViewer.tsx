import { useEffect, useRef, useState, useCallback } from "react";
import { X, Maximize2, Minimize2, Volume2, VolumeX, PictureInPicture2 } from "lucide-react";
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
 * We deliberately do NOT use the native HTML5 `<video controls>` and we do NOT
 * call `requestFullscreen()`. The native browser fullscreen exposes a pause
 * button, picture-in-picture, download and playback-speed controls, which let
 * viewers freeze an inbound MediaStream we don't control. Our own overlay
 * keeps the viewer purely passive — they can change volume, fit/fill, and
 * exit, nothing else.
 */
const FullscreenScreenShareViewer = ({ stream, sharerName, type = "screen", isLocal, onClose }: Props) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(isLocal ?? false);
  const [volume, setVolume] = useState(1);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [chromeVisible, setChromeVisible] = useState(true);
  const idleTimerRef = useRef<number | null>(null);

  // Wire stream + autoplay
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    v.muted = muted || !!isLocal;
    v.volume = volume;
    v.play().catch(() => {});
  }, [stream, isLocal]);

  // Keep audio props in sync
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted || !!isLocal;
    v.volume = volume;
  }, [muted, volume, isLocal]);

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
      if (e.key === "m" || e.key === "M") setMuted((m) => !m);
      bumpChrome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, bumpChrome]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handlePip = async () => {
    const v = videoRef.current as any;
    if (!v) return;
    try {
      if ((document as any).pictureInPictureElement) {
        await (document as any).exitPictureInPicture();
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
      }
    } catch { /* not supported on this browser */ }
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black animate-fade-in"
      style={{ cursor: chromeVisible ? "default" : "none" }}
      onMouseMove={bumpChrome}
      onClick={bumpChrome}
    >
      {/* Video — controls={false} so viewer can never pause/PiP/download via native UI */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls={false}
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
        className="absolute inset-0 h-full w-full"
        style={{
          objectFit: fitMode,
          transform: "scale(1)",
          transformOrigin: "center",
          animation: "cubbly-fs-zoom 220ms ease-out",
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Top branded bar */}
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
          {/* Volume */}
          {!isLocal && (
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
              <button
                onClick={() => setMuted((m) => !m)}
                className="text-white hover:text-white/80"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={(e) => { setVolume(parseFloat(e.target.value)); if (parseFloat(e.target.value) > 0) setMuted(false); }}
                className="h-1 w-24 accent-[#3ba55c]"
              />
            </div>
          )}

          {/* PiP (opt-in) */}
          <button
            onClick={handlePip}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Picture in picture"
            title="Picture in picture"
          >
            <PictureInPicture2 className="h-4 w-4" />
          </button>

          {/* Fit toggle */}
          <button
            onClick={() => setFitMode((m) => m === "contain" ? "cover" : "contain")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Toggle fit"
            title={fitMode === "contain" ? "Fill screen" : "Fit screen"}
          >
            {fitMode === "contain" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>

          {/* Exit */}
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

      {/* Bottom hint */}
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
