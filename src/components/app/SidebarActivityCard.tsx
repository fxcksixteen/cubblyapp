import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useActivity } from "@/contexts/ActivityContext";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Discord-style activity tile shown above the user panel in the DM sidebar.
 * Shows the current user's detected activity (game/software), with a small
 * tile, name, "Playing X" / "Using X" verb, and elapsed time since started.
 *
 * Returns null when there's no detected activity, when sharing is off, or on
 * the web (Electron-only feature — process scanning isn't available in browsers).
 */
const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

const formatElapsed = (startedAt: string) => {
  const ms = Date.now() - new Date(startedAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `for ${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (rem === 0) return `for ${hours}h`;
  return `for ${hours}h ${rem}m`;
};

const SidebarActivityCard = () => {
  const { user } = useAuth();
  const { getActivity, shareActivity } = useActivity();
  const [, setTick] = useState(0);

  // Re-render every 30s so the elapsed time updates
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  if (!user || !isElectron || !shareActivity) return null;
  const act = getActivity(user.id);
  if (!act?.name) return null;

  const isSoftware = act.details === "software" || act.activity_type === "using";
  const verb = isSoftware ? "Using" : "Playing";
  const initial = act.name.charAt(0).toUpperCase();

  const handleHide = async () => {
    // Hide just this session — clears the row; will reappear when scanner detects again.
    await supabase.from("user_activities").delete().eq("user_id", user.id);
  };

  return (
    <div
      className="mx-2 mb-1.5 rounded-lg p-2.5 animate-fade-in"
      style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: "var(--app-text-secondary, #949ba4)" }}
        >
          {verb}
        </span>
        <button
          onClick={handleHide}
          title="Hide activity"
          className="rounded p-0.5 transition-colors"
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
        >
          <X className="h-3 w-3" style={{ color: "var(--app-text-secondary, #949ba4)" }} />
        </button>
      </div>
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-base font-bold text-white"
          style={{
            background: isSoftware
              ? "linear-gradient(135deg, #5865f2, #4752c4)"
              : "linear-gradient(135deg, #3ba55c, #2d7d46)",
          }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-white leading-tight">{act.name}</p>
          <p
            className="truncate text-[11px] leading-tight mt-0.5"
            style={{ color: "var(--app-text-secondary, #949ba4)" }}
          >
            {formatElapsed(act.started_at)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default SidebarActivityCard;
