import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { playSound } from "@/lib/sounds";
import { notify, ensureNotificationPermission } from "@/lib/notifications";
import { getNotificationPreferences } from "@/lib/notificationSettings";

export interface UnreadInfo {
  conversationId: string;
  count: number;
  lastSenderId: string | null;
  lastSenderName?: string | null;
  lastSenderAvatar?: string | null;
  lastMessageAt?: string;
  /** True when the conversation is a group DM (so UI can use the group avatar). */
  isGroup?: boolean;
  /** Group display name (for tooltips). */
  groupName?: string | null;
  /** Group custom picture, if any. */
  groupPictureUrl?: string | null;
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

    // Fetch conversation metadata so we know which are groups
    const { data: convRows } = await supabase
      .from("conversations")
      .select("id, is_group, name, picture_url")
      .in("id", conversationIds);
    const convMap = new Map((convRows || []).map((c) => [c.id, c]));

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

        const conv = convMap.get(convId);
        result.set(convId, {
          conversationId: convId,
          count,
          lastSenderId: lastMsg.sender_id,
          lastSenderName: profile?.display_name,
          lastSenderAvatar: profile?.avatar_url,
          lastMessageAt: lastMsg.created_at,
          isGroup: !!conv?.is_group,
          groupName: conv?.name ?? null,
          groupPictureUrl: conv?.picture_url ?? null,
        });
      })
    );

    setUnreadByConv(result);
    fetchedOnceRef.current = true;
  }, [user]);

  useEffect(() => {
    fetchUnread();
    // Only auto-request OS notification permission in Electron (where it's
    // a no-op — already granted) or in an installed mobile PWA. Plain
    // desktop browsers should NOT get a permission prompt — desktop users
    // are expected to install the actual Cubbly desktop app for notifications.
    const isElectron = !!(window as any).electronAPI?.isElectron;
    const isStandalone =
      (window.navigator as any).standalone === true ||
      (() => { try { return window.matchMedia("(display-mode: standalone)").matches; } catch { return false; } })();
    if (isElectron || isStandalone) {
      ensureNotificationPermission().catch(() => {});
    }
  }, [fetchUnread]);

  // Realtime: increment unread when a new message arrives in any of my conversations
  useEffect(() => {
    if (!user) return;

    // CRITICAL: attach .on() listeners BEFORE .subscribe(), otherwise
    // supabase-js throws "cannot add postgres_changes callbacks after subscribe()".
    const channel = supabase.channel(`unread-watcher:${user.id}`);
    channel.on(
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

        // Only treat the chat as "open" when the window is ACTUALLY focused.
        const windowFocused = typeof document !== "undefined" && document.hasFocus();
        const isViewingAndFocused = activeConvRef.current === msg.conversation_id && windowFocused;
        if (isViewingAndFocused) {
          await supabase.rpc("mark_conversation_read", { _conversation_id: msg.conversation_id });
          lastReadByConvRef.current.set(msg.conversation_id, new Date().toISOString());
          return;
        }

        const notificationPrefs = getNotificationPreferences();

        if (notificationPrefs.messageSoundEnabled) {
          playSound("message", { force: true });
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", msg.sender_id)
          .maybeSingle();

        // Conversation metadata so the server-sidebar pill can show the GROUP
        // icon instead of the sender's avatar when this is a group chat.
        const { data: conv } = await supabase
          .from("conversations")
          .select("is_group, name, picture_url")
          .eq("id", msg.conversation_id)
          .maybeSingle();

        const senderName = profile?.display_name || "Someone";
        const preview = (msg.content || "")
          .replace(/\[attachments\].*?\[\/attachments\]/s, "📎 Attachment")
          .trim()
          .slice(0, 140);
        notify({
          title: conv?.is_group ? `${senderName} • ${conv.name || "Group"}` : senderName,
          body: notificationPrefs.showMessagePreview
            ? preview || "Sent you a message"
            : "Sent you a message",
          icon: profile?.avatar_url || "/favicon.ico",
          tag: `dm:${msg.conversation_id}`,
          force: true,
          onClick: () => {
            const path = `/@me/chat/${msg.conversation_id}`;
            if (window.location.hash) {
              window.location.hash = path;
            } else {
              window.history.pushState({}, "", path);
              window.dispatchEvent(new PopStateEvent("popstate"));
            }
          },
        });

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
            // Always trust freshly-fetched conv metadata so the server-sidebar
            // pill shows the GROUP icon (not the sender's pfp) for group chats.
            isGroup: conv?.is_group ?? existing?.isGroup,
            groupName: conv?.name ?? existing?.groupName ?? null,
            groupPictureUrl: conv?.picture_url ?? existing?.groupPictureUrl ?? null,
          });
          return next;
        });
      }
    );
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` },
      () => {
        fetchUnread();
      }
    );
    channel.subscribe();

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
