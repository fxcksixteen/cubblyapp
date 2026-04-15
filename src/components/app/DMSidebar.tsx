import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { Conversation } from "@/hooks/useConversations";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, ShoppingBag } from "lucide-react";
import { getProfileColor } from "@/lib/profileColors";
import { toast } from "sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import ProfilePopup from "./ProfilePopup";
import SettingsModal from "./SettingsModal";
import SearchBar from "./SearchBar";
import friendsIcon from "@/assets/icons/friends.svg";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneIcon from "@/assets/icons/headphone.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";
import settingsIcon from "@/assets/icons/settings.svg";

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

  const handleCopyUserId = (userId: string) => {
    navigator.clipboard.writeText(userId);
    toast.success("User ID copied!");
  };

  const handleRemoveFriend = async (userId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`);
    if (error) toast.error("Failed to remove friend");
    else toast.success("Friend removed");
  };

  const handleBlockUser = async (userId: string) => {
    if (!user) return;
    // Check if friendship exists
    const { data: existing } = await supabase
      .from("friendships")
      .select("id")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
      .maybeSingle();

    if (existing) {
      await supabase.from("friendships").update({ status: "blocked" }).eq("id", existing.id);
    } else {
      await supabase.from("friendships").insert({ requester_id: user.id, addressee_id: userId, status: "blocked" });
    }
    toast.success("User blocked");
  };

  const navItems = [
    { id: "friends", icon: friendsIcon, label: "Friends", isSvg: true },
    { id: "shop", icon: ShoppingBag, label: "Shop", isSvg: false as const },
  ];

  return (
    <div className="flex w-60 flex-shrink-0 flex-col sidebar-primary" style={{ backgroundColor: 'var(--app-bg-secondary)' }}>
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
              <ContextMenu key={conv.id}>
                <ContextMenuTrigger asChild>
                  <button
                    onClick={() => setActiveView(`dm:${conv.id}`)}
                    className={`group flex w-full items-center gap-3 rounded-[4px] px-2 py-1.5 transition-colors cubbly-3d-nav ${
                      activeView === `dm:${conv.id}`
                        ? "bg-[#404249] text-white"
                        : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
                    }`}
                  >
                    <div className="relative">
                      {conv.participant.avatar_url ? (
                        <img src={conv.participant.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ backgroundColor: color.bg }}
                        >
                          {conv.participant.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-[#2b2d31] ${statusColors[conv.participant.status]}`} />
                    </div>
                    <span className="truncate text-sm font-medium">{conv.participant.display_name}</span>
                    <X
                      onClick={(e) => { e.stopPropagation(); onCloseConversation(conv.id); }}
                      className="ml-auto h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-[#dbdee1]"
                    />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent
                  className="w-52 rounded-xl border p-1.5 shadow-xl"
                  style={{ backgroundColor: "#111214", borderColor: "#2b2d31" }}
                >
                  <ContextMenuItem
                    onClick={() => setActiveView(`dm:${conv.id}`)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                  >
                    Profile
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => handleRemoveFriend(conv.participant.user_id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                  >
                    Remove Friend
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => onCloseConversation(conv.id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                  >
                    Close DM
                  </ContextMenuItem>
                  <ContextMenuSeparator className="my-1 bg-[#2b2d31]" />
                  <ContextMenuItem
                    onClick={() => handleBlockUser(conv.participant.user_id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white cursor-pointer"
                  >
                    Block
                  </ContextMenuItem>
                  <ContextMenuSeparator className="my-1 bg-[#2b2d31]" />
                  <ContextMenuItem
                    onClick={() => handleCopyUserId(conv.participant.user_id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                  >
                    Copy User ID
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
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
            onClick={() => {
              if (activeCall) { toggleMute(); } else { setLocalMuted(!localMuted); }
            }}
            className={`rounded p-1.5 transition-colors ${(activeCall ? activeCall.isMuted : localMuted) ? "bg-[#ed4245]/20" : "hover:bg-[#35373c]"}`}
            title={(activeCall ? activeCall.isMuted : localMuted) ? "Unmute" : "Mute"}
          >
            <img
              src={(activeCall ? activeCall.isMuted : localMuted) ? micMuteIcon : micIcon}
              alt={(activeCall ? activeCall.isMuted : localMuted) ? "Muted" : "Microphone"}
              className={`h-[18px] w-[18px] transition-opacity ${(activeCall ? activeCall.isMuted : localMuted) ? "opacity-100" : "invert opacity-70 hover:opacity-100"}`}
              style={(activeCall ? activeCall.isMuted : localMuted) ? { filter: "invert(36%) sepia(93%) saturate(7471%) hue-rotate(348deg) brightness(101%) contrast(88%)" } : undefined}
            />
          </button>
          <button
            onClick={() => {
              if (activeCall) { toggleDeafen(); } else { setLocalDeafened(!localDeafened); }
            }}
            className={`rounded p-1.5 transition-colors ${(activeCall ? activeCall.isDeafened : localDeafened) ? "bg-[#ed4245]/20" : "hover:bg-[#35373c]"}`}
            title={(activeCall ? activeCall.isDeafened : localDeafened) ? "Undeafen" : "Deafen"}
          >
            <img
              src={(activeCall ? activeCall.isDeafened : localDeafened) ? headphoneDeafenIcon : headphoneIcon}
              alt={(activeCall ? activeCall.isDeafened : localDeafened) ? "Deafened" : "Headphones"}
              className={`h-[18px] w-[18px] transition-opacity ${(activeCall ? activeCall.isDeafened : localDeafened) ? "opacity-100" : "invert opacity-70 hover:opacity-100"}`}
              style={(activeCall ? activeCall.isDeafened : localDeafened) ? { filter: "invert(36%) sepia(93%) saturate(7471%) hue-rotate(348deg) brightness(101%) contrast(88%)" } : undefined}
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