import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setDndActive } from "@/lib/sounds";
import { setNotificationDnd } from "@/lib/notifications";
import { subscribeWithReconnect, removeChannelByTopic } from "@/lib/realtimeReconnect";
import { registerSession, unregisterSession } from "@/lib/sessionTracker";

const syncDnd = (isDnd: boolean) => {
  setDndActive(isDnd);
  setNotificationDnd(isDnd);
};

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  onlineUserIds: Set<string>;
  /** Current user's status from profiles table (online/idle/dnd/invisible) */
  myStatus: string;
  /** Update my status both locally + in DB */
  setMyStatus: (status: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
  onlineUserIds: new Set(),
  myStatus: "online",
  setMyStatus: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [myStatus, setMyStatusState] = useState<string>("online");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
        if (session?.user) {
          registerSession(session.user.id).catch(() => {});
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (session?.user) {
        registerSession(session.user.id).catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch my own profile status whenever auth changes
  useEffect(() => {
    const user = session?.user;
    if (!user) {
      setMyStatusState("online");
      syncDnd(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const status = data?.status || "online";
        setMyStatusState(status);
        syncDnd(status === "dnd");
      });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // Realtime: listen for changes to my own status row (could be edited from another tab).
  // Wrapped in subscribeWithReconnect so a transient socket drop doesn't leave
  // us stuck on a stale status — it auto-resubscribes after backoff.
  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    const topic = `my-profile-status:${user.id}`;
    const cleanup = subscribeWithReconnect(topic, () => {
      removeChannelByTopic(topic);
      const channel = supabase.channel(topic);
      channel.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const newStatus = (payload.new as any)?.status || "online";
          setMyStatusState(newStatus);
          syncDnd(newStatus === "dnd");
        }
      );
      return channel;
    });
    return cleanup;
  }, [session?.user?.id]);

  const setMyStatus = async (status: string) => {
    const user = session?.user;
    setMyStatusState(status);
    syncDnd(status === "dnd");
    if (user) {
      await supabase.from("profiles").update({ status }).eq("user_id", user.id);
    }
  };

  // Presence tracking — broadcast that we're online + track who else is.
  // Wrapped in subscribeWithReconnect so a closed/errored channel auto-rebuilds
  // (presence is what powers the green status dots — if it drops we MUST recover
  // automatically or every user looks offline forever).
  // Pending-offline timers per user_id. We NEVER flip a user from online →
  // offline immediately on a single empty/short presence sync — bursty iOS
  // background/foreground transitions and brief socket reconnects routinely
  // drop every key for one render. Instead we mark the uid as "maybe offline"
  // and only commit the removal after PRESENCE_OFFLINE_GRACE_MS of continuous
  // absence. Coming back ONLINE is always immediate.
  const pendingOfflineRef = useRef<Map<string, number>>(new Map());
  const PRESENCE_OFFLINE_GRACE_MS = 10_000;

  useEffect(() => {
    const user = session?.user;
    if (!user) {
      setOnlineUserIds(new Set());
      pendingOfflineRef.current.forEach((t) => window.clearTimeout(t));
      pendingOfflineRef.current.clear();
      return;
    }

    const topic = "global:online";
    const presenceKey = `${user.id}:${crypto.randomUUID()}`;

    const cleanup = subscribeWithReconnect(topic, () => {
      removeChannelByTopic(topic);
      const channel = supabase.channel(topic, {
        config: { presence: { key: presenceKey } },
      });

      const computeIdsFromState = (): Set<string> => {
        const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
        const ids = new Set<string>();
        for (const [key, entries] of Object.entries(state)) {
          for (const entry of entries) {
            const uid = entry?.user_id ?? key.split(":")[0];
            if (uid) ids.add(uid);
          }
          // Belt-and-suspenders: also union the key prefix.
          ids.add(key.split(":")[0]);
        }
        return ids;
      };

      const applyIds = (nextIds: Set<string>) => {
        setOnlineUserIds((prev) => {
          const merged = new Set(prev);
          // 1. Anyone newly present → add immediately + cancel pending offline.
          for (const uid of nextIds) {
            if (!merged.has(uid)) merged.add(uid);
            const t = pendingOfflineRef.current.get(uid);
            if (t) {
              window.clearTimeout(t);
              pendingOfflineRef.current.delete(uid);
            }
          }
          // 2. Anyone in `prev` but missing from `nextIds` → schedule a
          //    delayed removal (don't remove now). If they reappear in a
          //    later sync the timer is cleared above.
          for (const uid of prev) {
            if (nextIds.has(uid)) continue;
            if (pendingOfflineRef.current.has(uid)) continue;
            const handle = window.setTimeout(() => {
              pendingOfflineRef.current.delete(uid);
              setOnlineUserIds((curr) => {
                if (!curr.has(uid)) return curr;
                const copy = new Set(curr);
                copy.delete(uid);
                return copy;
              });
            }, PRESENCE_OFFLINE_GRACE_MS);
            pendingOfflineRef.current.set(uid, handle);
          }
          return merged;
        });
      };

      const onSync = () => {
        applyIds(computeIdsFromState());
        // Re-track on every sync — cheap, idempotent, and ensures our
        // presence entry survives any transient socket churn.
        channel
          .track({ user_id: user.id, online_at: new Date().toISOString() })
          .catch(() => {});
      };

      channel
        .on("presence", { event: "sync" }, onSync)
        .on("presence", { event: "join" }, onSync)
        .on("presence", { event: "leave" }, onSync);

      return channel;
    });

    // On global wake, force-clear pending-offline timers — anyone still
    // genuinely online will be confirmed by the next sync.
    const onWake = () => {
      pendingOfflineRef.current.forEach((t) => window.clearTimeout(t));
      pendingOfflineRef.current.clear();
    };
    window.addEventListener("cubbly:realtime-wake", onWake);

    return () => {
      cleanup();
      window.removeEventListener("cubbly:realtime-wake", onWake);
      pendingOfflineRef.current.forEach((t) => window.clearTimeout(t));
      pendingOfflineRef.current.clear();
      setOnlineUserIds(new Set());
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    const uid = session?.user?.id;
    if (uid) {
      try { await unregisterSession(uid); } catch {}
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut,
        onlineUserIds,
        myStatus,
        setMyStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
