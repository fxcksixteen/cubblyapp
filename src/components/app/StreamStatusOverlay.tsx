import { useEffect, useRef, useState } from "react";
import cubblyLogo from "@/assets/cubbly-logo.png";

/**
 * "This stream isn't delivering frames right now" indicator (v0.4.27).
 *
 * Two things this replaces:
 *
 * 1. The old check lived ONLY in the fullscreen viewer, so a viewer watching a
 *    tile in the normal call view got no indication at all when a stream
 *    stalled — it just froze.
 *
 * 2. It rendered over flat black. When a share genuinely does stall, a black
 *    rectangle throws away the one useful thing we still have: the last frame
 *    that did arrive. We now paint that frame, blurred and dimmed, behind the
 *    message, so the viewer keeps their place in whatever was being shared.
 *
 * Detection keys off TRACK STATE, not a gap between frames. Windows Graphics
 * Capture only emits when window content changes and WebRTC does not resend
 * static content, so a perfectly healthy share of a still document produces no
 * frames at all — the previous "no frame for 2s" rule fired constantly on
 * exactly the shares that were working fine.
 */

interface Props {
  stream: MediaStream | null | undefined;
  /** Name shown in the copy. */
  sharerName?: string;
  /** Grace period before declaring a stall, ms. */
  stallMs?: number;
  /** Smaller copy for tile-sized surfaces. */
  compact?: boolean;
}

/** Grab the last painted frame of a <video> as a data URL, or null. */
function snapshot(video: HTMLVideoElement | null): string | null {
  if (!video || !video.videoWidth || !video.videoHeight) return null;
  try {
    const canvas = document.createElement("canvas");
    // Small — it's going to be blurred anyway, and this runs on a stall.
    const w = 256;
    const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.6);
  } catch {
    return null; // tainted canvas or a detached element
  }
}

/**
 * Watches a stream's video track and reports whether it is currently able to
 * deliver frames. Returns null when everything is fine.
 */
export function useStreamStalled(stream: MediaStream | null | undefined, stallMs = 2500) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!stream) { setStalled(false); return; }
    const track = stream.getVideoTracks()[0];
    if (!track) { setStalled(false); return; }

    let timer: number | null = null;
    const evaluate = () => {
      // `muted` on a remote track means the sender is not currently producing
      // media for it; `ended`/`live` covers teardown. Neither is inferred from
      // frame timing, so a static-but-healthy share never trips this.
      const bad = track.muted || track.readyState !== "live";
      if (!bad) {
        if (timer !== null) { window.clearTimeout(timer); timer = null; }
        setStalled(false);
        return;
      }
      if (timer === null) {
        timer = window.setTimeout(() => { timer = null; setStalled(true); }, stallMs);
      }
    };

    evaluate();
    track.addEventListener("mute", evaluate);
    track.addEventListener("unmute", evaluate);
    track.addEventListener("ended", evaluate);
    // Safety net for browsers that are stingy with mute/unmute on remote tracks.
    const poll = window.setInterval(evaluate, 1000);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.clearInterval(poll);
      track.removeEventListener("mute", evaluate);
      track.removeEventListener("unmute", evaluate);
      track.removeEventListener("ended", evaluate);
    };
  }, [stream, stallMs]);

  return stalled;
}

/**
 * Overlay for a stalled stream. Renders nothing when `show` is false.
 * Pass the <video> element so the last good frame can be used as the backdrop.
 */
const StreamStatusOverlay = ({
  show,
  videoRef,
  sharerName,
  compact,
}: {
  show: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  sharerName?: string;
  compact?: boolean;
}) => {
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const lastGood = useRef<string | null>(null);

  // Keep a recent frame around while the stream is healthy, so there is
  // something to show the moment it stalls.
  useEffect(() => {
    if (show) return;
    const id = window.setInterval(() => {
      const shot = snapshot(videoRef.current);
      if (shot) lastGood.current = shot;
    }, 3000);
    return () => window.clearInterval(id);
  }, [show, videoRef]);

  useEffect(() => {
    if (!show) { setBackdrop(null); return; }
    // Prefer a frame captured right now; fall back to the last healthy one.
    setBackdrop(snapshot(videoRef.current) || lastGood.current);
  }, [show, videoRef]);

  if (!show) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {backdrop ? (
        <>
          <img
            src={backdrop}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: "blur(18px) brightness(0.45)", transform: "scale(1.15)" }}
          />
          <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.25)" }} />
        </>
      ) : (
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.65)" }} />
      )}
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
        <img
          src={cubblyLogo}
          alt=""
          className={`${compact ? "h-7 w-7" : "h-12 w-12"} rounded-xl opacity-80 animate-pulse`}
        />
        <p className={`${compact ? "text-[11px]" : "text-sm"} font-semibold text-white/90`}>
          Stream paused
        </p>
        {!compact && (
          <p className="text-[11px] text-white/60 max-w-xs">
            {sharerName ? `${sharerName} isn't sending video right now.` : "No video is being sent right now."}
            {" "}This clears as soon as it resumes.
          </p>
        )}
      </div>
    </div>
  );
};

export default StreamStatusOverlay;
