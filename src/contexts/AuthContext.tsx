import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setDndActive } from "@/lib/sounds";
import { setNotificationDnd } from "@/lib/notifications";
import { subscribeWithReconnect, removeChannelByTopic } from "@/lib/realtimeReconnect";

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
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
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
  useEffect(() => {
    const user = session?.user;
    if (!user) {
      setOnlineUserIds(new Set());
      return;
    }

    // CRITICAL: must be a single shared channel name across all users + tabs
    // (matches the iOS-native `global:online` room). Per-tab suffixes would
    // isolate each client and break presence entirely.
    const topic = "global:online";

    // Per-CONNECTION presence key (NOT per-user). If we keyed by user.id, every
    // device the user has open would collide on the same key — and when ANY one
    // device drops (iOS backgrounded, tab closed, network blip), Supabase fires
    // a `leave` for that shared key and the user momentarily disappears from
    // presenceState on every other client until the next track() lands. That
    // caused the on/off/on/off flicker. With a unique per-connection key, the
    // user is "online" as long as ≥1 of their devices has an active entry.
    const presenceKey = `${user.id}:${crypto.randomUUID()}`;

    const cleanup = subscribeWithReconnect(topic, () => {
      // Drop any stale cached channel before re-attaching .on() handlers,
      // otherwise supabase-js throws "cannot add presence callbacks ... after
      // subscribe()" on the rebuild.
      removeChannelByTopic(topic);
      const channel = supabase.channel(topic, {
        config: { presence: { key: presenceKey } },
      });
      const syncPresence = () => {
        const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
        const ids = new Set<string>();
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            // Prefer the explicit user_id we tracked; fall back to parsing the
            // key (format: "<user_id>:<uuid>") for resilience.
            const uid = entry?.user_id ?? Object.keys(state).find((k) => state[k] === entries)?.split(":")[0];
            if (uid) ids.add(uid);
          }
        }
        // Also union in any keys themselves (handles iOS native clients that
        // may key directly by user.id without a metadata payload).
        for (const key of Object.keys(state)) {
          ids.add(key.split(":")[0]);
        }
        setOnlineUserIds(ids);
      };
      channel
        .on("presence", { event: "sync" }, syncPresence)
        .on("presence", { event: "join" }, syncPresence)
        .on("presence", { event: "leave" }, syncPresence);
      // Re-track on every sync — cheap, idempotent, and ensures our presence
      // entry survives a reconnect even if our previous track() was lost.
      channel.on("presence", { event: "sync" }, () => {
        channel.track({ user_id: user.id, online_at: new Date().toISOString() }).catch(() => {});
        syncPresence();
      });
      return channel;
    });

    return () => {
      cleanup();
      setOnlineUserIds(new Set());
    };
  }, [session?.user?.id]);

  const signOut = async () => {
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
