import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { detectGame } from "@/lib/knownGames";

export interface UserActivity {
  user_id: string;
  activity_type: string;
  name: string | null;
  /** "game" | "software" — stored in `details` so we don't need a schema change. */
  details: string | null;
  started_at: string;
  privacy_visible: boolean;
}

interface ActivityContextType {
  /** Map of user_id -> activity (only contains users with current visible activity) */
  activities: Map<string, UserActivity>;
  /** Get activity for a specific user */
  getActivity: (userId: string) => UserActivity | undefined;
  /** My current activity sharing toggle (controls broadcasting + visibility to others) */
  shareActivity: boolean;
  setShareActivity: (enabled: boolean) => Promise<void>;
  /** My personally-added games */
  myGames: Array<{ id: string; process_name: string; display_name: string }>;
  refreshMyGames: () => Promise<void>;
  removeMyGame: (id: string) => Promise<void>;
  addMyGame: (processName: string, displayName: string) => Promise<void>;
}

const ActivityContext = createContext<ActivityContextType>({
  activities: new Map(),
  getActivity: () => undefined,
  shareActivity: true,
  setShareActivity: async () => {},
  myGames: [],
  refreshMyGames: async () => {},
  removeMyGame: async () => {},
  addMyGame: async () => {},
});

export const useActivity = () => useContext(ActivityContext);

const POLL_INTERVAL_MS = 15_000;
// When suppressing (gaming mode active) OR in a call, slow the heavy
// `tasklist` poll way down so it doesn't compete with WebRTC for CPU.
const POLL_INTERVAL_SUPPRESSED_MS = 60_000;
const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

export const ActivityProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<Map<string, UserActivity>>(new Map());
  const [shareActivity, setShareActivityState] = useState(true);
  const [myGames, setMyGames] = useState<Array<{ id: string; process_name: string; display_name: string }>>([]);
  const lastSentRef = useRef<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Fetch all visible activities + subscribe to realtime changes ----
  useEffect(() => {
    if (!user) {
      setActivities(new Map());
      return;
    }

    const fetchAll = async () => {
      const { data } = await supabase
        .from("user_activities")
        .select("*")
        .eq("privacy_visible", true);
      if (!data) return;
      const map = new Map<string, UserActivity>();
      data.forEach((a: any) => map.set(a.user_id, a));
      setActivities(map);
    };
    fetchAll();

    const channel = supabase
      .channel("user-activities-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_activities" },
        (payload) => {
          setActivities((prev) => {
            const next = new Map(prev);
            const newRow: any = payload.new;
            const oldRow: any = payload.old;
            if (payload.eventType === "DELETE") {
              if (oldRow?.user_id) next.delete(oldRow.user_id);
            } else if (newRow?.user_id) {
              if (newRow.privacy_visible) next.set(newRow.user_id, newRow);
              else next.delete(newRow.user_id);
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // ---- Load my own privacy preference + games on login ----
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data: act } = await supabase
        .from("user_activities")
        .select("privacy_visible")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled && act) setShareActivityState(act.privacy_visible);
      const { data: games } = await supabase
        .from("user_games")
        .select("id, process_name, display_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!cancelled && games) setMyGames(games);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ---- Broadcast my activity (Electron only) ----
  const broadcastActivity = useCallback(
    async (game: import("@/lib/knownGames").DetectedActivity | null) => {
      if (!user) return;
      const newKey = game ? `${game.type}:${game.displayName}` : "__none__";
      if (lastSentRef.current === newKey) return; // no change → skip
      lastSentRef.current = newKey;

      if (game) {
        await supabase
          .from("user_activities")
          .upsert(
            {
              user_id: user.id,
              activity_type: game.type === "software" ? "using" : "playing",
              name: game.displayName,
              // Stash the kind in `details` so consumers can pick the right verb.
              details: game.type,
              started_at: new Date().toISOString(),
              privacy_visible: shareActivity,
            },
            { onConflict: "user_id" }
          );
      } else {
        // Stopped playing → delete row
        await supabase.from("user_activities").delete().eq("user_id", user.id);
      }
    },
    [user?.id, shareActivity]
  );

  // ---- Poll running processes (Electron desktop only) ----
  useEffect(() => {
    if (!user || !isElectron) return;
    const api = (window as any).electronAPI;
    if (!api?.getRunningProcesses) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const procs: string[] = (await api.getRunningProcesses()) || [];
        const detected = detectGame(procs, myGames);
        broadcastActivity(detected);
      } catch {
        /* ignore */
      }
    };

    tick(); // immediate
    // Use slow polling when gaming-mode suppression OR an active call is happening,
    // to avoid the heavy `tasklist` scan competing with WebRTC for CPU/wifi.
    const getInterval = () => {
      const suppressing = (window as any).__cubblySuppress === true;
      const inCall = (window as any).__cubblyInCall === true;
      return suppressing || inCall ? POLL_INTERVAL_SUPPRESSED_MS : POLL_INTERVAL_MS;
    };
    const schedule = () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        await tick();
        // Re-evaluate cadence each tick in case state changed
        const desired = getInterval();
        if (pollTimerRef.current && (pollTimerRef.current as any)._cubblyMs !== desired) {
          (pollTimerRef.current as any)._cubblyMs = desired;
          schedule();
        }
      }, getInterval());
      (pollTimerRef.current as any)._cubblyMs = getInterval();
    };
    schedule();

    // Best-effort cleanup: when the app/tab closes, delete our activity row
    // so friends don't keep seeing "Playing Discord" after we're gone.
    const handleUnload = () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_activities?user_id=eq.${user.id}`;
        const headers = {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        };
        // sendBeacon doesn't support DELETE; use fetch with keepalive instead
        fetch(url, { method: "DELETE", headers, keepalive: true }).catch(() => {});
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      cancelled = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      window.removeEventListener("beforeunload", handleUnload);
      // Also clean up on unmount (sign-out)
      handleUnload();
      lastSentRef.current = null;
    };
  }, [user?.id, myGames, broadcastActivity]);

  // ---- When user toggles privacy off, immediately delete their activity row ----
  const setShareActivity = async (enabled: boolean) => {
    setShareActivityState(enabled);
    if (!user) return;
    if (!enabled) {
      await supabase.from("user_activities").delete().eq("user_id", user.id);
      lastSentRef.current = null;
    } else {
      // If something is currently broadcasting, force re-broadcast on next tick
      lastSentRef.current = null;
    }
  };

  const refreshMyGames = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("user_games")
      .select("id, process_name, display_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (data) setMyGames(data);
  };

  const addMyGame = async (processName: string, displayName: string) => {
    if (!user) return;
    await supabase.from("user_games").insert({
      user_id: user.id,
      process_name: processName.toLowerCase().replace(/\.exe$/, ""),
      display_name: displayName,
    });
    await refreshMyGames();
  };

  const removeMyGame = async (id: string) => {
    await supabase.from("user_games").delete().eq("id", id);
    await refreshMyGames();
  };

  return (
    <ActivityContext.Provider
      value={{
        activities,
        getActivity: (userId: string) => activities.get(userId),
        shareActivity,
        setShareActivity,
        myGames,
        refreshMyGames,
        removeMyGame,
        addMyGame,
      }}
    >
      {children}
    </ActivityContext.Provider>
  );
};
