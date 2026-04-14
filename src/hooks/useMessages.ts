import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

const botReplies = [
  "Hey there! 👋 How's it going?",
  "That's interesting! Tell me more.",
  "I'm just a bot, but I'm here to help you test! 🤖",
  "Nice message! Everything seems to be working great.",
  "Beep boop! Message received loud and clear! 📬",
  "Thanks for chatting with me! I'm CubblyBot, your friendly test companion.",
  "Wow, great conversation! Keep it coming! 😄",
  "I can confirm: your messages are being sent and delivered perfectly! ✅",
];

export type MessageStatus = "sending" | "sent" | "delivered";

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  status?: MessageStatus;
}

export function useMessages(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (data && data.length > 0) {
      const senderIds = [...new Set(data.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", senderIds);

      const nameMap = new Map((profiles || []).map(p => [p.user_id, p.display_name]));

      setMessages(data.map(m => ({
        ...m,
        sender_name: nameMap.get(m.sender_id) || "Unknown",
        status: "delivered" as MessageStatus,
      })));
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
            const newMsg = payload.new as Message;
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name")
              .eq("user_id", newMsg.sender_id)
              .maybeSingle();

            setMessages(prev => {
              // Update optimistic message to delivered, or add new
              const optimisticIdx = prev.findIndex(m => m.id.startsWith("temp-") && m.content === newMsg.content && m.sender_id === newMsg.sender_id);
              if (optimisticIdx >= 0) {
                const updated = [...prev];
                updated[optimisticIdx] = { ...newMsg, sender_name: profile?.display_name || "Unknown", status: "delivered" };
                return updated;
              }
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, { ...newMsg, sender_name: profile?.display_name || "Unknown", status: "delivered" }];
            });
          }
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
    if (!user || !conversationId || !content.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
      created_at: new Date().toISOString(),
      sender_name: user.user_metadata?.display_name || "You",
      status: "sending",
    };

    setMessages(prev => [...prev, optimistic]);

    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: content.trim(),
    });

    if (error) {
      // Remove failed message
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return;
    }

    // Mark as sent
    setMessages(prev =>
      prev.map(m => m.id === tempId ? { ...m, status: "sent" as MessageStatus } : m)
    );

    // Check if the conversation is with the bot — send auto-reply
    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);

    const isBotConversation = participants?.some(p => p.user_id === BOT_USER_ID);

    if (isBotConversation) {
      setTimeout(async () => {
        const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
        // Insert as bot using an edge function or direct insert (bot messages bypass RLS via the bot's "sender")
        // Since we can't insert as bot client-side, we'll simulate it locally
        const botMsg: Message = {
          id: `bot-${Date.now()}`,
          conversation_id: conversationId,
          sender_id: BOT_USER_ID,
          content: reply,
          created_at: new Date().toISOString(),
          sender_name: "CubblyBot",
          status: "delivered",
        };
        setMessages(prev => [...prev, botMsg]);
      }, 1000 + Math.random() * 2000);
    }
  };

  return { messages, loading, sendMessage };
}
