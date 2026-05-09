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

  // ─────────────────────────────────────────────────────────────────────
  // Presence — server-side heartbeat model.
  // Every authenticated client calls `presence_heartbeat` every 30s. The DB
  // stores `profiles.last_seen_at`. "Online" = last_seen_at within ~75s AND
  // status != 'invisible'. This is the source of truth — flicker on the
  // realtime presence channel can no longer mark someone offline.
  // We additionally subscribe to a global presence channel as a *bonus*
  // signal, and union it with the DB result so old clients (pre-DB-heartbeat)
  // still appear online via the channel.
  // ─────────────────────────────────────────────────────────────────────
  const dbOnlineRef = useRef<Set<string>>(new Set());
  const channelOnlineRef = useRef<Set<string>>(new Set());

  const recomputeOnline = () => {
    const merged = new Set<string>();
    dbOnlineRef.current.forEach((u) => merged.add(u));
    channelOnlineRef.current.forEach((u) => merged.add(u));
    setOnlineUserIds(merged);
  };

  useEffect(() => {
    const user = session?.user;
    if (!user) {
      dbOnlineRef.current = new Set();
      channelOnlineRef.current = new Set();
      setOnlineUserIds(new Set());
      return;
    }

    let cancelled = false;

    // ── Heartbeat the DB so we count as online server-side.
    const heartbeat = async () => {
      try { await (supabase as any).rpc("presence_heartbeat"); } catch {}
    };
    heartbeat();
    const heartbeatInterval = window.setInterval(heartbeat, 30_000);
    const onWake = () => { heartbeat(); };
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("cubbly:realtime-wake", onWake);

    // ── Poll DB for the authoritative online list every 20s.
    const fetchOnline = async () => {
      try {
        const { data } = await (supabase as any).rpc("online_user_ids", { _window_seconds: 75 });
        if (cancelled) return;
        const ids = new Set<string>(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
        // Always include self while authenticated.
        ids.add(user.id);
        dbOnlineRef.current = ids;
        recomputeOnline();
      } catch {}
    };
    fetchOnline();
    const pollInterval = window.setInterval(fetchOnline, 20_000);

    // ── Bonus signal: realtime presence channel (helps users on older clients).
    const topic = "global:online";
    const presenceKey = `${user.id}:${crypto.randomUUID()}`;
    const cleanup = subscribeWithReconnect(topic, () => {
      removeChannelByTopic(topic);
      const channel = supabase.channel(topic, {
        config: { presence: { key: presenceKey } },
      });
      const onSync = () => {
        const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
        const ids = new Set<string>();
        for (const [key, entries] of Object.entries(state)) {
          for (const entry of entries) {
            const uid = entry?.user_id ?? key.split(":")[0];
            if (uid) ids.add(uid);
          }
          ids.add(key.split(":")[0]);
        }
        channelOnlineRef.current = ids;
        recomputeOnline();
        channel.track({ user_id: user.id, online_at: new Date().toISOString() }).catch(() => {});
      };
      channel
        .on("presence", { event: "sync" }, onSync)
        .on("presence", { event: "join" }, onSync)
        .on("presence", { event: "leave" }, onSync);
      return channel;
    });

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatInterval);
      window.clearInterval(pollInterval);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("cubbly:realtime-wake", onWake);
      cleanup();
      dbOnlineRef.current = new Set();
      channelOnlineRef.current = new Set();
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
