import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type MuteDuration =
  | { kind: "minutes"; minutes: number }
  | { kind: "forever" };

interface MuteRow {
  conversation_id: string;
  muted_until: string | null; // null = forever
}

let cacheRef: { byConv: Map<string, MuteRow>; userId: string | null } = { byConv: new Map(), userId: null };
const subscribers = new Set<() => void>();
function notifyAll() { subscribers.forEach((fn) => { try { fn(); } catch {} }); }

/**
 * Per-(viewer, conversation) mute state stored in public.conversation_mutes.
 * Muted DMs/groups stay silent (no desktop notif, no sound, no mention bypass)
 * but still increment the unread badge — Discord behaviour.
 */
export function useConversationMutes() {
  const { user } = useAuth();
  const [, force] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const tick = () => { if (mountedRef.current) force((x) => x + 1); };
    subscribers.add(tick);
    return () => { mountedRef.current = false; subscribers.delete(tick); };
  }, []);

  // Initial load + refresh on user change.
  useEffect(() => {
    if (!user) {
      cacheRef = { byConv: new Map(), userId: null };
      notifyAll();
      return;
    }
    if (cacheRef.userId === user.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("conversation_mutes" as any)
        .select("conversation_id, muted_until")
        .eq("user_id", user.id);
      if (cancelled) return;
      const map = new Map<string, MuteRow>();
      if (!error && Array.isArray(data)) {
        for (const r of data as any[]) {
          map.set(r.conversation_id, { conversation_id: r.conversation_id, muted_until: r.muted_until });
        }
      }
      cacheRef = { byConv: map, userId: user.id };
      notifyAll();
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isMuted = useCallback((conversationId: string): boolean => {
    const row = cacheRef.byConv.get(conversationId);
    if (!row) return false;
    if (row.muted_until === null) return true; // forever
    return new Date(row.muted_until).getTime() > Date.now();
  }, []);

  const mutedUntil = useCallback((conversationId: string): Date | null | undefined => {
    const row = cacheRef.byConv.get(conversationId);
    if (!row) return undefined;
    if (row.muted_until === null) return null;
    const d = new Date(row.muted_until);
    return d.getTime() > Date.now() ? d : undefined;
  }, []);

  const setMute = useCallback(async (conversationId: string, duration: MuteDuration | null) => {
    if (!user) return;
    if (duration === null) {
      await supabase.from("conversation_mutes" as any).delete().eq("user_id", user.id).eq("conversation_id", conversationId);
      cacheRef.byConv.delete(conversationId);
      notifyAll();
      return;
    }
    const until = duration.kind === "forever" ? null : new Date(Date.now() + duration.minutes * 60_000).toISOString();
    await supabase.from("conversation_mutes" as any).upsert(
      { user_id: user.id, conversation_id: conversationId, muted_until: until } as any,
      { onConflict: "user_id,conversation_id" } as any,
    );
    cacheRef.byConv.set(conversationId, { conversation_id: conversationId, muted_until: until });
    notifyAll();
  }, [user]);

  return { isMuted, mutedUntil, setMute };
}

/** Module-level helper for non-hook call sites (e.g. notification handler). */
export function isConversationMutedNow(conversationId: string): boolean {
  const row = cacheRef.byConv.get(conversationId);
  if (!row) return false;
  if (row.muted_until === null) return true;
  return new Date(row.muted_until).getTime() > Date.now();
}
