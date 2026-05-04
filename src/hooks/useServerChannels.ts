import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ServerChannel } from "@/contexts/ServersContext";

export function useServerChannels(serverId: string | null) {
  const [channels, setChannels] = useState<ServerChannel[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!serverId) { setChannels([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("server_channels")
      .select("id, server_id, name, kind, category, position, conversation_id")
      .eq("server_id", serverId)
      .order("position", { ascending: true });
    setChannels((data as ServerChannel[]) || []);
    setLoading(false);
  }, [serverId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!serverId) return;
    const ch = supabase
      .channel(`server-chans:${serverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "server_channels", filter: `server_id=eq.${serverId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [serverId, refresh]);

  return { channels, loading, refresh };
}

export interface ServerMember {
  user_id: string;
  role: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  status: string;
}

export function useServerMembers(serverId: string | null) {
  const [members, setMembers] = useState<ServerMember[]>([]);
  const refresh = useCallback(async () => {
    if (!serverId) { setMembers([]); return; }
    const { data: rows } = await supabase
      .from("server_members")
      .select("user_id, role")
      .eq("server_id", serverId);
    if (!rows || rows.length === 0) { setMembers([]); return; }
    const ids = rows.map((r: any) => r.user_id);
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name, username, avatar_url, status")
      .in("user_id", ids);
    const profMap = new Map((profs || []).map((p: any) => [p.user_id, p]));
    setMembers(rows.map((r: any) => ({
      user_id: r.user_id, role: r.role,
      display_name: profMap.get(r.user_id)?.display_name || "Unknown",
      username: profMap.get(r.user_id)?.username || "",
      avatar_url: profMap.get(r.user_id)?.avatar_url || null,
      status: profMap.get(r.user_id)?.status || "offline",
    })));
  }, [serverId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!serverId) return;
    const ch = supabase
      .channel(`server-mem:${serverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "server_members", filter: `server_id=eq.${serverId}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [serverId, refresh]);

  return { members, refresh };
}
