import { useEffect, useState } from "react";
import ActivityIcon from "./ActivityIcon";
import { isSoftwareActivity } from "@/lib/activityLabel";

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
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} elapsed`;
  if (m > 0) return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} elapsed`;
  if (totalSec < 5) return "just started";
  return `${s}s elapsed`;
};

/**
 * Discord-style activity card with icon + name + verb + elapsed time.
 * Used in the DM sidebar, profile popups, and the Active Now rail.
 */
const ActivityCard = ({ name, processName, type, startedAt, variant = "default", trailing }: Props) => {
  const [, setTick] = useState(0);
  // Re-render every 1s so the elapsed counter ticks live (Discord-style mm:ss).
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, []);


  const verb = type === "software" || isSoftwareActivity({ name }) ? "Using" : "Playing";

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
          className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5"
          style={{ color: "var(--app-text-secondary, #949ba4)" }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#3ba55c] opacity-75 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#3ba55c]" />
          </span>
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
