import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { Conversation } from "@/hooks/useConversations";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, ShoppingBag } from "lucide-react";
import { getProfileColor } from "@/lib/profileColors";
import ProfilePopup from "./ProfilePopup";
import SettingsModal from "./SettingsModal";
import SearchBar from "./SearchBar";
import friendsIcon from "@/assets/icons/friends.svg";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneIcon from "@/assets/icons/headphone.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";
import settingsIcon from "@/assets/icons/settings.svg";

// Preload all icon variants to prevent toggle lag
const preloadImages = [micIcon, micMuteIcon, headphoneIcon, headphoneDeafenIcon, settingsIcon, friendsIcon];
preloadImages.forEach(src => { const img = new Image(); img.src = src; });

interface DMSidebarProps {
  conversations: Conversation[];
  activeView: string;
  setActiveView: (view: string) => void;
  onCloseConversation: (convId: string) => void;
  onOpenDM: (userId: string) => void;
}

const statusColors: Record<string, string> = {
  online: "bg-[#3ba55c]",
  idle: "bg-[#faa61a]",
  dnd: "bg-[#ed4245]",
  invisible: "bg-[#747f8d]",
  offline: "bg-[#747f8d]",
};

const DMSidebar = ({ conversations, activeView, setActiveView, onCloseConversation, onOpenDM }: DMSidebarProps) => {
  const { user } = useAuth();
  const { activeCall, toggleMute, toggleDeafen } = useVoice();
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();

  // Local mute/deafen for when NOT in a call (pre-call preference)
  const [localMuted, setLocalMuted] = useState(false);
  const [localDeafened, setLocalDeafened] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userStatus, setUserStatus] = useState("online");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status) setUserStatus(data.status);
      });
  }, [user]);

  const navItems = [
    { id: "friends", icon: friendsIcon, label: "Friends", isSvg: true },
    { id: "shop", icon: ShoppingBag, label: "Shop", isSvg: false as const },
  ];

  return (
    <div className="flex w-60 flex-shrink-0 flex-col sidebar-primary" style={{ backgroundColor: 'var(--app-bg-secondary)' }}>
      {/* Search bar */}
      <SearchBar onOpenDM={onOpenDM} />

      <div className="flex-1 overflow-y-auto px-2 pt-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-[15px] font-medium transition-colors cubbly-3d-nav ${
              activeView === item.id
                ? "bg-[#404249] text-white"
                : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
            }`}
          >
            {item.isSvg ? (
              <img src={item.icon as string} alt="" className="h-5 w-5 shrink-0 invert opacity-80" />
            ) : (
              <item.icon className="h-5 w-5 shrink-0" />
            )}
            {item.label}
          </button>
        ))}

        {/* DM header */}
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">
            Direct Messages
          </span>
          <Plus className="h-4 w-4 cursor-pointer text-[#949ba4] hover:text-[#dbdee1]" />
        </div>

        {/* DM list */}
        <div className="mt-1 flex flex-col gap-0.5">
          {conversations.map((conv) => {
            const color = getProfileColor(conv.participant.user_id);
            return (
              <button
                key={conv.id}
                onClick={() => setActiveView(`dm:${conv.id}`)}
                className={`group flex w-full items-center gap-3 rounded-[4px] px-2 py-1.5 transition-colors cubbly-3d-nav ${
                  activeView === `dm:${conv.id}`
                    ? "bg-[#404249] text-white"
                    : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
                }`}
              >
                <div className="relative">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: color.bg }}
                  >
                    {conv.participant.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-[#2b2d31] ${statusColors[conv.participant.status]}`} />
                </div>
                <span className="truncate text-sm font-medium">{conv.participant.display_name}</span>
                <X
                  onClick={(e) => { e.stopPropagation(); onCloseConversation(conv.id); }}
                  className="ml-auto h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-[#dbdee1]"
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* User panel */}
      <div className="flex items-center gap-2.5 px-2 py-2 user-panel" style={{ backgroundColor: 'var(--app-bg-accent)' }}>
        <ProfilePopup
          currentStatus={userStatus}
          onStatusChange={setUserStatus}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 overflow-hidden min-w-0">
          <p className="truncate text-[15px] font-bold text-white leading-snug">{displayName}</p>
          <p className="truncate text-[11px] text-[#949ba4] leading-snug">{username}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setMuted(!muted)}
            className={`rounded p-1.5 transition-colors ${muted ? "bg-[#ed4245]/20" : "hover:bg-[#35373c]"}`}
            title={muted ? "Unmute" : "Mute"}
          >
            <img
              src={muted ? micMuteIcon : micIcon}
              alt={muted ? "Muted" : "Microphone"}
              className={`h-[18px] w-[18px] transition-opacity ${muted ? "opacity-100" : "invert opacity-70 hover:opacity-100"}`}
              style={muted ? { filter: "invert(36%) sepia(93%) saturate(7471%) hue-rotate(348deg) brightness(101%) contrast(88%)" } : undefined}
            />
          </button>
          <button
            onClick={() => setDeafened(!deafened)}
            className={`rounded p-1.5 transition-colors ${deafened ? "bg-[#ed4245]/20" : "hover:bg-[#35373c]"}`}
            title={deafened ? "Undeafen" : "Deafen"}
          >
            <img
              src={deafened ? headphoneDeafenIcon : headphoneIcon}
              alt={deafened ? "Deafened" : "Headphones"}
              className={`h-[18px] w-[18px] transition-opacity ${deafened ? "opacity-100" : "invert opacity-70 hover:opacity-100"}`}
              style={deafened ? { filter: "invert(36%) sepia(93%) saturate(7471%) hue-rotate(348deg) brightness(101%) contrast(88%)" } : undefined}
            />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded p-1.5 hover:bg-[#35373c] transition-colors"
            title="User Settings"
          >
            <img
              src={settingsIcon}
              alt="Settings"
              className="h-[18px] w-[18px] invert opacity-70 hover:opacity-100 transition-opacity"
            />
          </button>
        </div>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default DMSidebar;
