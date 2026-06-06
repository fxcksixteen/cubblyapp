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

    // 6) Fetch last message for each conversation. v0.3.12: a single batched
    //    `limit(N)` query was dropping older friends' last-messages out of the
    //    window whenever any other conversation had a burst of recent activity
    //    — which made those friends silently disappear from the sidebar. Per-
    //    conversation parallel queries (N is small — typical user has <30 DMs)
    //    are bulletproof and only a few ms slower.
    const lastMsgMap = new Map<string, { content: string; created_at: string }>();
    if (conversationIds.length > 0) {
      const results = await Promise.all(
        conversationIds.map((cid) =>
          supabase
            .from("messages")
            .select("content, created_at")
            .eq("conversation_id", cid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
      );
      results.forEach((r, i) => {
        if (r.data) lastMsgMap.set(conversationIds[i], { content: r.data.content, created_at: r.data.created_at });
      });
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

    // Debounce full refetches so bursts of realtime events (e.g. a friend
    // toggling status, multiple messages arriving) only trigger one refetch.
    let refetchTimer: number | null = null;
    const scheduleRefetch = () => {
      if (refetchTimer != null) return;
      refetchTimer = window.setTimeout(() => {
        refetchTimer = null;
        fetchRef.current();
      }, 600);
    };

    const uniqueSuffix =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`conversation-updates:${user.id}:${uniqueSuffix}`);

    // Only react to participant changes that involve *us* (joining/leaving
    // conversations). Everyone else's membership churn is irrelevant here.
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "conversation_participants", filter: `user_id=eq.${user.id}` },
      () => scheduleRefetch(),
    );
    // Live conversation metadata changes (rename, picture change, etc.)
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "conversations" },
      (payload) => {
        const updated = payload.new as any;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === updated.id);
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            name: updated.name,
            picture_url: updated.picture_url,
          };
          return next;
        });
      },
    );
    // Live message inserts — just patch the local row, no refetch.
    channel.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const newMsg = payload.new as any;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === newMsg.conversation_id);
          if (idx === -1) {
            // New conversation we don't have yet — debounced refetch will pick it up.
            scheduleRefetch();
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
    // NOTE: message UPDATE/DELETE and profile UPDATE used to trigger a full
    // refetch here. They don't anymore — message edits/deletes don't change
    // the sidebar preview enough to be worth the cost, and profile updates
    // (status changes from anyone in the DB) were causing constant refetches.
    channel.subscribe();

    return () => {
      if (refetchTimer != null) window.clearTimeout(refetchTimer);
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
