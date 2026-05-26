import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ChannelVoiceParticipant {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_muted: boolean;
  is_deafened: boolean;
  is_video_on: boolean;
  is_screen_sharing: boolean;
}

/**
 * Lists users currently connected to a voice channel by looking up the
 * active (un-ended) call_event for the channel's conversation, then joining
 * call_participants -> profiles. Realtime-updates on any participant change.
 */
export function useChannelVoiceParticipants(conversationId: string | null) {
  const [participants, setParticipants] = useState<ChannelVoiceParticipant[]>([]);
  const [callEventId, setCallEventId] = useState<string | null>(null);

  const fetchActive = useCallback(async () => {
    if (!conversationId) { setParticipants([]); setCallEventId(null); return; }
    const { data: ev } = await supabase
      .from("call_events")
      .select("id")
      .eq("conversation_id", conversationId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ev) { setParticipants([]); setCallEventId(null); return; }
    setCallEventId(ev.id);

    const { data: parts } = await supabase
      .from("call_participants")
      .select("user_id, is_muted, is_deafened, is_video_on, is_screen_sharing")
      .eq("call_event_id", ev.id)
      .is("left_at", null);
    if (!parts || parts.length === 0) { setParticipants([]); return; }

    const ids = parts.map((p: any) => p.user_id);
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", ids);
    const pmap = new Map<string, { display_name: string; avatar_url: string | null }>();
    (profs || []).forEach((p: any) => pmap.set(p.user_id, { display_name: p.display_name || "Member", avatar_url: p.avatar_url }));

    setParticipants(parts.map((p: any) => ({
      user_id: p.user_id,
      display_name: pmap.get(p.user_id)?.display_name || "Member",
      avatar_url: pmap.get(p.user_id)?.avatar_url || null,
      is_muted: !!p.is_muted,
      is_deafened: !!p.is_deafened,
      is_video_on: !!p.is_video_on,
      is_screen_sharing: !!p.is_screen_sharing,
    })));
  }, [conversationId]);

  useEffect(() => { fetchActive(); }, [fetchActive]);

  useEffect(() => {
    if (!conversationId) return;
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    const ch = supabase.channel(`ch-voice:${conversationId}:${suffix}`);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "call_events", filter: `conversation_id=eq.${conversationId}` }, () => fetchActive());
    if (callEventId) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: "call_participants", filter: `call_event_id=eq.${callEventId}` }, () => fetchActive());
    }
    ch.subscribe();
    // also poll every 15s as safety net (RLS / realtime gaps)
    const poll = window.setInterval(() => fetchActive(), 15000);
    return () => { supabase.removeChannel(ch); window.clearInterval(poll); };
  }, [conversationId, callEventId, fetchActive]);

  return { participants, callEventId, refetch: fetchActive };
}
