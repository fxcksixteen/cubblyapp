import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playSound } from "@/lib/sounds";

export interface UnreadInfo {
  conversationId: string;
  count: number;
  lastSenderId: string | null;
  lastSenderName?: string | null;
  lastSenderAvatar?: string | null;
  lastMessageAt?: string;
}

/**
 * Tracks unread message counts per conversation for the current user.
 * Backed by `conversation_participants.last_read_at`.
 *
 * Plays a notification sound when a NEW message arrives in a conversation
 * that is NOT currently being viewed (and the user is not on DND).
 */
export function useUnreadCounts(activeConversationId: string | null) {
  const { user } = useAuth();
  const [unreadByConv, setUnreadByConv] = useState<Map<string, UnreadInfo>>(new Map());
  const lastReadByConvRef = useRef<Map<string, string>>(new Map());
  const fetchedOnceRef = useRef(false);
  const activeConvRef = useRef<string | null>(null);
  activeConvRef.current = activeConversationId;

  const fetchUnread = useCallback(async () => {
    if (!user) return;

    // 1. Get all my participations + last_read_at
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);

    if (!participations || participations.length === 0) {
      setUnreadByConv(new Map());
      return;
    }

    const lastReadMap = new Map<string, string>();
    participations.forEach((p) => lastReadMap.set(p.conversation_id, p.last_read_at));
    lastReadByConvRef.current = lastReadMap;

    const conversationIds = participations.map((p) => p.conversation_id);

    // 2. For each conversation, count messages newer than last_read_at AND not from us
    //    + grab the most recent message's sender for the avatar
    const result = new Map<string, UnreadInfo>();

    await Promise.all(
      conversationIds.map(async (convId) => {
        const lastRead = lastReadMap.get(convId)!;
        // Count unread (not from me, after last_read_at)
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", convId)
          .gt("created_at", lastRead)
          .neq("sender_id", user.id);

        if (!count || count === 0) return;

        // Get the most recent unread message for sender info
        const { data: lastMsg } = await supabase
          .from("messages")
          .select("sender_id, created_at")
          .eq("conversation_id", convId)
          .gt("created_at", lastRead)
          .neq("sender_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastMsg) return;

        // Sender profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", lastMsg.sender_id)
          .maybeSingle();

        result.set(convId, {
          conversationId: convId,
          count,
          lastSenderId: lastMsg.sender_id,
          lastSenderName: profile?.display_name,
          lastSenderAvatar: profile?.avatar_url,
          lastMessageAt: lastMsg.created_at,
        });
      })
    );

    setUnreadByConv(result);
    fetchedOnceRef.current = true;
  }, [user]);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  // Realtime: increment unread when a new message arrives in any of my conversations
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`unread-watcher:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id === user.id) return;

          // Verify I'm a participant — otherwise ignore
          const lastRead = lastReadByConvRef.current.get(msg.conversation_id);
          if (lastRead === undefined) {
            // Not in our cache yet — refetch
            await fetchUnread();
            return;
          }

          // If user is currently viewing this conversation, mark read instead
          if (activeConvRef.current === msg.conversation_id) {
            await supabase.rpc("mark_conversation_read", { _conversation_id: msg.conversation_id });
            lastReadByConvRef.current.set(msg.conversation_id, new Date().toISOString());
            return;
          }

          // Play notification sound (respects DND internally)
          playSound("message");

          // Fetch sender profile for the indicator
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name, avatar_url")
            .eq("user_id", msg.sender_id)
            .maybeSingle();

          setUnreadByConv((prev) => {
            const next = new Map(prev);
            const existing = next.get(msg.conversation_id);
            next.set(msg.conversation_id, {
              conversationId: msg.conversation_id,
              count: (existing?.count ?? 0) + 1,
              lastSenderId: msg.sender_id,
              lastSenderName: profile?.display_name ?? existing?.lastSenderName,
              lastSenderAvatar: profile?.avatar_url ?? existing?.lastSenderAvatar,
              lastMessageAt: msg.created_at,
            });
            return next;
          });
        }
      )
      // When my participant row changes (e.g. last_read_at updated from another tab), refetch
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` },
        () => {
          fetchUnread();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchUnread]);

  // When the user opens a conversation, mark it read
  useEffect(() => {
    if (!user || !activeConversationId) return;
    let cancelled = false;
    (async () => {
      await supabase.rpc("mark_conversation_read", { _conversation_id: activeConversationId });
      if (cancelled) return;
      lastReadByConvRef.current.set(activeConversationId, new Date().toISOString());
      setUnreadByConv((prev) => {
        if (!prev.has(activeConversationId)) return prev;
        const next = new Map(prev);
        next.delete(activeConversationId);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [user, activeConversationId]);

  const totalUnread = Array.from(unreadByConv.values()).reduce((sum, u) => sum + u.count, 0);

  return { unreadByConv, totalUnread, refetch: fetchUnread };
}
