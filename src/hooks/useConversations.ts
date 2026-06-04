import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface ConversationParticipantProfile {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  status: string;
}

export interface Conversation {
  id: string;
  is_group: boolean;
  /** Group name (null for DMs) */
  name: string | null;
  /** Group picture URL (null for DMs) */
  picture_url: string | null;
  /** Group owner (null for DMs) */
  owner_id: string | null;
  /** For DMs: the OTHER user. For groups: a representative member (first one) — UI should prefer `members` for groups. */
  participant: ConversationParticipantProfile;
  /** All other participants in the conversation (excludes the current user). For DMs this is length 1. */
  members: ConversationParticipantProfile[];
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

    // 1) Get all conversations the current user participates in
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

    const conversationIds = myParticipations.map((p) => p.conversation_id);

    // 2) Fetch conversation rows (group metadata)
    const { data: convRows, error: convRowsError } = await supabase
      .from("conversations")
      .select("id, is_group, name, picture_url, owner_id")
      .in("id", conversationIds);

    if (convRowsError) {
      console.error("Failed to fetch conversation rows:", convRowsError);
      setConversations([]);
      setLoading(false);
      return;
    }

    const convMap = new Map((convRows || []).map((c) => [c.id, c]));

    // 3) Fetch ALL participants of those conversations (including self — we filter later)
    const { data: allParticipants, error: participantsError } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", conversationIds);

    if (participantsError) {
      console.error("Failed to fetch conversation participants:", participantsError);
      setConversations([]);
      setLoading(false);
      return;
    }

    const otherUserIds = [
      ...new Set((allParticipants || []).map((p) => p.user_id).filter((id) => id !== user.id)),
    ];

    // 4) Fetch profiles for the other users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("user_id", otherUserIds.length > 0 ? otherUserIds : ["00000000-0000-0000-0000-000000000000"]);

    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    // 5) Build per-conversation member lists
    const membersByConv = new Map<string, ConversationParticipantProfile[]>();
    for (const part of allParticipants || []) {
      if (part.user_id === user.id) continue;
      const profile = profileMap.get(part.user_id);
      if (!profile) continue;
      const arr = membersByConv.get(part.conversation_id) ?? [];
      arr.push({
        user_id: profile.user_id,
        display_name: profile.display_name,
        username: profile.username,
        avatar_url: profile.avatar_url,
        status: profile.status,
      });
      membersByConv.set(part.conversation_id, arr);
    }

    // 6) Fetch last message for ALL conversations in a SINGLE batched query
    //    (previously did N parallel queries — one per conversation — which
    //    hammered both the DB and the client every time a profile status or
    //    any message changed).
    const lastMsgMap = new Map<string, { content: string; created_at: string }>();
    if (conversationIds.length > 0) {
      const { data: recentMsgs } = await supabase
        .from("messages")
        .select("conversation_id, content, created_at")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(200, conversationIds.length * 3));
      for (const m of recentMsgs || []) {
        if (!lastMsgMap.has(m.conversation_id)) {
          lastMsgMap.set(m.conversation_id, { content: m.content, created_at: m.created_at });
        }
      }
    }

    const conversationsList = conversationIds
      .map((convId) => {
        const conv = convMap.get(convId);
        if (!conv) return null;
        const members = membersByConv.get(convId) ?? [];

        // For DMs we MUST have at least one other member; for groups it's allowed to have zero (e.g. they all left)
        if (!conv.is_group && members.length === 0) return null;

        const lastMessage = lastMsgMap.get(convId);
        const participant: ConversationParticipantProfile =
          members[0] ?? {
            user_id: conv.id,
            display_name: conv.name || "Group",
            username: "",
            avatar_url: conv.picture_url,
            status: "online",
          };

        return {
          id: convId,
          is_group: conv.is_group,
          name: conv.name,
          picture_url: conv.picture_url,
          owner_id: conv.owner_id,
          participant,
          members,
          lastMessage: lastMessage?.content,
          lastMessageAt: lastMessage?.created_at,
        } satisfies Conversation;
      })
      .filter(Boolean) as Conversation[];

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
    // Live conversation metadata changes (rename, picture change, etc.)
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversations" },
      () => fetchRef.current(),
    );
    // Live message updates — re-sort conversations when new messages arrive
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const newMsg = payload.new as any;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === newMsg.conversation_id);
          if (idx === -1) {
            fetchRef.current();
            return prev;
          }
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lastMessage: newMsg.content,
            lastMessageAt: newMsg.created_at,
          };
          updated.sort((a, b) => {
            const aTime = a.lastMessageAt || "";
            const bTime = b.lastMessageAt || "";
            return bTime.localeCompare(aTime);
          });
          return updated;
        });
      },
    );
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

  const createGroupConversation = async (memberIds: string[], name: string): Promise<string | null> => {
    if (!user) return null;
    const { data, error } = await supabase.rpc("create_group_conversation", {
      _member_ids: memberIds,
      _name: name,
    });
    if (error || !data) {
      console.error("Failed to create group conversation:", error);
      return null;
    }
    await fetchConversations();
    return data as string;
  };

  const closeConversation = (convId: string) => {
    setConversations((previous) => previous.filter((conversation) => conversation.id !== convId));
  };

  return {
    conversations,
    loading,
    openOrCreateConversation,
    createGroupConversation,
    closeConversation,
    refetch: fetchConversations,
  };
}
