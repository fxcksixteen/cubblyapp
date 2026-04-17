import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

export type MessageStatus = "sending" | "sent" | "delivered";

export interface ReplyPreview {
  id: string;
  sender_id: string;
  sender_name: string;
  content: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  reply_to_id?: string | null;
  reply_to?: ReplyPreview | null;
  sender_name?: string;
  sender_avatar_url?: string | null;
  status?: MessageStatus;
}

const getSenderName = (senderId: string, displayName?: string | null) => {
  if (senderId === BOT_USER_ID) return "CubblyBot";
  return displayName || "Unknown";
};

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!user) {
      setCurrentUserAvatarUrl(null);
      return;
    }

    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to fetch current user avatar:", error);
          return;
        }

        setCurrentUserAvatarUrl(data?.avatar_url || null);
      });
  }, [user]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    setLoading(true);

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch messages:", error);
      setMessages([]);
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      const senderIds = [...new Set(data.map((message) => message.sender_id))];
      const replyIds = [...new Set(data.map((m: any) => m.reply_to_id).filter(Boolean))] as string[];

      const [{ data: profiles }, { data: replyRows }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, avatar_url").in("user_id", senderIds),
        replyIds.length
          ? supabase.from("messages").select("id, sender_id, content").in("id", replyIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.display_name]));
      const avatarMap = new Map((profiles || []).map((p) => [p.user_id, p.avatar_url]));
      const replyMap = new Map<string, ReplyPreview>();
      (replyRows || []).forEach((r: any) => {
        replyMap.set(r.id, {
          id: r.id,
          sender_id: r.sender_id,
          sender_name: getSenderName(r.sender_id, nameMap.get(r.sender_id)),
          content: r.content,
        });
      });

      setMessages(
        data.map((message: any) => ({
          ...message,
          sender_name: getSenderName(message.sender_id, nameMap.get(message.sender_id)),
          sender_avatar_url: avatarMap.get(message.sender_id) || null,
          reply_to: message.reply_to_id ? replyMap.get(message.reply_to_id) || null : null,
          status: "delivered" as MessageStatus,
        })),
      );
    } else {
      setMessages([]);
    }

    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();

    if (conversationId) {
      channelRef.current = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          async (payload) => {
            const newMessage = payload.new as Message;

            // Fetch sender profile + reply_to in parallel so the realtime
            // INSERT doesn't blow away the optimistic message's reply preview.
            const [{ data: profile, error: profileError }, replyResult] = await Promise.all([
              supabase
                .from("profiles")
                .select("display_name, avatar_url")
                .eq("user_id", newMessage.sender_id)
                .maybeSingle(),
              newMessage.reply_to_id
                ? supabase
                    .from("messages")
                    .select("id, sender_id, content")
                    .eq("id", newMessage.reply_to_id)
                    .maybeSingle()
                : Promise.resolve({ data: null as any }),
            ]);

            if (profileError) {
              console.error("Failed to fetch realtime sender profile:", profileError);
            }

            // Build reply_to preview if this message is a reply
            let replyPreview: ReplyPreview | null = null;
            if (newMessage.reply_to_id && replyResult.data) {
              const r = replyResult.data as any;
              // Need the replied-to sender's display name too — try cache via profile fetch above
              let replySenderName: string | undefined;
              if (r.sender_id === newMessage.sender_id) {
                replySenderName = profile?.display_name || undefined;
              } else {
                const { data: replySenderProfile } = await supabase
                  .from("profiles")
                  .select("display_name")
                  .eq("user_id", r.sender_id)
                  .maybeSingle();
                replySenderName = replySenderProfile?.display_name || undefined;
              }
              replyPreview = {
                id: r.id,
                sender_id: r.sender_id,
                sender_name: getSenderName(r.sender_id, replySenderName),
                content: r.content,
              };
            }

            setMessages((previous) => {
              const optimisticIndex = previous.findIndex(
                (message) =>
                  message.id.startsWith("temp-") &&
                  message.content === newMessage.content &&
                  message.sender_id === newMessage.sender_id,
              );

              if (optimisticIndex >= 0) {
                const optimistic = previous[optimisticIndex];
                const updated = [...previous];
                updated[optimisticIndex] = {
                  ...newMessage,
                  sender_name: getSenderName(newMessage.sender_id, profile?.display_name),
                  sender_avatar_url: profile?.avatar_url || null,
                  // Prefer freshly fetched reply preview, fall back to optimistic one
                  reply_to: replyPreview || optimistic.reply_to || null,
                  status: "delivered",
                };
                return updated;
              }

              const existingIndex = previous.findIndex((message) => message.id === newMessage.id);
              if (existingIndex >= 0) {
                const updated = [...previous];
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  ...newMessage,
                  sender_name: getSenderName(newMessage.sender_id, profile?.display_name ?? updated[existingIndex].sender_name),
                  sender_avatar_url: profile?.avatar_url ?? updated[existingIndex].sender_avatar_url ?? null,
                  reply_to: replyPreview || updated[existingIndex].reply_to || null,
                  status: "delivered",
                };
                return updated;
              }

              return [
                ...previous,
                {
                  ...newMessage,
                  sender_name: getSenderName(newMessage.sender_id, profile?.display_name),
                  sender_avatar_url: profile?.avatar_url || null,
                  reply_to: replyPreview,
                  status: "delivered",
                },
              ];
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const deletedId = (payload.old as any)?.id;
            if (deletedId) {
              setMessages((prev) => prev.filter((m) => m.id !== deletedId));
            }
          },
        )
        .subscribe();
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, fetchMessages]);

  const sendMessage = async (content: string, replyToId?: string | null) => {
    if (!user || !conversationId || !content.trim()) return false;

    const trimmedContent = content.trim();
    const tempId = `temp-${Date.now()}`;
    const replyPreview: ReplyPreview | null = replyToId
      ? (() => {
          const m = messages.find((mm) => mm.id === replyToId);
          if (!m) return null;
          return { id: m.id, sender_id: m.sender_id, sender_name: m.sender_name || "Unknown", content: m.content };
        })()
      : null;

    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmedContent,
      created_at: new Date().toISOString(),
      sender_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "Unknown",
      sender_avatar_url: currentUserAvatarUrl,
      reply_to_id: replyToId || null,
      reply_to: replyPreview,
      status: "sending",
    };

    setMessages((previous) => [...previous, optimistic]);

    const insertPayload: any = {
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmedContent,
    };
    if (replyToId) insertPayload.reply_to_id = replyToId;

    const { data: insertedMessage, error } = await supabase
      .from("messages")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !insertedMessage) {
      console.error("Failed to send message:", error);
      setMessages((previous) => previous.filter((message) => message.id !== tempId));
      return false;
    }

    setMessages((previous) =>
      previous.map((message) =>
        message.id === tempId
          ? {
              ...(insertedMessage as Message),
              sender_name: optimistic.sender_name,
              sender_avatar_url: optimistic.sender_avatar_url,
              reply_to: optimistic.reply_to,
              status: "sent" as MessageStatus,
            }
          : message,
      ),
    );

    const { data: participants, error: participantsError } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    if (participantsError) {
      console.error("Failed to load conversation participants:", participantsError);
      return true;
    }

    const isBotConversation = participants?.some((participant) => participant.user_id === BOT_USER_ID);

    if (isBotConversation) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-bot`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ conversation_id: conversationId, user_message: trimmedContent }),
        });
        if (!res.ok) {
          console.error("Bot reply failed:", await res.text());
        }
      } catch (e) {
        console.error("Failed to get bot reply:", e);
      }
    }

    return true;
  };

  return { messages, loading, sendMessage };
}
