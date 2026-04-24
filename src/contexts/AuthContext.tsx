import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setDndActive } from "@/lib/sounds";
import { setNotificationDnd } from "@/lib/notifications";

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
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

  // Realtime: listen for changes to my own status row (could be edited from another tab)
  useEffect(() => {
    const user = session?.user;
    if (!user) return;
    // CRITICAL: attach .on() before .subscribe()
    const uniqueSuffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`my-profile-status:${user.id}:${uniqueSuffix}`);
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
      (payload) => {
        const newStatus = (payload.new as any)?.status || "online";
        setMyStatusState(newStatus);
        syncDnd(newStatus === "dnd");
      }
    );
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const setMyStatus = async (status: string) => {
    const user = session?.user;
    setMyStatusState(status);
    syncDnd(status === "dnd");
    if (user) {
      await supabase.from("profiles").update({ status }).eq("user_id", user.id);
    }
  };

  // Presence tracking — broadcast that we're online and track who else is
  useEffect(() => {
    const user = session?.user;
    if (!user) {
      // Clean up presence when logged out
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      setOnlineUserIds(new Set());
      return;
    }

    // CRITICAL: this MUST be a single shared channel name across all users
    // and tabs (matches the iOS-native `global:online` room). Using a unique
    // per-tab suffix puts every client into its own isolated room, so nobody
    // ever sees anyone else as online — that was the root cause of all the
    // "status indicators don't work anymore" reports.
    const channel = supabase.channel(`global:online`, {
      config: { presence: { key: user.id } },
    });

    const syncPresence = () => {
      const state = channel.presenceState();
      const ids = new Set<string>(Object.keys(state));
      setOnlineUserIds(ids);
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: user.id, online_at: new Date().toISOString() });
          // Hydrate immediately — presence "sync" sometimes fires only on the
          // NEXT join/leave, which leaves the friends list looking offline
          // until someone toggles their status. Pull the current snapshot.
          syncPresence();
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
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
