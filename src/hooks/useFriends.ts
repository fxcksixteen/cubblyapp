import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface FriendProfile {
  id: string;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  status: string;
}

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  profile: FriendProfile;
}

export function useFriends() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pending, setPending] = useState<Friendship[]>([]);
  const [blocked, setBlocked] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFriends = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: friendships } = await supabase
      .from("friendships")
      .select("*")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

    if (!friendships) { setLoading(false); return; }

    const otherUserIds = friendships.map(f =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    );

    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .in("user_id", otherUserIds.length > 0 ? otherUserIds : ["none"]);

    const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

    const enriched = friendships.map(f => {
      const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id;
      return { ...f, profile: profileMap.get(otherId) as FriendProfile };
    }).filter(f => f.profile);

    setFriends(enriched.filter(f => f.status === "accepted"));
    setPending(enriched.filter(f => f.status === "pending"));
    setBlocked(enriched.filter(f => f.status === "blocked"));
    setLoading(false);
  }, [user]);

  const fetchRef = useRef(fetchFriends);
  fetchRef.current = fetchFriends;

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  // Realtime subscription for live friend list updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel(`friendships-realtime:${user.id}`);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "friendships" },
      () => fetchRef.current(),
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const sendFriendRequest = async (username: string) => {
    if (!user) return { error: "Not authenticated" };

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("username", username.trim())
      .maybeSingle();

    if (!targetProfile) return { error: "No user found with that username." };
    if (targetProfile.user_id === user.id) return { error: "You can't add yourself!" };

    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: targetProfile.user_id,
      status: "pending",
    });

    if (error) {
      if (error.code === "23505") return { error: "Friend request already sent." };
      return { error: error.message };
    }

    await fetchFriends();
    return { error: null };
  };

  const acceptRequest = async (friendshipId: string) => {
    await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId);
    await fetchFriends();
  };

  const declineRequest = async (friendshipId: string) => {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    await fetchFriends();
  };

  const blockUser = async (friendshipId: string) => {
    await supabase.from("friendships").update({ status: "blocked" }).eq("id", friendshipId);
    await fetchFriends();
  };

  const unblockUser = async (friendshipId: string) => {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    await fetchFriends();
  };

  const removeFriend = async (friendshipId: string) => {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    await fetchFriends();
  };

  return { friends, pending, blocked, loading, sendFriendRequest, acceptRequest, declineRequest, blockUser, unblockUser, removeFriend, refetch: fetchFriends };
}
