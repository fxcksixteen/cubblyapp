import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export const MAX_PINNED_CONVERSATIONS = 3;

interface PinRow {
  conversation_id: string;
  pinned_at: string;
}

let cacheRef: { byConv: Map<string, PinRow>; userId: string | null } = {
  byConv: new Map(),
  userId: null,
};
const subscribers = new Set<() => void>();
function notifyAll() {
  subscribers.forEach((fn) => { try { fn(); } catch {} });
}

/**
 * Per-(viewer, conversation) pin state stored in public.conversation_pins.
 * Pinned DMs/groups float to the top of the DM sidebar (max 3, Discord-style).
 */
export function useConversationPins() {
  const { user } = useAuth();
  const [, force] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const tick = () => { if (mountedRef.current) force((x) => x + 1); };
    subscribers.add(tick);
    return () => { mountedRef.current = false; subscribers.delete(tick); };
  }, []);

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
        .from("conversation_pins" as any)
        .select("conversation_id, pinned_at")
        .eq("user_id", user.id);
      if (cancelled) return;
      const map = new Map<string, PinRow>();
      if (!error && Array.isArray(data)) {
        for (const r of data as any[]) {
          map.set(r.conversation_id, { conversation_id: r.conversation_id, pinned_at: r.pinned_at });
        }
      }
      cacheRef = { byConv: map, userId: user.id };
      notifyAll();
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isPinned = useCallback((conversationId: string): boolean => {
    return cacheRef.byConv.has(conversationId);
  }, []);

  const pinnedAt = useCallback((conversationId: string): string | undefined => {
    return cacheRef.byConv.get(conversationId)?.pinned_at;
  }, []);

  const pinnedCount = useCallback((): number => cacheRef.byConv.size, []);

  const setPinned = useCallback(
    async (conversationId: string, pinned: boolean): Promise<{ ok: boolean; reason?: string }> => {
      if (!user) return { ok: false, reason: "no-user" };
      if (pinned) {
        if (cacheRef.byConv.has(conversationId)) return { ok: true };
        if (cacheRef.byConv.size >= MAX_PINNED_CONVERSATIONS) {
          return { ok: false, reason: "limit" };
        }
        const now = new Date().toISOString();
        const { error } = await supabase
          .from("conversation_pins" as any)
          .upsert(
            { user_id: user.id, conversation_id: conversationId, pinned_at: now } as any,
            { onConflict: "user_id,conversation_id" } as any,
          );
        if (error) return { ok: false, reason: error.message };
        cacheRef.byConv.set(conversationId, { conversation_id: conversationId, pinned_at: now });
        notifyAll();
        return { ok: true };
      } else {
        const { error } = await supabase
          .from("conversation_pins" as any)
          .delete()
          .eq("user_id", user.id)
          .eq("conversation_id", conversationId);
        if (error) return { ok: false, reason: error.message };
        cacheRef.byConv.delete(conversationId);
        notifyAll();
        return { ok: true };
      }
    },
    [user],
  );

  return { isPinned, pinnedAt, pinnedCount, setPinned };
}
