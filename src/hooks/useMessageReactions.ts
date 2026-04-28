import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface MessageReactionRow {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface AggregatedReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
  userIds: string[];
}

/**
 * Realtime hook for message reactions in a conversation. Loads all reactions
 * for the messages currently in the timeline, then keeps them in sync via
 * postgres_changes on `message_reactions`. Exposes a {messageId -> aggregated[]}
 * map plus a `toggle()` mutator that handles both add and remove.
 */
export function useMessageReactions(
  conversationId: string | null,
  messageIds: string[],
) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<Record<string, MessageReactionRow[]>>({});

  // Load reactions whenever the visible message set changes meaningfully.
  // We re-key on a stable join of ids so adding the same set doesn't refetch.
  const idsKey = messageIds.slice().sort().join(",");

  useEffect(() => {
    if (!conversationId || messageIds.length === 0) {
      setReactions({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("*")
        .in("message_id", messageIds);
      if (cancelled) return;
      if (error) {
        console.error("[reactions] load failed", error);
        return;
      }
      const grouped: Record<string, MessageReactionRow[]> = {};
      (data || []).forEach((r) => {
        (grouped[r.message_id] ??= []).push(r as MessageReactionRow);
      });
      setReactions(grouped);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, idsKey]);

  // Realtime subscription for this conversation's reactions
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`message-reactions:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          const row = payload.new as MessageReactionRow;
          setReactions((prev) => {
            const list = prev[row.message_id] ?? [];
            if (list.some((r) => r.id === row.id)) return prev;
            return { ...prev, [row.message_id]: [...list, row] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          const oldRow = payload.old as MessageReactionRow;
          setReactions((prev) => {
            const list = prev[oldRow.message_id];
            if (!list) return prev;
            return {
              ...prev,
              [oldRow.message_id]: list.filter((r) => r.id !== oldRow.id),
            };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const aggregate = useCallback(
    (messageId: string): AggregatedReaction[] => {
      const rows = reactions[messageId] || [];
      const map = new Map<string, AggregatedReaction>();
      for (const r of rows) {
        const cur = map.get(r.emoji) || {
          emoji: r.emoji,
          count: 0,
          reactedByMe: false,
          userIds: [],
        };
        cur.count += 1;
        cur.userIds.push(r.user_id);
        if (user && r.user_id === user.id) cur.reactedByMe = true;
        map.set(r.emoji, cur);
      }
      // Stable order: by first reaction time (approx via insertion order of rows)
      return Array.from(map.values());
    },
    [reactions, user],
  );

  const toggle = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      const list = reactions[messageId] || [];
      const mine = list.find(
        (r) => r.user_id === user.id && r.emoji === emoji,
      );
      if (mine) {
        // Optimistic remove
        setReactions((prev) => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter((r) => r.id !== mine.id),
        }));
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("id", mine.id);
        if (error) console.error("[reactions] remove failed", error);
      } else {
        // Optimistic add
        const tempId = `temp-${Date.now()}`;
        const optimistic: MessageReactionRow = {
          id: tempId,
          message_id: messageId,
          user_id: user.id,
          emoji,
          created_at: new Date().toISOString(),
        };
        setReactions((prev) => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), optimistic],
        }));
        const { data, error } = await supabase
          .from("message_reactions")
          .insert({ message_id: messageId, user_id: user.id, emoji })
          .select()
          .single();
        if (error) {
          console.error("[reactions] add failed", error);
          setReactions((prev) => ({
            ...prev,
            [messageId]: (prev[messageId] || []).filter(
              (r) => r.id !== tempId,
            ),
          }));
        } else if (data) {
          setReactions((prev) => ({
            ...prev,
            [messageId]: (prev[messageId] || []).map((r) =>
              r.id === tempId ? (data as MessageReactionRow) : r,
            ),
          }));
        }
      }
    },
    [reactions, user],
  );

  return { aggregate, toggle };
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
