import { useEffect, useState, useRef } from "react";

// Background color sampled directly from the bears webm so the splash blends seamlessly.
export const SPLASH_BG_COLOR = "#96725e";

const COZY_LINES = [
  "Brewing something warm just for you...",
  "Fluffing the cushions in your cozy corner...",
  "The bears are getting everything ready...",
  "Stirring the cocoa, lighting the fireplace...",
  "Tucking your friends in safe and sound...",
  "Wrapping your messages in a warm blanket...",
  "Just a moment — the bears are tidying up...",
  "Sprinkling a little extra cozy on everything...",
  "Polishing your hangout space to a soft glow...",
];

interface LoadingSplashProps {
  /** Minimum time the splash stays visible (ms) so it doesn't flash by */
  minDuration?: number;
  /** Fired after the splash has fully faded out and unmounted */
  onComplete?: () => void;
}

const LoadingSplash = ({ minDuration = 2200, onComplete }: LoadingSplashProps) => {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lineRef = useRef(COZY_LINES[Math.floor(Math.random() * COZY_LINES.length)]);
  const startedAt = useRef(Date.now());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // iOS PWA Safari sometimes refuses webm autoplay until you nudge .play()
  // again after the element is in the DOM. Try a couple of times.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    const t1 = setTimeout(tryPlay, 200);
    const t2 = setTimeout(tryPlay, 600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    let done = false;
    const handleReady = () => {
      if (done) return;
      done = true;
      const elapsed = Date.now() - startedAt.current;
      const remaining = Math.max(0, minDuration - elapsed);
      setTimeout(() => {
        setFading(true);
        setTimeout(() => {
          setHidden(true);
          onComplete?.();
        }, 650);
      }, remaining);
    };

    // Hard ceiling: regardless of any load events, never let the splash linger
    // beyond this. Fixes the "solid grey UI on refresh" bug on web/mobile where
    // cached refreshes sometimes never re-fire `load` reliably.
    const hardCeiling = setTimeout(handleReady, minDuration + 1500);

    if (document.readyState === "complete") {
      handleReady();
    } else {
      window.addEventListener("load", handleReady, { once: true });
    }
    return () => {
      window.removeEventListener("load", handleReady);
      clearTimeout(hardCeiling);
    };
  }, [minDuration, onComplete]);

  if (hidden) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity duration-[650ms] ease-out"
      style={{
        backgroundColor: SPLASH_BG_COLOR,
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <video
        ref={videoRef}
        src="./cubbly-loading.webm"
        autoPlay
        loop
        muted
        playsInline
        // @ts-expect-error — vendor attribute that helps iOS keep the video silent + inline
        webkit-playsinline="true"
        className="w-[260px] h-[260px] object-contain select-none"
        style={{ backgroundColor: SPLASH_BG_COLOR }}
      />
      <p
        className="mt-6 text-base font-semibold text-center px-6 max-w-[420px]"
        style={{ color: "#fff8ee", textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}
      >
        {lineRef.current}
      </p>
    </div>
  );
};

export default LoadingSplash;
