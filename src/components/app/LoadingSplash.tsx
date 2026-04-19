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

// iOS Safari (especially as an installed PWA) silently rejects autoplay of our
// webm on first paint — no user gesture, no codec guarantee. Detecting iOS and
// falling back to a CSS-only animation keeps the splash from sitting frozen.
function isIOSPWA(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  if (!isIOS) return false;
  const standalone =
    (window.navigator as any).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  // Even non-standalone iOS Safari struggles with the webm autoplay, so fall
  // back for any iOS device — guarantees a moving splash.
  return isIOS || standalone;
}

const LoadingSplash = ({ minDuration = 2200, onComplete }: LoadingSplashProps) => {
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lineRef = useRef(COZY_LINES[Math.floor(Math.random() * COZY_LINES.length)]);
  const startedAt = useRef(Date.now());
  const useFallback = useRef(isIOSPWA());

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
      {useFallback.current ? (
        // CSS-only "breathing" warm circle — guaranteed to animate on iOS PWA.
        <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
          <div className="splash-pulse-ring splash-pulse-ring--1" />
          <div className="splash-pulse-ring splash-pulse-ring--2" />
          <div className="splash-pulse-ring splash-pulse-ring--3" />
          <div
            className="relative flex items-center justify-center rounded-full splash-breathe"
            style={{
              width: 120,
              height: 120,
              background: "radial-gradient(circle at 35% 30%, #fff2dc, #d8a574 70%, #8a5e44)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.25)",
            }}
          >
            <span style={{ fontSize: 48, filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.2))" }}>🧸</span>
          </div>
          <style>{`
            @keyframes splash-breathe {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.06); }
            }
            @keyframes splash-pulse {
              0% { transform: scale(0.6); opacity: 0.55; }
              100% { transform: scale(1.3); opacity: 0; }
            }
            .splash-breathe { animation: splash-breathe 2.4s ease-in-out infinite; }
            .splash-pulse-ring {
              position: absolute;
              width: 140px;
              height: 140px;
              border-radius: 9999px;
              border: 2px solid rgba(255, 248, 238, 0.55);
              animation: splash-pulse 2.4s ease-out infinite;
            }
            .splash-pulse-ring--2 { animation-delay: 0.8s; }
            .splash-pulse-ring--3 { animation-delay: 1.6s; }
          `}</style>
        </div>
      ) : (
        <video
          src="./cubbly-loading.webm"
          autoPlay
          loop
          muted
          playsInline
          className="w-[260px] h-[260px] object-contain select-none"
          style={{ backgroundColor: SPLASH_BG_COLOR }}
        />
      )}
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
