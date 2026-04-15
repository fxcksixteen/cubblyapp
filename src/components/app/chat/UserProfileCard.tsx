import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileColor } from "@/lib/profileColors";
import { toast } from "sonner";
import { UserPlus, UserMinus, Ban, X } from "lucide-react";
import messagesIcon from "@/assets/icons/messages.svg";

interface UserProfileCardProps {
  userId: string;
  displayName: string;
  position: { x: number; y: number };
  onClose: () => void;
  onSendMessage?: (userId: string) => void;
}

interface ProfileData {
  avatar_url: string | null;
  username: string;
  bio: string | null;
}

const UserProfileCard = ({ userId, displayName, position, onClose, onSendMessage }: UserProfileCardProps) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [friendshipStatus, setFriendshipStatus] = useState<string | null>(null);
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [showFullProfile, setShowFullProfile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const color = getProfileColor(userId);
  const isOwnProfile = userId === user?.id;

  useEffect(() => {
    supabase
      .from("profiles")
      .select("avatar_url, username, bio")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data);
      });

    if (user && userId !== user.id) {
      supabase
        .from("friendships")
        .select("id, status")
        .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setFriendshipStatus(data.status);
            setFriendshipId(data.id);
          }
        });
    }
  }, [userId, user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const handleAddFriend = async () => {
    if (!user) return;
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: userId,
      status: "pending",
    });
    if (error) {
      if (error.code === "23505") toast.error("Request already sent");
      else toast.error("Failed to send request");
    } else {
      setFriendshipStatus("pending");
      toast.success("Friend request sent!");
    }
  };

  const handleRemoveFriend = async () => {
    if (!friendshipId) return;
    await supabase.from("friendships").delete().eq("id", friendshipId);
    setFriendshipStatus(null);
    setFriendshipId(null);
    toast.success("Friend removed");
  };

  const handleBlock = async () => {
    if (!user) return;
    if (friendshipId) {
      await supabase.from("friendships").update({ status: "blocked" }).eq("id", friendshipId);
    } else {
      await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: userId, status: "blocked" });
    }
    setFriendshipStatus("blocked");
    toast.success("User blocked");
  };

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 340),
    top: Math.min(position.y, window.innerHeight - 400),
    zIndex: 60,
  };

  // Full profile popup
  if (showFullProfile) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60" onClick={onClose}>
        <div
          ref={ref}
          onClick={(e) => e.stopPropagation()}
          className="w-[440px] rounded-2xl overflow-hidden shadow-2xl border border-[#2b2d31] bg-[#111214] animate-in fade-in-0 zoom-in-95 duration-200"
        >
          {/* Banner */}
          <div className="h-[100px] relative" style={{ background: color.banner }}>
            <button onClick={onClose} className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Avatar */}
          <div className="px-5 -mt-10">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="h-[80px] w-[80px] rounded-full border-[6px] border-[#111214] object-cover" />
            ) : (
              <div className="flex h-[80px] w-[80px] items-center justify-center rounded-full border-[6px] border-[#111214] text-2xl font-bold text-white" style={{ backgroundColor: color.bg }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="px-5 pt-3 pb-4">
            <p className="text-xl font-bold text-white">{displayName}</p>
            <p className="text-sm text-[#949ba4]">@{profile?.username || displayName.toLowerCase()}</p>

            {profile?.bio && (
              <div className="mt-3 rounded-lg bg-[#1e1f22] p-3">
                <p className="text-xs font-semibold text-[#949ba4] uppercase tracking-wide mb-1">About Me</p>
                <p className="text-sm text-[#dbdee1] leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {/* Actions */}
            {!isOwnProfile && (
              <div className="mt-4 flex items-center gap-2">
                {onSendMessage && (
                  <button
                    onClick={() => onSendMessage(userId)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-white bg-[#5865f2] hover:bg-[#4752c4] transition-colors"
                  >
                    <img src={messagesIcon} alt="" className="h-4 w-4 invert" />
                    Send Message
                  </button>
                )}
                {friendshipStatus === "accepted" ? (
                  <button onClick={handleRemoveFriend} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-[#ed4245]/20 text-[#949ba4] hover:text-[#ed4245] transition-colors" title="Remove Friend">
                    <UserMinus className="h-4 w-4" />
                  </button>
                ) : friendshipStatus === "pending" ? (
                  <button disabled className="flex h-10 px-4 items-center justify-center rounded-full bg-white/5 text-[#949ba4] text-sm cursor-default">
                    Pending
                  </button>
                ) : friendshipStatus !== "blocked" ? (
                  <button onClick={handleAddFriend} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3ba55c] hover:bg-[#2d8b4e] text-white transition-colors" title="Add Friend">
                    <UserPlus className="h-4 w-4" />
                  </button>
                ) : null}
                {friendshipStatus !== "blocked" && (
                  <button onClick={handleBlock} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-[#ed4245]/20 text-[#949ba4] hover:text-[#ed4245] transition-colors" title="Block">
                    <Ban className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Mini profile card
  return (
    <div ref={ref} style={style} className="w-[300px] rounded-xl overflow-hidden shadow-2xl border border-[#2b2d31] bg-[#111214] animate-in fade-in-0 zoom-in-95 duration-150">
      {/* Banner */}
      <div className="h-[60px]" style={{ background: color.banner }} />

      {/* Avatar - clickable to open full profile */}
      <div className="px-4 -mt-6">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="h-[52px] w-[52px] rounded-full border-[4px] border-[#111214] object-cover cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setShowFullProfile(true)}
          />
        ) : (
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[4px] border-[#111214] text-lg font-bold text-white cursor-pointer hover:opacity-80 transition-opacity"
            style={{ backgroundColor: color.bg }}
            onClick={() => setShowFullProfile(true)}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="px-4 pt-1.5 pb-2">
        <p className="text-lg font-bold text-white">{displayName}</p>
        <p className="text-sm text-[#949ba4]">@{profile?.username || displayName.toLowerCase()}</p>
        {profile?.bio && (
          <p className="mt-2 text-xs text-[#dbdee1] leading-relaxed line-clamp-3">{profile.bio}</p>
        )}
      </div>

      {/* Actions */}
      {!isOwnProfile && (
        <div className="px-4 pb-3 flex items-center gap-2">
          {onSendMessage && (
            <button
              onClick={() => onSendMessage(userId)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-white bg-[#5865f2] hover:bg-[#4752c4] transition-colors"
            >
              <img src={messagesIcon} alt="" className="h-4 w-4 invert" />
              Send Message
            </button>
          )}
          {friendshipStatus === "accepted" ? (
            <button onClick={handleRemoveFriend} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-[#ed4245]/20 text-[#949ba4] hover:text-[#ed4245] transition-colors" title="Remove Friend">
              <UserMinus className="h-3.5 w-3.5" />
            </button>
          ) : friendshipStatus === "pending" ? (
            <span className="text-xs text-[#949ba4]">Pending</span>
          ) : friendshipStatus !== "blocked" ? (
            <button onClick={handleAddFriend} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#3ba55c] hover:bg-[#2d8b4e] text-white transition-colors" title="Add Friend">
              <UserPlus className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default UserProfileCard;