import { useState, useEffect, useCallback, useRef } from "react";
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
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: myParticipations, error: myParticipationsError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (myParticipationsError) {
      console.error("Failed to fetch user conversations:", myParticipationsError);
      setConversations([]);
      setLoading(false);
      return;
    }

    if (!myParticipations || myParticipations.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const conversationIds = myParticipations.map((participation) => participation.conversation_id);

    const { data: allParticipants, error: participantsError } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", conversationIds)
      .neq("user_id", user.id);

    if (participantsError) {
      console.error("Failed to fetch conversation participants:", participantsError);
      setConversations([]);
      setLoading(false);
      return;
    }

    if (!allParticipants || allParticipants.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const otherUserIds = [...new Set(allParticipants.map((participant) => participant.user_id))];
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .in("user_id", otherUserIds);

    if (profilesError) {
      console.error("Failed to fetch DM profiles:", profilesError);
    }

    const profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));

    const conversationsList = (
      await Promise.all(
        allParticipants.map(async (participant) => {
          const profile = profileMap.get(participant.user_id);
          if (!profile) return null;

          const { data: lastMessage, error: lastMessageError } = await supabase
            .from("messages")
            .select("content, created_at")
            .eq("conversation_id", participant.conversation_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (lastMessageError) {
            console.error(`Failed to fetch last message for conversation ${participant.conversation_id}:`, lastMessageError);
          }

          return {
            id: participant.conversation_id,
            participant: {
              user_id: profile.user_id,
              display_name: profile.display_name,
              username: profile.username,
              avatar_url: profile.avatar_url,
              status: profile.status,
            },
            lastMessage: lastMessage?.content,
            lastMessageAt: lastMessage?.created_at,
          } satisfies Conversation;
        }),
      )
    ).filter(Boolean) as Conversation[];

    conversationsList.sort((a, b) => {
      const aTime = a.lastMessageAt || "";
      const bTime = b.lastMessageAt || "";
      return bTime.localeCompare(aTime);
    });

    setConversations(conversationsList);
    setLoading(false);
  }, [user]);

  const fetchRef = useRef(fetchConversations);
  fetchRef.current = fetchConversations;

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    if (!user) return;

    const uniqueSuffix =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`conversation-updates:${user.id}:${uniqueSuffix}`);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversation_participants" },
      () => fetchRef.current(),
    );
    // Live message updates — re-sort conversations when new messages arrive
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const newMsg = payload.new as any;
        // Optimistically update the conversation with the new message
        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === newMsg.conversation_id);
          if (idx === -1) {
            // New conversation we don't know about yet — full refetch
            fetchRef.current();
            return prev;
          }
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lastMessage: newMsg.content,
            lastMessageAt: newMsg.created_at,
          };
          // Re-sort by latest message
          updated.sort((a, b) => {
            const aTime = a.lastMessageAt || "";
            const bTime = b.lastMessageAt || "";
            return bTime.localeCompare(aTime);
          });
          return updated;
        });
      },
    );
    // Also handle other message events (delete, update) with full refetch
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages" },
      () => fetchRef.current(),
    );
    channel.on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages" },
      () => fetchRef.current(),
    );
    // Live profile updates (avatar, status, display name changes)
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "profiles" },
      () => fetchRef.current(),
    );
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const openOrCreateConversation = async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;

    const { data, error } = await supabase.rpc("create_dm_conversation", {
      other_user_id: otherUserId,
    });

    if (error || !data) {
      console.error("Failed to open or create conversation:", error);
      return null;
    }

    await fetchConversations();
    return data as string;
  };

  const closeConversation = (convId: string) => {
    setConversations((previous) => previous.filter((conversation) => conversation.id !== convId));
  };

  return { conversations, loading, openOrCreateConversation, closeConversation, refetch: fetchConversations };
}
