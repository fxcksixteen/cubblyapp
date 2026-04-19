import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface CallParticipantState {
  user_id: string;
  is_muted: boolean;
  is_deafened: boolean;
  is_video_on: boolean;
  is_screen_sharing: boolean;
}

/**
 * Tracks live mute/deafen state of all participants in a given call event.
 * Both sides see each other's mute/deafen state in realtime.
 */
export function useCallParticipants(callEventId: string | null) {
  const { user } = useAuth();
  const [participants, setParticipants] = useState<Map<string, CallParticipantState>>(new Map());

  const fetchParticipants = useCallback(async () => {
    if (!callEventId) {
      setParticipants(new Map());
      return;
    }
    const { data } = await supabase
      .from("call_participants")
      .select("user_id, is_muted, is_deafened, is_video_on, is_screen_sharing")
      .eq("call_event_id", callEventId)
      .is("left_at", null);

    if (!data) return;
    const map = new Map<string, CallParticipantState>();
    data.forEach((p: any) => map.set(p.user_id, p));
    setParticipants(map);
  }, [callEventId]);

  useEffect(() => {
    fetchParticipants();
  }, [fetchParticipants]);

  // Realtime updates for mute/deafen changes.
  // CRITICAL: append a unique suffix to the channel name. Under React StrictMode
  // (dev) and HMR, supabase-js can hold on to a half-torn-down channel with
  // the same name, and the next mount throws "cannot add postgres_changes
  // callbacks ... after subscribe()". A fresh name per mount sidesteps that
  // entirely and means a crash here can never break joining a call.
  useEffect(() => {
    if (!callEventId) return;
    const uniqueSuffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`call-participants:${callEventId}:${uniqueSuffix}`);
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "call_participants", filter: `call_event_id=eq.${callEventId}` },
      () => fetchParticipants()
    );
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [callEventId, fetchParticipants]);

  /** Get state for a specific user in this call (or undefined if not joined) */
  const getStateFor = (userId: string) => participants.get(userId);

  /** Get state for the OTHER participant (not me) — useful for 1:1 calls */
  const getPeerState = () => {
    if (!user) return undefined;
    for (const [uid, state] of participants) {
      if (uid !== user.id) return state;
    }
    return undefined;
  };

  return { participants, getStateFor, getPeerState, refetch: fetchParticipants };
}
