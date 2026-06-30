import { useState, useEffect } from "react";
import StatusIndicator from "@/components/app/StatusIndicator";
import GroupAvatar from "@/components/app/GroupAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useActivity } from "@/contexts/ActivityContext";
import { useFriends } from "@/hooks/useFriends";
import { Conversation } from "@/hooks/useConversations";
import { supabase } from "@/integrations/supabase/client";
import { Plus, X, Users, MoreVertical, CheckCheck, BellOff, Bell, Inbox } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { getProfileColor } from "@/lib/profileColors";
import { activityLabel } from "@/lib/activityLabel";
import { toast } from "sonner";
import { playSound } from "@/lib/sounds";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useConversationMutes, type MuteDuration } from "@/hooks/useConversationMutes";
import ProfilePopup from "./ProfilePopup";
import SettingsModal from "./SettingsModal";
import SearchBar from "./SearchBar";
import UserProfileCard from "./chat/UserProfileCard";
import SidebarActivityCard from "./SidebarActivityCard";
import SidebarVoiceCard from "./SidebarVoiceCard";
import SidebarGroupCallCard from "./SidebarGroupCallCard";
import UserDisplayName from "./UserDisplayName";
import UserBadges from "./UserBadges";
import friendsIcon from "@/assets/icons/friends.svg";
import shopIcon from "@/assets/icons/shop.svg";
import notesIcon from "@/assets/icons/notes.svg";
import honeyIcon from "@/assets/icons/honey.svg";
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
  const isMobile = useIsMobile();
  const { user, onlineUserIds } = useAuth();
  const { activeCall, toggleMute, toggleDeafen } = useVoice();
  const { getActivity } = useActivity();
  const { pending } = useFriends();
  const { isMuted, mutedUntil, setMute } = useConversationMutes();
  const incomingPendingCount = pending.filter((p) => p.addressee_id === user?.id).length;
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();

  // Pending DM requests count for the badge on the "Requests" nav entry.
  const [requestCount, setRequestCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("message_requests")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("status", "pending");
      if (alive) setRequestCount(count ?? 0);
    };
    fetchCount();
    const ch = supabase
      .channel(`msg-requests-count:${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "message_requests", filter: `recipient_id=eq.${user.id}` },
        () => fetchCount(),
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [user]);

  const MUTE_OPTIONS: Array<{ label: string; value: MuteDuration }> = [
    { label: "For 15 Minutes", value: { kind: "minutes", minutes: 15 } },
    { label: "For 1 Hour", value: { kind: "minutes", minutes: 60 } },
    { label: "For 3 Hours", value: { kind: "minutes", minutes: 180 } },
    { label: "For 8 Hours", value: { kind: "minutes", minutes: 480 } },
    { label: "For 24 Hours", value: { kind: "minutes", minutes: 1440 } },
    { label: "Until I Turn It Back On", value: { kind: "forever" } },
  ];

  const handleMute = async (convId: string, duration: MuteDuration) => {
    try {
      await setMute(convId, duration);
      toast.success("Conversation muted");
    } catch {
      toast.error("Failed to mute");
    }
  };
  const handleUnmute = async (convId: string) => {
    try {
      await setMute(convId, null);
      toast.success("Conversation unmuted");
    } catch {
      toast.error("Failed to unmute");
    }
  };

  const handleLeaveGroup = async (convId: string, groupName: string) => {
    if (!user) return;
    const ok = window.confirm(
      `Leave "${groupName}"?\n\nYou will no longer receive messages from this group and would need to be re-invited to rejoin.`
    );
    if (!ok) return;
    try {
      const { error } = await (supabase as any)
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", convId)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success(`Left "${groupName}"`);
      onCloseConversation(convId);
    } catch (e: any) {
      console.error("[DMSidebar] leave group failed:", e);
      toast.error("Couldn't leave group — try again");
    }
  };

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

  const handleMarkAsRead = async (conversationId: string) => {
    try {
      await supabase.rpc("mark_conversation_read", { _conversation_id: conversationId });
      window.dispatchEvent(new CustomEvent("cubbly:conversation-marked-read", { detail: { conversationId } }));
      toast.success("Marked as read");
    } catch {
      toast.error("Failed to mark as read");
    }
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

  const navItems: Array<{ id: string; label: string; icon?: string; lucide?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; isNew?: boolean }> = [
    { id: "friends", icon: friendsIcon, label: "Friends" },
    
    { id: "notes", icon: notesIcon, label: "Personal Notes" },
    { id: "honey", icon: honeyIcon, label: "Honey", isNew: true },
    { id: "shop", icon: shopIcon, label: "Shop" },
  ];

  // Per-user "NEW" pill: auto-hides 14 days after first view of the Honey tab.
  const honeyNewKey = user ? `cubbly:honey-tab-seen-at:${user.id}` : "cubbly:honey-tab-seen-at";
  const [showHoneyNew, setShowHoneyNew] = useState<boolean>(() => {
    try {
      const seen = localStorage.getItem(honeyNewKey);
      if (!seen) return true;
      const days = (Date.now() - Number(seen)) / 86400000;
      return days < 14;
    } catch { return true; }
  });
  useEffect(() => {
    if (activeView === "honey" && showHoneyNew) {
      try {
        if (!localStorage.getItem(honeyNewKey)) {
          localStorage.setItem(honeyNewKey, String(Date.now()));
        }
      } catch {}
    }
  }, [activeView, showHoneyNew, honeyNewKey]);

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
            {item.icon ? (
              <img
                src={item.icon}
                alt=""
                className={`shrink-0 invert opacity-80 ${item.id === "honey" ? "h-[14px] w-[14px] mx-[3px]" : "h-5 w-5"}`}
              />
            ) : item.lucide ? (
              <item.lucide className="h-5 w-5 shrink-0 opacity-80" />
            ) : null}
            <span className="flex-1 text-left">{item.label}</span>
            {item.id === "honey" && showHoneyNew && (
              <span
                className="absolute right-0 top-1/2 -translate-y-1/2 rounded-l-full pl-2 pr-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-black"
                style={{
                  background: "linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)",
                }}
              >
                NEW
              </span>
            )}
            {item.id === "friends" && incomingPendingCount > 0 && (
              <span
                className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ed4245] px-1 text-[10px] font-bold text-white animate-fade-in"
                title={`${incomingPendingCount} pending friend request${incomingPendingCount === 1 ? "" : "s"}`}
              >
                {incomingPendingCount > 9 ? "9+" : incomingPendingCount}
              </span>
            )}
            {item.id === "requests" && requestCount > 0 && (
              <span
                className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ed4245] px-1 text-[10px] font-bold text-white animate-fade-in"
                title={`${requestCount} pending message request${requestCount === 1 ? "" : "s"}`}
              >
                {requestCount > 9 ? "9+" : requestCount}
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
            const dmIsOnline = !conv.is_group
              ? (conv.participant.user_id === "00000000-0000-0000-0000-000000000001" || onlineUserIds.has(conv.participant.user_id))
              : false;
            const dmActivityLabel = activityLabel(dmActivity, dmIsOnline);
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
                    <div
                      className={`relative shrink-0 transition-all duration-200 ${
                        isMuted(conv.id)
                          ? "opacity-40 blur-[3px] saturate-50 group-hover:blur-0 group-hover:opacity-70 group-hover:saturate-100"
                          : ""
                      }`}
                    >
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
                    <div
                      className={`flex-1 min-w-0 text-left transition-all duration-200 ${
                        isMuted(conv.id)
                          ? "opacity-50 blur-[2.5px] group-hover:blur-0 group-hover:opacity-80"
                          : ""
                      }`}
                    >
                      <p className="truncate text-sm font-medium leading-tight flex items-center gap-1.5">
                        {conv.is_group ? (
                          <span className="truncate">{displayName}</span>
                        ) : (
                          <>
                            <UserDisplayName
                              userId={conv.participant.user_id}
                              name={displayName}
                              fallbackColor="currentColor"
                              className="truncate"
                            />
                            <UserBadges userId={conv.participant.user_id} size={12} />
                          </>
                        )}
                        {isMuted(conv.id) && (
                          <BellOff className="h-3 w-3 shrink-0 opacity-100" style={{ filter: "none" }} />
                        )}
                      </p>
                      {subtitle && (
                        <p
                          className="truncate text-[11px] leading-tight"
                          style={{ color: dmActivity?.name ? "#3ba55c" : "var(--app-text-secondary, #949ba4)" }}
                        >
                          {subtitle}
                        </p>
                      )}
                    </div>
                    {isMobile ? (
                      // Mobile: persistent ⋮ that opens the existing context menu.
                      // Avoids the desktop hover-X that requires a double-tap on touch
                      // (first tap reveals the X, second tap fires it → wrong-chat opens).
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          // Synthesize a contextmenu event on the row to open Radix's menu
                          const target = e.currentTarget.parentElement as HTMLElement | null;
                          target?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: e.clientX, clientY: e.clientY }));
                        }}
                        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded touch-manipulation"
                        style={{ color: "var(--app-text-secondary, #949ba4)" }}
                        aria-label="More options"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </span>
                    ) : (
                      <X
                        onClick={(e) => { e.stopPropagation(); onCloseConversation(conv.id); }}
                        className="ml-auto h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100"
                        style={{ color: "var(--app-text-secondary, #949ba4)" }}
                      />
                    )}
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
                  {isMuted(conv.id) ? (
                    <ContextMenuItem
                      onClick={() => handleUnmute(conv.id)}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                    >
                      <Bell className="h-4 w-4" />
                      {mutedUntil(conv.id) ? "Unmute Conversation" : "Unmute Conversation"}
                    </ContextMenuItem>
                  ) : (
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer">
                        <BellOff className="h-4 w-4" />
                        Mute Conversation
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent
                        className="w-56 rounded-xl border p-1.5 shadow-xl"
                        style={{ backgroundColor: "#111214", borderColor: "var(--app-border, #2b2d31)" }}
                      >
                        {MUTE_OPTIONS.map((opt) => (
                          <ContextMenuItem
                            key={opt.label}
                            onClick={() => handleMute(conv.id, opt.value)}
                            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                          >
                            {opt.label}
                          </ContextMenuItem>
                        ))}
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                  )}
                  <ContextMenuItem
                    onClick={() => handleMarkAsRead(conv.id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                  >
                    <CheckCheck className="h-4 w-4" />
                    Mark As Read
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => onCloseConversation(conv.id)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                    {conv.is_group ? "Hide Group" : "Close DM"}
                  </ContextMenuItem>
                  {conv.is_group && (
                    <ContextMenuItem
                      onClick={() => handleLeaveGroup(conv.id, conv.name || "Group")}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white cursor-pointer"
                    >
                      <img src={removeUserIcon} alt="" className="h-4 w-4" style={{ filter: "invert(36%) sepia(93%) saturate(7471%) hue-rotate(348deg) brightness(101%) contrast(88%)" }} />
                      Leave Group
                    </ContextMenuItem>
                  )}
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

      {/* Activity + Voice cards (sit just above the user panel) */}
      <SidebarActivityCard />
      <SidebarVoiceCard
        conversations={conversations}
        onOpenCall={(convId) => setActiveView(`dm:${convId}`)}
      />
      <SidebarGroupCallCard />

      {/* User panel */}
      <div className="flex items-center gap-2.5 px-2 py-2 user-panel" style={{ backgroundColor: 'var(--app-bg-accent)' }}>
        <ProfilePopup
          currentStatus={userStatus}
          onStatusChange={setUserStatus}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 overflow-hidden min-w-0">
          <p className="truncate text-[15px] font-bold text-white leading-snug flex items-center gap-1.5">
            <UserDisplayName userId={user?.id} name={displayName} fallbackColor="#ffffff" className="truncate" />
          </p>
          <p className="truncate text-[11px] leading-snug" style={{ color: "var(--app-text-secondary, #949ba4)" }}>{username}</p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => {
              if (activeCall) { toggleMute(); } else {
                const next = !localMuted;
                setLocalMuted(next);
                playSound(next ? "mute" : "unmute", { volume: 0.4 });
              }
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
              if (activeCall) { toggleDeafen(); } else {
                const next = !localDeafened;
                setLocalDeafened(next);
                playSound(next ? "deafen" : "undeafen", { volume: 0.4 });
              }
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
