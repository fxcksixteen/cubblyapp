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

  useEffect(() => {
    const handleReady = () => {
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

    if (document.readyState === "complete") {
      handleReady();
    } else {
      window.addEventListener("load", handleReady, { once: true });
      // Fallback in case load never fires (Electron etc.)
      const fallback = setTimeout(handleReady, minDuration + 500);
      return () => {
        window.removeEventListener("load", handleReady);
        clearTimeout(fallback);
      };
    }
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
        src="./cubbly-loading.webm"
        autoPlay
        loop
        muted
        playsInline
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
