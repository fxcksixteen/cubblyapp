import { useEffect } from "react";

/**
 * Auto-grow a textarea up to a maximum number of lines (then internal scroll).
 * Re-measures whenever the value changes.
 */
export function useAutoGrowTextarea(
  ref: React.RefObject<HTMLTextAreaElement>,
  value: string,
  maxLines = 6,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset to single-line baseline so scrollHeight reflects content height accurately.
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "20") || 20;
    const padding =
      parseFloat(getComputedStyle(el).paddingTop || "0") +
      parseFloat(getComputedStyle(el).paddingBottom || "0");
    const maxHeight = lineHeight * maxLines + padding;
    const desired = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${desired}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [ref, value, maxLines]);
}
