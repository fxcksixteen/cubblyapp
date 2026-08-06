import { useEffect, useRef, useState } from "react";

interface Props {
  /** Lines to cycle through. Falsy entries are ignored. */
  lines: Array<{ key: string; text: string; color?: string } | null | undefined | false>;
  /** Rotation interval in ms. Default 3000. */
  intervalMs?: number;
  className?: string;
}

/**
 * Single-line subtitle that cleanly slides between multiple values (e.g. a
 * custom status and a detected activity) every few seconds. Renders one line
 * at a time so the row height never changes. Honors reduced-motion.
 */
const RotatingSubtitle = ({ lines, intervalMs = 3000, className = "" }: Props) => {
  const items = lines.filter(Boolean) as Array<{ key: string; text: string; color?: string }>;
  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState(false);
  const count = items.length;
  const timer = useRef<number | null>(null);

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    setIdx(0);
  }, [count, items.map((i) => i.key).join("|")]);

  useEffect(() => {
    if (count < 2) return;
    timer.current = window.setInterval(() => {
      setIdx((i) => (i + 1) % count);
      if (!reduced) {
        setAnim(true);
        window.setTimeout(() => setAnim(false), 260);
      }
    }, intervalMs);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [count, intervalMs, reduced]);

  if (count === 0) return null;
  const current = items[Math.min(idx, count - 1)];

  return (
    <p
      className={`truncate text-[11px] leading-tight ${className}`}
      style={{
        color: current.color || "var(--app-text-secondary, #949ba4)",
        animation: anim ? "cubbly-subtitle-swap 260ms ease-out" : undefined,
      }}
    >
      {current.text}
    </p>
  );
};

export default RotatingSubtitle;
