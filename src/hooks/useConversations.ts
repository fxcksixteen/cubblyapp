import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Conversation {
  id: string;
  participant: {
    user_id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    status: string;
  };
  lastMessage?: string;
  lastMessageAt?: string;
}

export function useConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Get all conversations user is in
    const { data: myParticipations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!myParticipations || myParticipations.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = myParticipations.map(p => p.conversation_id);

    // Get other participants
    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convIds)
      .neq("user_id", user.id);

    if (!allParticipants || allParticipants.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const otherUserIds = [...new Set(allParticipants.map(p => p.user_id))];

    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("user_id", otherUserIds);

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    // Get last message for each conversation
    const convList: Conversation[] = [];
    for (const part of allParticipants) {
      const profile = profileMap.get(part.user_id);
      if (!profile) continue;

      const { data: lastMsg } = await supabase
        .from("messages")
        .select("content, created_at")
        .eq("conversation_id", part.conversation_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      convList.push({
        id: part.conversation_id,
        participant: {
          user_id: profile.user_id,
          display_name: profile.display_name,
          username: profile.username,
          avatar_url: profile.avatar_url,
          status: profile.status,
        },
        lastMessage: lastMsg?.content,
        lastMessageAt: lastMsg?.created_at,
      });
    }

    convList.sort((a, b) => {
      const aTime = a.lastMessageAt || "";
      const bTime = b.lastMessageAt || "";
      return bTime.localeCompare(aTime);
    });

    setConversations(convList);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const openOrCreateConversation = async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;

    const { data, error } = await supabase.rpc("create_dm_conversation", {
      other_user_id: otherUserId,
    });

    if (error || !data) return null;

    await fetchConversations();
    return data as string;
  };

  const closeConversation = (convId: string) => {
    setConversations(prev => prev.filter(c => c.id !== convId));
  };

  return { conversations, loading, openOrCreateConversation, closeConversation, refetch: fetchConversations };
}
