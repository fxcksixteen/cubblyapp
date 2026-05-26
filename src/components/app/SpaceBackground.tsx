import { useEffect, useState } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/** Animated star-field background rendered when the Space theme is active. */
const SpaceBackground = () => {
  const { theme } = useTheme();
  const [shooting, setShooting] = useState(false);

  useEffect(() => {
    if (theme !== "space") {
      setShooting(false);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const schedule = () => {
      const delay = 30_000 + Math.random() * 90_000;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setShooting(true);
        timer = window.setTimeout(() => {
          if (cancelled) return;
          setShooting(false);
          schedule();
        }, 3_200);
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [theme]);

  if (theme !== "space") return null;
  return (
    <div className="cb-space-bg" aria-hidden="true">
      <div className="cb-space-stars" />
      <div className="cb-space-stars-2" />
      <div className="cb-space-stars-3" />
      {shooting && <div className="cb-shooting-star" />}
    </div>
  );
};

export default SpaceBackground;
