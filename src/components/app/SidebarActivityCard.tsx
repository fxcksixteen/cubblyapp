import { useAuth } from "@/contexts/AuthContext";
import { useActivity } from "@/contexts/ActivityContext";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ActivityCard from "./ActivityCard";

/**
 * Activity tile shown above the user panel in the DM sidebar. Displays the
 * current user's detected activity in a Discord-style frame.
 *
 * Returns null when there's no detected activity, when sharing is off, or on
 * the web (Electron-only feature — process scanning isn't available in browsers).
 */
const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

const SidebarActivityCard = () => {
  const { user } = useAuth();
  const { getActivity, shareActivity } = useActivity();

  if (!user || !isElectron || !shareActivity) return null;
  const act = getActivity(user.id);
  if (!act?.name) return null;

  const isSoftware = act.details === "software" || act.activity_type === "using";

  const handleHide = async () => {
    // Hide just this session — clears the row; will reappear when scanner detects again.
    await supabase.from("user_activities").delete().eq("user_id", user.id);
  };

  return (
    <div className="mx-2 mb-1.5">
      <ActivityCard
        name={act.name}
        type={isSoftware ? "software" : "game"}
        startedAt={act.started_at}
        variant="sidebar"
        trailing={
          <button
            onClick={handleHide}
            title="Hide activity"
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
