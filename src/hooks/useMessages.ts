import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

export type MessageStatus = "sending" | "sent" | "delivered";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", senderIds);

      if (profilesError) {
        console.error("Failed to fetch sender profiles:", profilesError);
      }

      const nameMap = new Map((profiles || []).map((profile) => [profile.user_id, profile.display_name]));
      const avatarMap = new Map((profiles || []).map((profile) => [profile.user_id, profile.avatar_url]));

      setMessages(
        data.map((message) => ({
          ...message,
          sender_name: getSenderName(message.sender_id, nameMap.get(message.sender_id)),
          sender_avatar_url: avatarMap.get(message.sender_id) || null,
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
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("user_id", newMessage.sender_id)
              .maybeSingle();

            if (profileError) {
              console.error("Failed to fetch realtime sender profile:", profileError);
            }

            setMessages((previous) => {
              const optimisticIndex = previous.findIndex(
                (message) =>
                  message.id.startsWith("temp-") &&
                  message.content === newMessage.content &&
                  message.sender_id === newMessage.sender_id,
              );

              if (optimisticIndex >= 0) {
                const updated = [...previous];
                updated[optimisticIndex] = {
                  ...newMessage,
                  sender_name: getSenderName(newMessage.sender_id, profile?.display_name),
                  sender_avatar_url: profile?.avatar_url || null,
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

  const sendMessage = async (content: string) => {
    if (!user || !conversationId || !content.trim()) return false;

    const trimmedContent = content.trim();
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: trimmedContent,
      created_at: new Date().toISOString(),
      sender_name: user.user_metadata?.display_name || user.email?.split("@")[0] || "Unknown",
      status: "sending",
    };

    setMessages((previous) => [...previous, optimistic]);

    const { data: insertedMessage, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: trimmedContent,
      })
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
