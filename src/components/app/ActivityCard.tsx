import { useEffect, useState } from "react";
import ActivityIcon from "./ActivityIcon";

interface Props {
  name: string;
  /** Lowercased process name (improves icon matching). */
  processName?: string | null;
  /** "game" | "software" — controls the verb. */
  type?: "game" | "software" | null;
  /** ISO timestamp the activity started. */
  startedAt: string;
  /** Visual variant — sidebar is more compact, default is profile-sized. */
  variant?: "default" | "sidebar" | "compact";
  /** Optional right-side accessory (e.g. a close button). */
  trailing?: React.ReactNode;
}

const formatElapsed = (startedAt: string) => {
  const ms = Math.max(0, Date.now() - new Date(startedAt).getTime());
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just started";
  if (mins < 60) return `for ${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `for ${hours}h`;
  return `for ${hours}h ${rem}m`;
};

/**
 * Discord-style activity card with icon + name + verb + elapsed time.
 * Used in the DM sidebar, profile popups, and the Active Now rail.
 */
const ActivityCard = ({ name, processName, type, startedAt, variant = "default", trailing }: Props) => {
  const [, setTick] = useState(0);
  // Re-render every 30s to keep the elapsed time fresh
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const verb = type === "software" ? "Using" : "Playing";

  // Sizes per variant
  const iconSize = variant === "sidebar" ? 40 : variant === "compact" ? 36 : 48;
  const padding = variant === "sidebar" ? "p-2.5" : variant === "compact" ? "p-2.5" : "p-3";
  const titleClass = variant === "default" ? "text-[14px]" : "text-[13px]";

  return (
    <div
      className={`rounded-xl ${padding} animate-fade-in`}
      style={{
        backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: "var(--app-text-secondary, #949ba4)" }}
        >
          {verb}
        </span>
        {trailing}
      </div>
      <div className="flex items-center gap-3">
        <ActivityIcon name={name} processName={processName} size={iconSize} />
        <div className="min-w-0 flex-1">
          <p className={`truncate font-semibold text-white leading-tight ${titleClass}`}>{name}</p>
          <p
            className="truncate text-[11px] leading-tight mt-0.5"
            style={{ color: "var(--app-text-secondary, #949ba4)" }}
          >
            {formatElapsed(startedAt)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ActivityCard;
