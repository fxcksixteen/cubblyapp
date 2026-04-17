import { useState, useEffect } from "react";
import StatusIndicator from "@/components/app/StatusIndicator";
import GroupAvatar from "@/components/app/GroupAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useActivity } from "@/contexts/ActivityContext";
import { useFriends } from "@/hooks/useFriends";
import { Conversation } from "@/hooks/useConversations";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, Users } from "lucide-react";
import { getProfileColor } from "@/lib/profileColors";
import { activityLabel } from "@/lib/activityLabel";
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
import UserProfileCard from "./chat/UserProfileCard";
import friendsIcon from "@/assets/icons/friends.svg";
import shopIcon from "@/assets/icons/shop.svg";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneIcon from "@/assets/icons/headphone.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";
import settingsIcon from "@/assets/icons/settings.svg";
import removeUserIcon from "@/assets/icons/remove-user.svg";
import blockUserIcon from "@/assets/icons/block-user.svg";
import copyIcon from "@/assets/icons/copy.svg";

const preloadImages = [micIcon, micMuteIcon, headphoneIcon, headphoneDeafenIcon, settingsIcon, friendsIcon, shopIcon];
preloadImages.forEach(src => { const img = new Image(); img.src = src; });

interface DMSidebarProps {
  conversations: Conversation[];
  activeView: string;
  setActiveView: (view: string) => void;
  onCloseConversation: (convId: string) => void;
  onOpenDM: (userId: string) => void;
  onCreateGroup: () => void;
}


