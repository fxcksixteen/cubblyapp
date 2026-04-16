import { useEffect, useRef } from "react";

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum px distance to count as a swipe. Default 60. */
  threshold?: number;
  /** Max px the user can move perpendicular before we cancel. Default 75. */
  maxPerpendicular?: number;
  /** Max ms a swipe can take. Default 600. */
  maxDuration?: number;
  /** Only trigger if touch starts within this many px from the left edge. 0 = anywhere. */
  edgeOnlyLeft?: number;
  /** Only trigger if touch starts within this many px from the right edge. 0 = anywhere. */
  edgeOnlyRight?: number;
  /** Disable the listener entirely. */
  disabled?: boolean;
}

/**
 * Touch swipe detector. Attach to a ref'd element. Discord-style mobile gestures.
 * Returns a ref to attach to the swipe target.
 */
export function useSwipe<T extends HTMLElement = HTMLDivElement>(opts: SwipeOptions) {
  const ref = useRef<T | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const el = ref.current;
    if (!el || opts.disabled) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
      const o = optsRef.current;
      // Edge-only filters apply only when set (>0)
      const w = window.innerWidth;
      if (o.edgeOnlyLeft && startX > o.edgeOnlyLeft) { tracking = false; return; }
      if (o.edgeOnlyRight && startX < w - o.edgeOnlyRight) { tracking = false; return; }
      tracking = true;
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      const o = optsRef.current;
      const threshold = o.threshold ?? 60;
      const maxPerp = o.maxPerpendicular ?? 75;
      const maxDur = o.maxDuration ?? 600;
      if (dt > maxDur) return;
      if (Math.abs(dy) > maxPerp) return;
      if (dx >= threshold) o.onSwipeRight?.();
      else if (dx <= -threshold) o.onSwipeLeft?.();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [opts.disabled]);

  return ref;
}
