import { useEffect, useRef, useState } from "react";
import { lookupCuratedIcon, lookupSteamIcon } from "@/lib/activityIcons";
import { getProfileColor } from "@/lib/profileColors";

interface Props {
  name?: string | null;
  /** The lowercased process name (e.g. "valorant") if known — improves icon matching. */
  processName?: string | null;
  /** Square pixel size. */
  size?: number;
  /** Optional className for outer wrapper. */
  className?: string;
  /** Border radius in px (defaults to 8). */
  rounded?: number;
}

const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

/**
 * Renders the best available icon for a detected activity, walking the
 * 3-tier fallback chain in order:
 *   1. Curated icon URL  →  2. Steam CDN  →  3. OS-extracted .exe icon  →
 *   4. Colored letter tile (final fallback)
 *
 * On error at each tier, automatically advances to the next.
 */
const ActivityIcon = ({ name, processName, size = 40, className = "", rounded = 8 }: Props) => {
  const tiers = useRef<(string | null)[]>([]);
  const [tierIdx, setTierIdx] = useState(0);
  const [osIcon, setOsIcon] = useState<string | null>(null);
  const [osIconLoading, setOsIconLoading] = useState(false);

  // Build the source list once per (name, processName) pair
  useEffect(() => {
    tiers.current = [
      lookupCuratedIcon(name, processName),
      lookupSteamIcon(name, processName),
      // OS icon is loaded async — placeholder for now
      null,
    ];
    setTierIdx(0);
    setOsIcon(null);
  }, [name, processName]);

  // When we exhaust tiers 0 + 1, try fetching OS icon (Electron only, once)
  useEffect(() => {
    if (!isElectron || osIcon || osIconLoading) return;
    if (tierIdx < 2) return; // not yet at OS-icon tier
    if (!processName) return;

    const api = (window as any).electronAPI;
    if (!api?.getProcessIcon) return;
    setOsIconLoading(true);
    api.getProcessIcon(processName).then((dataUrl: string | null) => {
      setOsIcon(dataUrl || null);
      setOsIconLoading(false);
    }).catch(() => setOsIconLoading(false));
  }, [tierIdx, processName, osIcon, osIconLoading]);

  const currentSrc =
    tierIdx === 0 ? tiers.current[0] :
    tierIdx === 1 ? tiers.current[1] :
    tierIdx === 2 ? osIcon :
    null;

  const initial = (name || "?").charAt(0).toUpperCase();
  const color = getProfileColor(name || processName || "?");

  if (!currentSrc) {
    // Letter tile fallback
    return (
      <div
        className={`flex shrink-0 items-center justify-center font-bold text-white ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: rounded,
          background: color.banner || color.bg,
          fontSize: Math.round(size * 0.4),
        }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={name || ""}
      width={size}
      height={size}
      className={`shrink-0 object-cover ${className}`}
      style={{ width: size, height: size, borderRadius: rounded, backgroundColor: "rgba(255,255,255,0.04)" }}
      onError={() => setTierIdx((i) => i + 1)}
    />
  );
};

export default ActivityIcon;