const DMSidebar = ({ conversations, activeView, setActiveView, onCloseConversation, onOpenDM, onCreateGroup }: DMSidebarProps) => {
  const { user, onlineUserIds } = useAuth();
  const { activeCall, toggleMute, toggleDeafen } = useVoice();
  const { getActivity } = useActivity();
  const { pending } = useFriends();
  const incomingPendingCount = pending.filter((p) => p.addressee_id === user?.id).length;
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();

  const [localMuted, setLocalMuted] = useState(false);
  const [localDeafened, setLocalDeafened] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userStatus, setUserStatus] = useState("online");
  const [profileCard, setProfileCard] = useState<{ userId: string; name: string; x: number; y: number } | null>(null);

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
    { id: "friends", icon: friendsIcon, label: "Friends" },
    { id: "shop", icon: shopIcon, label: "Shop" },
  ];

  return (
    <div className="flex w-60 flex-shrink-0 flex-col sidebar-primary" style={{ backgroundColor: 'var(--app-bg-secondary)' }}>
      <SearchBar onOpenDM={onOpenDM} />

      <div className="flex-1 overflow-y-auto px-2 pt-3">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={`relative flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-[15px] font-medium transition-colors cubbly-3d-nav ${
              activeView === item.id
                ? "text-white"
                : "hover:text-[#dbdee1]"
            }`}
            style={{
              backgroundColor: activeView === item.id ? "var(--app-active, #404249)" : undefined,
              color: activeView !== item.id ? "var(--app-text-secondary, #949ba4)" : undefined,
            }}
            onMouseEnter={e => { if (activeView !== item.id) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
            onMouseLeave={e => { if (activeView !== item.id) e.currentTarget.style.backgroundColor = ""; }}
          >
            <img src={item.icon} alt="" className="h-5 w-5 shrink-0 invert opacity-80" />
            {item.label}
            {item.id === "friends" && incomingPendingCount > 0 && (
              <span
                className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ed4245] px-1 text-[10px] font-bold text-white animate-fade-in"
                title={`${incomingPendingCount} pending friend request${incomingPendingCount === 1 ? "" : "s"}`}
              >
                {incomingPendingCount > 9 ? "9+" : incomingPendingCount}
              </span>
            )}
          </button>
        ))}

        {/* DM header */}
        <div className="mt-4 flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
            Direct Messages
          </span>
          <button
            onClick={onCreateGroup}
            title="Create Group DM"
            className="rounded p-0.5 transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
          >
            <Plus className="h-4 w-4 cursor-pointer" style={{ color: "var(--app-text-secondary, #949ba4)" }} />
          </button>
        </div>

        {/* DM list */}
        <div className="mt-1 flex flex-col gap-0.5">
          {conversations.map((conv) => {
            const isActive = activeView === `dm:${conv.id}`;
            const displayName = conv.is_group
              ? (conv.name || conv.members.map((m) => m.display_name).slice(0, 3).join(", ") || "Group")
              : conv.participant.display_name;
            const dmActivity = !conv.is_group ? getActivity(conv.participant.user_id) : undefined;
            const dmActivityLabel = activityLabel(dmActivity);
            const subtitle = conv.is_group
              ? `${conv.members.length + 1} members`
              : dmActivityLabel;
            return (
              <ContextMenu key={conv.id}>
                <ContextMenuTrigger asChild>
                  <button
                    onClick={() => setActiveView(`dm:${conv.id}`)}
                    className={`group flex w-full items-center gap-3 rounded-[4px] px-2 py-1.5 transition-colors cubbly-3d-nav ${
                      isActive ? "text-white" : ""
                    }`}
                    style={{
                      backgroundColor: isActive ? "var(--app-active, #404249)" : undefined,
                      color: !isActive ? "var(--app-text-secondary, #949ba4)" : undefined,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = ""; }}
                  >
                    <div className="relative shrink-0">
                      <GroupAvatar conversation={conv} size={32} />
                      {!conv.is_group && (
                        <div className="absolute -bottom-0.5 -right-0.5">
                          <StatusIndicator
                            status={
                              conv.participant.user_id === "00000000-0000-0000-0000-000000000001"
                                ? "online"
                                : onlineUserIds.has(conv.participant.user_id)
                                  ? (conv.participant.status === "invisible" ? "online" : conv.participant.status)
                                  : "offline"
                            }
                            size="sm"
                            borderColor="var(--app-bg-secondary, #2b2d31)"
                          />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
                      {subtitle && (
                        <p
                          className="truncate text-[11px] leading-tight"
                          style={{ color: dmActivity?.name ? "#3ba55c" : "var(--app-text-secondary, #949ba4)" }}
                        >
                          {subtitle}
                        </p>
                      )}
                    </div>
                    <X
                      onClick={(e) => { e.stopPropagation(); onCloseConversation(conv.id); }}
                      className="ml-auto h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100"
                      style={{ color: "var(--app-text-secondary, #949ba4)" }}
                    />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent
                  className="w-52 rounded-xl border p-1.5 shadow-xl"
                  style={{ backgroundColor: "#111214", borderColor: "var(--app-border, #2b2d31)" }}
                >
                  <ContextMenuItem
                    onClick={() => {
                      if (conv.is_group) {
                        setActiveView(`dm:${conv.id}`);
                      } else {
                        // Open the user's full profile popup (not the chat)
                        setProfileCard({
                          userId: conv.participant.user_id,
                          name: conv.participant.display_name,
                          x: window.innerWidth / 2,
                          y: window.innerHeight / 2,
                        });
                      }
                    }}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                  >
                    <img src={friendsIcon} alt="" className="h-4 w-4 invert opacity-70" />
                    {conv.is_group ? "Open" : "View Profile"}
                  </ContextMenuItem>
                  {!conv.is_group && (
                    <ContextMenuItem
                      onClick={() => handleRemoveFriend(conv.participant.user_id)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                    >
                      <img src={removeUserIcon} alt="" className="h-4 w-4 invert opacity-70" />
                      Remove Friend
                    </ContextMenuItem>
                  )}
                  <ContextMenuItem
                    onClick={() => onCloseConversation(conv.id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                    {conv.is_group ? "Hide Group" : "Close DM"}
                  </ContextMenuItem>
                  {!conv.is_group && (
                    <>
                      <ContextMenuSeparator className="my-1" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />
                      <ContextMenuItem
                        onClick={() => handleBlockUser(conv.participant.user_id)}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white cursor-pointer"
                      >
                        <img src={blockUserIcon} alt="" className="h-4 w-4" style={{ filter: "invert(36%) sepia(93%) saturate(7471%) hue-rotate(348deg) brightness(101%) contrast(88%)" }} />
                        Block
                      </ContextMenuItem>
                      <ContextMenuSeparator className="my-1" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />
                      <ContextMenuItem
                        onClick={() => handleCopyUserId(conv.participant.user_id)}
                        className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                      >
                        <img src={copyIcon} alt="" className="h-4 w-4 invert opacity-70" />
                        Copy User ID
                      </ContextMenuItem>
                    </>
                  )}
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
          <p className="truncate text-[11px] leading-snug" style={{ color: "var(--app-text-secondary, #949ba4)" }}>{username}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => {
              if (activeCall) { toggleMute(); } else { setLocalMuted(!localMuted); }
            }}
            className="rounded p-1.5 transition-colors"
            style={{ backgroundColor: (activeCall ? activeCall.isMuted : localMuted) ? "rgba(237,66,69,0.2)" : undefined }}
            onMouseEnter={e => { if (!(activeCall ? activeCall.isMuted : localMuted)) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
            onMouseLeave={e => { if (!(activeCall ? activeCall.isMuted : localMuted)) e.currentTarget.style.backgroundColor = ""; }}
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
            className="rounded p-1.5 transition-colors"
            style={{ backgroundColor: (activeCall ? activeCall.isDeafened : localDeafened) ? "rgba(237,66,69,0.2)" : undefined }}
            onMouseEnter={e => { if (!(activeCall ? activeCall.isDeafened : localDeafened)) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
            onMouseLeave={e => { if (!(activeCall ? activeCall.isDeafened : localDeafened)) e.currentTarget.style.backgroundColor = ""; }}
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
            className="rounded p-1.5 transition-colors"
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
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
      {profileCard && (
        <UserProfileCard
          userId={profileCard.userId}
          displayName={profileCard.name}
          position={{ x: profileCard.x, y: profileCard.y }}
          onClose={() => setProfileCard(null)}
          onSendMessage={(uid) => { setProfileCard(null); onOpenDM(uid); }}
          startExpanded
        />
      )}
    </div>
  );
};

export default DMSidebar;
