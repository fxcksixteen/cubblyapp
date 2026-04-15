import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getProfileColor } from "@/lib/profileColors";
import messagesIcon from "@/assets/icons/messages.svg";

interface UserProfileCardProps {
  userId: string;
  displayName: string;
  position: { x: number; y: number };
  onClose: () => void;
  onSendMessage?: (userId: string) => void;
}

const UserProfileCard = ({ userId, displayName, position, onClose, onSendMessage }: UserProfileCardProps) => {
  const [profile, setProfile] = useState<{
    avatar_url: string | null;
    username: string;
    bio: string | null;
    banner_url?: string | null;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const color = getProfileColor(userId);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("avatar_url, username, bio")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [userId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Position card so it doesn't overflow viewport
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(position.x, window.innerWidth - 320),
    top: Math.min(position.y, window.innerHeight - 300),
    zIndex: 60,
  };

  return (
    <div ref={ref} style={style} className="w-[300px] rounded-xl overflow-hidden shadow-2xl border border-[#2b2d31] bg-[#111214] animate-in fade-in-0 zoom-in-95 duration-150">
      {/* Banner */}
      <div className="h-[60px]" style={{ background: color.banner }} />

      {/* Avatar */}
      <div className="px-4 -mt-6">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="h-[52px] w-[52px] rounded-full border-[4px] border-[#111214] object-cover"
          />
        ) : (
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[4px] border-[#111214] text-lg font-bold text-white"
            style={{ backgroundColor: color.bg }}
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

      {/* Send Message Button */}
      {onSendMessage && (
        <div className="px-4 pb-3">
          <button
            onClick={() => onSendMessage(userId)}
            className="flex w-full items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "#5865f2" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#4752c4")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#5865f2")}
          >
            <img src={messagesIcon} alt="" className="h-4 w-4 invert" />
            Send Message
          </button>
        </div>
      )}
    </div>
  );
};

export default UserProfileCard;
