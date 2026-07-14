import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setDndActive } from "@/lib/sounds";
import { setNotificationDnd } from "@/lib/notifications";
import { subscribeWithReconnect } from "@/lib/realtimeReconnect";
import { registerSession, unregisterSession, getSessionKey } from "@/lib/sessionTracker";

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
  // Presence — fully database-driven.
  // Every client (this version OR older builds that just write user_sessions)
  // is counted as online by the `online_user_ids` RPC, which unions
  // profiles.last_seen_at and user_sessions.last_seen_at. We poll that RPC
  // every 20s and call presence_heartbeat every 30s. The realtime channel
  // is no longer used for the authoritative online set — it was the source
  // of the flicker. We keep no socket-based presence at all here.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const user = session?.user;
    if (!user) {
      setOnlineUserIds(new Set());
      return;
    }

    let cancelled = false;
    let inflight = false;
    let pendingDebounce: number | null = null;
    const sessionKey = getSessionKey();

    const heartbeat = async () => {
      try {
        await (supabase as any).rpc("presence_heartbeat", { _session_key: sessionKey });
      } catch {}
    };
    const fetchOnline = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const { data } = await (supabase as any).rpc("online_user_ids", { _window_seconds: 75 });
        if (cancelled) return;
        const ids = new Set<string>(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
        ids.add(user.id); // always include self
        setOnlineUserIds(ids);
      } catch {}
      finally { inflight = false; }
    };

    heartbeat();
    fetchOnline();
    const heartbeatInterval = window.setInterval(heartbeat, 30_000);
    // 30s polling for the authoritative online set. The realtime listener
    // below makes status changes feel instant; polling is the safety net.
    const pollInterval = window.setInterval(fetchOnline, 30_000);

    // Realtime: profile UPDATEs → refresh the online set quickly when
    // someone flips status (online ↔ idle ↔ dnd ↔ invisible).
    // SAFE COST-WISE: profiles.last_seen_at is no longer written by the
    // heartbeat (v0.1.7 cleanup), so this channel only fires on actual
    // user-driven status/avatar edits — a handful of events per user per
    // day, not 1/30s. Debounced so rapid bursts coalesce.
    const scheduleRefresh = () => {
      if (pendingDebounce != null) return;
      pendingDebounce = window.setTimeout(() => {
        pendingDebounce = null;
        fetchOnline();
      }, 400);
    };
    const profilesTopic = `presence-profiles:${user.id}`;
    const cleanupProfiles = subscribeWithReconnect(profilesTopic, () => {
      const ch = supabase.channel(profilesTopic);
      ch.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        scheduleRefresh
      );
      return ch;
    });

    const onWake = () => { heartbeat(); fetchOnline(); };
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("cubbly:realtime-wake", onWake);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatInterval);
      window.clearInterval(pollInterval);
      if (pendingDebounce != null) window.clearTimeout(pendingDebounce);
      cleanupProfiles();
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("cubbly:realtime-wake", onWake);
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
