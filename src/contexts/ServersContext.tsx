import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Server {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
}

export interface ServerChannel {
  id: string;
  server_id: string;
  name: string;
  kind: "text" | "voice";
  category: string | null;
  position: number;
  conversation_id: string | null;
}

interface ServersContextValue {
  servers: Server[];
  loading: boolean;
  refresh: () => Promise<void>;
  createServer: (name: string, iconUrl?: string | null) => Promise<string | null>;
  createServerFromTemplate: (
    name: string,
    iconUrl: string | null,
    channels: Array<{ name: string; kind: "text" | "voice"; category: string | null }>,
  ) => Promise<string | null>;
  joinByCode: (code: string) => Promise<string | null>;
  lookupInvite: (code: string) => Promise<{ server_id: string; name: string; icon_url: string | null; member_count: number } | null>;
}

const ServersContext = createContext<ServersContextValue | null>(null);

export const ServersProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setServers([]); setLoading(false); return; }
    setLoading(true);
    const { data: memberships } = await supabase
      .from("server_members")
      .select("server_id")
      .eq("user_id", user.id);
    const ids = (memberships || []).map((m: any) => m.server_id);
    if (ids.length === 0) { setServers([]); setLoading(false); return; }
    const { data } = await supabase
      .from("servers")
      .select("id, name, icon_url, owner_id")
      .in("id", ids)
      .order("created_at", { ascending: true });
    setServers((data as Server[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime: refetch on membership changes
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`servers:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members", filter: `user_id=eq.${user.id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "servers" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  const createServer = useCallback(async (name: string, iconUrl?: string | null) => {
    const { data, error } = await supabase.rpc("create_server", { _name: name, _icon_url: iconUrl ?? null });
    if (error) throw error;
    await refresh();
    return data as string;
  }, [refresh]);

  const createServerFromTemplate = useCallback(
    async (
      name: string,
      iconUrl: string | null,
      channels: Array<{ name: string; kind: "text" | "voice"; category: string | null }>,
    ) => {
      const { data, error } = await supabase.rpc("create_server_from_template", {
        _name: name,
        _icon_url: iconUrl,
        _channels: channels as any,
      });
      if (error) throw error;
      await refresh();
      return data as string;
    },
    [refresh],
  );

  const joinByCode = useCallback(async (code: string) => {
    const { data, error } = await supabase.rpc("join_server_by_code", { _code: code });
    if (error) throw error;
    await refresh();
    return data as string;
  }, [refresh]);

  const lookupInvite = useCallback(async (code: string) => {
    const { data, error } = await supabase.rpc("lookup_server_invite", { _code: code });
    if (error) return null;
    return data as any;
  }, []);

  const value = useMemo(
    () => ({ servers, loading, refresh, createServer, createServerFromTemplate, joinByCode, lookupInvite }),
    [servers, loading, refresh, createServer, createServerFromTemplate, joinByCode, lookupInvite],
  );

  return <ServersContext.Provider value={value}>{children}</ServersContext.Provider>;
};

export const useServers = () => {
  const ctx = useContext(ServersContext);
  if (!ctx) throw new Error("useServers must be used within ServersProvider");
  return ctx;
};
