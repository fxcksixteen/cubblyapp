import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useActivity } from "@/contexts/ActivityContext";
import { X } from "lucide-react";
import ActivityCard from "./ActivityCard";

/**
 * Activity tile shown above the user panel in the DM sidebar. Displays the
 * current user's detected activity in a Discord-style frame.
 *
 * Returns null when there's no detected activity, when sharing is off, or on
 * the web (Electron-only feature — process scanning isn't available in browsers).
 */
const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

const LS_DISMISSED = "cubbly:sidebarActivityDismissed";

const SidebarActivityCard = () => {
  const { user } = useAuth();
  const { getActivity, getActivityDetailsFor, shareActivity } = useActivity();

  // The X only hides the tile locally, for this user's sidebar. It never
  // touches the published activity — friends and your profile keep showing it.
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_DISMISSED); } catch { return null; }
  });

  const act = user ? getActivity(user.id) : undefined;
  const activityName = act?.name || null;

  // Once the activity changes (new game / session), the tile comes back.
  useEffect(() => {
    if (dismissed && activityName && dismissed !== activityName) {
      setDismissed(null);
      try { localStorage.removeItem(LS_DISMISSED); } catch { /* ignore */ }
    }
  }, [activityName, dismissed]);

  if (!user || !isElectron || !shareActivity) return null;
  if (!act?.name) return null;
  if (dismissed === act.name) return null;
  // Guarded: only use details whose game_key matches THIS activity.
  const det = getActivityDetailsFor(user.id, act.name);

  const isSoftware = act.details === "software" || act.activity_type === "using";

  const handleHide = () => {
    setDismissed(act.name!);
    try { localStorage.setItem(LS_DISMISSED, act.name!); } catch { /* ignore */ }
  };

  return (
    <div className="mx-2 mb-1.5">
      <ActivityCard
        name={act.name}
        type={isSoftware ? "software" : "game"}
        startedAt={act.started_at}
        details={det?.payload}
        variant="sidebar"
        trailing={
          <button
            onClick={handleHide}
            title="Hide from my sidebar (others still see your activity)"
            className="rounded p-0.5 transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
          >
            <X className="h-3 w-3" style={{ color: "var(--app-text-secondary, #949ba4)" }} />
          </button>
        }
      />
    </div>
  );
};

export default SidebarActivityCard;
