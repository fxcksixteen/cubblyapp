import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConversations } from "@/hooks/useConversations";
import { useVoice } from "@/contexts/VoiceContext";
import { useGroupCall } from "@/contexts/GroupCallContext";
import { useUnreadCounts } from "@/hooks/useUnreadCounts";
import { useFriends } from "@/hooks/useFriends";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileColor } from "@/lib/profileColors";
import { getEffectivePresenceStatus } from "@/lib/presence";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipe } from "@/hooks/useSwipe";
import messagesInboxIcon from "@/assets/icons/messages.svg";
import activityIcon from "@/assets/icons/activity.svg";
import callIcon from "@/assets/icons/call.svg";
import callEndIcon from "@/assets/icons/call-end.svg";
import videoIcon from "@/assets/icons/video-camera.svg";
import addUserIcon from "@/assets/icons/add-user.svg";
import StatusIndicator from "@/components/app/StatusIndicator";
import ServerSidebar from "@/components/app/ServerSidebar";
import DMSidebar from "@/components/app/DMSidebar";
import FriendsView from "@/components/app/FriendsView";
import ChatView from "@/components/app/ChatView";
import ShopView from "@/components/app/ShopView";
import VoiceCallOverlay from "@/components/app/VoiceCallOverlay";
import TitleBar from "@/components/app/TitleBar";
import CreateGroupModal from "@/components/app/CreateGroupModal";
import GroupAvatar from "@/components/app/GroupAvatar";
import friendsIcon from "@/assets/icons/friends.svg";
import MobileBottomNav from "@/components/app/mobile/MobileBottomNav";
import MobileChatHeader from "@/components/app/mobile/MobileChatHeader";
import MobileCallOverlay from "@/components/app/mobile/MobileCallOverlay";
import YouPage from "@/pages/YouPage";
import GroupMembersPanel from "@/components/app/GroupMembersPanel";
import MobileNotificationPrompt from "@/components/app/MobileNotificationPrompt";

type FriendTab = "online" | "all" | "pending" | "blocked" | "add";

const BOT_USER_ID = "00000000-0000-0000-0000-000000000001";
const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI;

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, onlineUserIds } = useAuth();
  const { activeCall, startCall, endCall, toggleVideo } = useVoice();
  const groupCall = useGroupCall();
  const isMobile = useIsMobile();

  const pathParts = location.pathname.split("/").filter(Boolean);
  const isChatRoute = pathParts[1] === "chat" && pathParts[2];
  const chatIdFromUrl = isChatRoute ? pathParts[2] : null;
  const isYouRoute = pathParts[1] === "you";
  const urlTab = pathParts[1] as FriendTab | undefined;
  const validTabs: FriendTab[] = ["online", "all", "pending", "blocked", "add"];
  const friendTab: FriendTab = urlTab && validTabs.includes(urlTab) ? urlTab : "online";

  const { conversations, openOrCreateConversation, createGroupConversation, closeConversation, refetch: refetchConvs } = useConversations();
  const { unreadByConv } = useUnreadCounts(chatIdFromUrl);
  const { pending } = useFriends();
  const incomingPendingCount = pending.filter((p) => p.addressee_id === user?.id).length;
  const [tempDMs, setTempDMs] = useState<string[]>([]);
  const [activeNowOpen, setActiveNowOpen] = useState(true);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [showMembersPanel, setShowMembersPanel] = useState(true);

  // Mobile: which panel is currently slid open ("none" = main view visible)
  const [mobilePanel, setMobilePanel] = useState<"none" | "dms" | "members">("none");
  // Close panels whenever the route changes
  useEffect(() => { setMobilePanel("none"); }, [location.pathname]);
  // Listen for the bottom-nav "Home" tap to open the DM panel
  useEffect(() => {
    const handler = () => setMobilePanel("dms");
    window.addEventListener("cubbly:open-mobile-dms", handler);
    return () => window.removeEventListener("cubbly:open-mobile-dms", handler);
  }, []);

  const unreadList = useMemo(() => {
    return Array.from(unreadByConv.entries())
      .map(([conversationId, info]) => ({ conversationId, info }))
      .sort((a, b) => (b.info.lastMessageAt || "").localeCompare(a.info.lastMessageAt || ""));
  }, [unreadByConv]);

  useEffect(() => {
    if (location.pathname === "/@me" || location.pathname === "/@me/") {
      navigate("/@me/online", { replace: true });
    }
  }, [location.pathname, navigate]);

  const activeView = chatIdFromUrl
    ? `dm:${chatIdFromUrl}`
    : pathParts[1] === "shop" ? "shop"
    : isYouRoute ? "you"
    : "friends";

  const setFriendTab = (tab: FriendTab) => {
    navigate(`/@me/${tab}`, { replace: true });
  };

  const handleOpenDM = async (userId: string) => {
    const convId = await openOrCreateConversation(userId);
    if (convId) {
      setTempDMs((previous) => (previous.includes(convId) ? previous : [...previous, convId]));
      navigate(`/@me/chat/${convId}`, { replace: true });
      await refetchConvs();
    }
  };

  const handleCloseConversation = (convId: string) => {
    const conversation = conversations.find((item) => item.id === convId);
    if (conversation && !conversation.lastMessage) {
      closeConversation(convId);
      setTempDMs((previous) => previous.filter((id) => id !== convId));
    } else {
      closeConversation(convId);
    }
    if (chatIdFromUrl === convId) {
      navigate("/@me/online", { replace: true });
    }
  };

  const isDM = activeView.startsWith("dm:");
  const isShop = activeView === "shop";
  const isYou = activeView === "you";
  const activeConvId = isDM ? activeView.replace("dm:", "") : null;
  const activeConv = conversations.find((conversation) => conversation.id === activeConvId);
  const activeParticipant = activeConv?.participant;

  const visibleConversations = conversations.filter(
    (conversation) =>
      conversation.is_group ||
      conversation.lastMessage ||
      tempDMs.includes(conversation.id) ||
      conversation.id === activeConvId,
  );

  const isInCall = activeCall?.conversationId === activeConvId
    || groupCall.activeCall?.conversationId === activeConvId;

  const currentUsername = user?.user_metadata?.username?.toLowerCase() || "";
  const isAdmin = currentUsername === "kaszy";

  const handleVoiceCall = async () => {
    if (isInCall) {
      if (groupCall.activeCall?.conversationId === activeConvId) groupCall.leaveCall();
      else endCall();
      return;
    }
    if (activeConv?.is_group && activeConvId) {
      // Start a group call: ring every other member
      const memberIds = activeConv.members.map(m => m.user_id);
      const callName = activeConv.name?.trim() || activeConv.members.map(m => m.display_name).join(", ");
      await groupCall.startCall(activeConvId, callName, memberIds);
      return;
    }
    if (activeConv && !activeConv.is_group && activeParticipant) {
      if (activeParticipant.user_id === BOT_USER_ID && !isAdmin) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-bot`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              conversation_id: activeConvId,
              user_message: "[SYSTEM: The user just tried to start a voice call with you. Explain that you're a text-based AI and can't join voice calls yet, but you'd love to help test other features or just chat! Be warm and helpful.]",
            }),
          });
        } catch (e) {
          console.error("Failed to notify bot about call:", e);
        }
        return;
      }
      startCall(activeConvId!, activeParticipant.user_id, activeParticipant.display_name);
    }
  };

  /** 1-on-1 video: start the call first if needed, then toggle camera. */
  const handleVideoCall = async () => {
    if (!activeConv || activeConv.is_group || !activeParticipant) return;
    if (activeParticipant.user_id === BOT_USER_ID) return;
    const alreadyInThisCall = activeCall?.conversationId === activeConvId;
    if (!alreadyInThisCall) {
      startCall(activeConvId!, activeParticipant.user_id, activeParticipant.display_name);
      // Wait briefly for ICE to come up before toggling video so the
      // transceiver exists when we call replaceTrack.
      const start = Date.now();
      while (Date.now() - start < 8000) {
        await new Promise((r) => setTimeout(r, 250));
        if (activeCall?.conversationId === activeConvId && activeCall.state === "connected") break;
      }
    }
    try { await toggleVideo(); } catch (e) { console.error("[Video] toggle failed:", e); }
  };

  // Mobile swipe target: the main chat content area
  // - In DM view: swipe right → open DMs panel; swipe left → open members (if group)
  // - In friends/shop view: swipe right → open DMs panel
  const swipeRef = useSwipe<HTMLDivElement>({
    disabled: !isMobile || isYou,
    onSwipeRight: () => {
      if (mobilePanel === "members") setMobilePanel("none");
      else setMobilePanel("dms");
    },
    onSwipeLeft: () => {
      if (mobilePanel === "dms") setMobilePanel("none");
      else if (isDM && activeConv?.is_group) setMobilePanel("members");
    },
  });

  // Swipe-left on the open DM panel closes it (Discord-style back to chat)
  const dmPanelSwipeRef = useSwipe<HTMLDivElement>({
    disabled: !isMobile || mobilePanel !== "dms",
    onSwipeLeft: () => setMobilePanel("none"),
  });

  // Swipe-right on the open members panel closes it
  const membersPanelSwipeRef = useSwipe<HTMLDivElement>({
    disabled: !isMobile || mobilePanel !== "members",
    onSwipeRight: () => setMobilePanel("none"),
  });

  const renderHeader = () => {
    if (isShop) {
      return <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Shop</span>;
    }
    return (
      <>
        <div className="hidden sm:flex items-center gap-2">
          <img src={friendsIcon} alt="" className="h-5 w-5 invert opacity-60" />
          <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Friends</span>
        </div>
        <div className="hidden sm:block h-6 w-px" style={{ backgroundColor: "var(--app-border, #3f4147)" }} />
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {(["online", "all", "pending", "blocked"] as FriendTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFriendTab(tab)}
              className="relative rounded px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-medium capitalize transition-colors shrink-0"
              style={{
                backgroundColor: friendTab === tab && activeView === "friends" ? "var(--app-active, #404249)" : undefined,
                color: friendTab === tab && activeView === "friends" ? "white" : "var(--app-text-secondary, #b5bac1)",
              }}
              onMouseEnter={e => { if (!(friendTab === tab && activeView === "friends")) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
              onMouseLeave={e => { if (!(friendTab === tab && activeView === "friends")) e.currentTarget.style.backgroundColor = ""; }}
            >
              {tab}
              {tab === "pending" && incomingPendingCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#ed4245] px-1 text-[9px] font-bold text-white border-2 animate-fade-in"
                  style={{ borderColor: "var(--app-bg-primary)" }}
                >
                  {incomingPendingCount > 9 ? "9+" : incomingPendingCount}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => setFriendTab("add")}
            className={`rounded px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-medium transition-colors shrink-0 whitespace-nowrap ${
              friendTab === "add" && activeView === "friends"
                ? "bg-transparent text-[#3ba55c]"
                : "bg-[#3ba55c] text-white hover:bg-[#2d8b4e]"
            }`}
          >
            Add Friend
          </button>
        </div>
      </>
    );
  };

  const renderContent = () => {
    if (isYou) {
      return <YouPage />;
    }
    if (isDM && activeConvId && activeConv) {
      const isGroup = activeConv.is_group;
      const headerName = isGroup
        ? (activeConv.name || activeConv.members.map((m) => m.display_name).slice(0, 3).join(", ") || "Group")
        : activeParticipant?.display_name || "User";
      return (
        <ChatView
          conversation={activeConv}
          conversationId={activeConvId}
          recipientName={headerName}
          recipientAvatar={isGroup ? activeConv.picture_url || undefined : activeParticipant?.avatar_url || undefined}
          recipientUserId={isGroup ? undefined : activeParticipant?.user_id}
          showGroupMembers={isGroup && showMembersPanel && !isMobile}
          onLeftGroup={() => {
            navigate("/@me/online", { replace: true });
            refetchConvs();
          }}
        />
      );
    }
    if (isShop) {
      return <ShopView />;
    }
    return <FriendsView activeTab={friendTab} setActiveTab={setFriendTab} onOpenDM={handleOpenDM} activeNowOpen={activeNowOpen} setActiveNowOpen={setActiveNowOpen} />;
  };

  const participantColor = activeParticipant ? getProfileColor(activeParticipant.user_id) : null;
  const activeParticipantStatus = getEffectivePresenceStatus(activeParticipant?.user_id, activeParticipant?.status, onlineUserIds);

  // === MOBILE LAYOUT ===
  if (isMobile) {
    return (
      <div
        className="app-themed flex flex-col w-full overflow-hidden font-body relative"
        style={{ backgroundColor: "var(--app-bg-primary)", color: "var(--app-text-primary)", height: "100dvh" }}
      >
        {/* Main view (full-screen on mobile) */}
        <div ref={swipeRef} className="flex flex-col flex-1 min-h-0 relative">
          {/* Header */}
          {isDM && activeConv ? (
            <MobileChatHeader
              conversation={activeConv}
              participant={activeParticipant}
              participantStatus={activeParticipantStatus}
              isInCall={!!isInCall}
              onBack={() => navigate("/@me/online", { replace: true })}
              onCall={handleVoiceCall}
              onVideo={!activeConv.is_group ? handleVideoCall : undefined}
              onShowMembers={activeConv.is_group ? () => setMobilePanel("members") : undefined}
            />
          ) : !isYou ? (
            <div
              className="flex h-14 items-center gap-2 border-b px-3 shrink-0"
              style={{
                backgroundColor: "var(--app-bg-primary)",
                borderColor: "var(--app-border)",
                paddingTop: "env(safe-area-inset-top, 0px)",
              }}
            >
              <button
                onClick={() => setMobilePanel("dms")}
                className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[var(--app-hover)] touch-manipulation shrink-0"
                aria-label="Open chats"
              >
                <img src={messagesInboxIcon} alt="" className="h-5 w-5 invert opacity-70" />
              </button>
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">{renderHeader()}</div>
            </div>
          ) : null}

          {/* Page content (with bottom padding so nav doesn't overlap — but no padding inside a chat since the nav is hidden there) */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ paddingBottom: (isYou || isDM) ? 0 : "calc(56px + env(safe-area-inset-bottom, 0px))" }}>
            {renderContent()}
          </div>
        </div>

        {/* Backdrop (shared by both panels) */}
        {mobilePanel !== "none" && (
          <div
            className="fixed inset-0 z-30 bg-black mobile-backdrop"
            style={{ opacity: 0.5 }}
            onClick={() => setMobilePanel("none")}
          />
        )}

        {/* Sliding DM panel (left) */}
        <div
          ref={dmPanelSwipeRef}
          className="fixed inset-y-0 left-0 z-40 flex mobile-panel mobile-chrome"
          style={{
            width: "85vw",
            maxWidth: 360,
            transform: mobilePanel === "dms" ? "translateX(0)" : "translateX(-100%)",
            paddingTop: "env(safe-area-inset-top, 0px)",
          }}
        >
          <ServerSidebar
            isActive
            onHomeClick={() => {}}
            unreadConversations={unreadList}
            onJumpToConversation={(convId) => { navigate(`/@me/chat/${convId}`, { replace: true }); setMobilePanel("none"); }}
          />
          <DMSidebar
            conversations={visibleConversations}
            activeView={activeView}
            setActiveView={(view) => {
              if (view.startsWith("dm:")) {
                const convId = view.replace("dm:", "");
                navigate(`/@me/chat/${convId}`, { replace: true });
              } else if (view === "shop") {
                navigate("/@me/shop", { replace: true });
              } else {
                navigate(`/@me/${friendTab}`, { replace: true });
              }
              setMobilePanel("none");
            }}
            onCloseConversation={handleCloseConversation}
            onOpenDM={handleOpenDM}
            onCreateGroup={() => setCreateGroupOpen(true)}
          />
        </div>

        {/* Sliding members panel (right) — only useful on group DMs */}
        {isDM && activeConv?.is_group && (
          <div
            ref={membersPanelSwipeRef}
            className="fixed inset-y-0 right-0 z-40 mobile-panel mobile-chrome"
            style={{
              width: "85vw",
              maxWidth: 320,
              transform: mobilePanel === "members" ? "translateX(0)" : "translateX(100%)",
              backgroundColor: "var(--app-bg-secondary)",
              paddingTop: "env(safe-area-inset-top, 0px)",
            }}
          >
            {/* GroupMembersPanel is rendered inside ChatView already; here we render a separate instance */}
            {/* Lazy-import to avoid heavy bundle: use a wrapper */}
            <MembersPanelWrapper conversation={activeConv} onClose={() => setMobilePanel("none")} />
          </div>
        )}

        {/* Bottom nav (hidden inside chats so the input bar can sit at the bottom) */}
        <MobileBottomNav hidden={isDM} />

        {/* Call UI: fullscreen on mobile */}
        {activeCall && (
          <MobileCallOverlay
            conversationId={activeCall.conversationId}
            recipientName={activeCall.peerName}
            recipientUserId={activeCall.peerId}
          />
        )}

        {/* Incoming-call toast still shows */}
        <VoiceCallOverlay />
        <MobileNotificationPrompt />

        <CreateGroupModal
          isOpen={createGroupOpen}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={(convId) => {
            navigate(`/@me/chat/${convId}`, { replace: true });
          }}
          createGroupConversation={createGroupConversation}
        />
      </div>
    );
  }

  // === DESKTOP LAYOUT (unchanged) ===
  return (
    <div className="app-themed flex flex-col h-screen w-full overflow-hidden font-body" style={{ backgroundColor: "var(--app-bg-primary)", color: "var(--app-text-primary)" }}>
      {isElectron && <TitleBar />}

      <div className="flex flex-1 min-h-0">
        <ServerSidebar
          isActive
          onHomeClick={() => {}}
          unreadConversations={unreadList}
          onJumpToConversation={(convId) => navigate(`/@me/chat/${convId}`, { replace: true })}
        />

        <DMSidebar
          conversations={visibleConversations}
          activeView={activeView}
          setActiveView={(view) => {
            if (view.startsWith("dm:")) {
              const convId = view.replace("dm:", "");
              navigate(`/@me/chat/${convId}`, { replace: true });
            } else if (view === "shop") {
              navigate("/@me/shop", { replace: true });
            } else {
              navigate(`/@me/${friendTab}`, { replace: true });
            }
          }}
          onCloseConversation={handleCloseConversation}
          onOpenDM={handleOpenDM}
          onCreateGroup={() => setCreateGroupOpen(true)}
        />

        <div className="flex flex-1 flex-col">
          <div className="flex h-14 items-center justify-between border-b px-5 shadow-sm" style={{ backgroundColor: "var(--app-bg-primary)", borderColor: "var(--app-border)" }}>
            {isDM && activeConvId && activeConv ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <GroupAvatar conversation={activeConv} size={32} />
                    {!activeConv.is_group && (
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <StatusIndicator status={activeParticipantStatus} size="sm" borderColor="var(--app-bg-primary)" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold leading-tight" style={{ color: "var(--app-text-primary)" }}>
                      {activeConv.is_group
                        ? (activeConv.name || activeConv.members.map((m) => m.display_name).slice(0, 3).join(", ") || "Group")
                        : activeParticipant?.display_name || "Conversation"}
                    </p>
                    {activeConv.is_group && (
                      <p className="text-[11px] leading-tight" style={{ color: "var(--app-text-secondary)" }}>
                        {activeConv.members.length + 1} members
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ color: "var(--app-text-secondary)" }}>
                  {!activeConv.is_group && (
                    <>
                      <button
                        onClick={handleVoiceCall}
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                        title={isInCall ? "End Voice Call" : "Start Voice Call"}
                      >
                        <img
                          src={isInCall ? callEndIcon : callIcon}
                          alt={isInCall ? "End Call" : "Call"}
                          className="h-5 w-5"
                          style={{ filter: isInCall
                            ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)"
                            : "brightness(0) invert(0.6)"
                          }}
                        />
                      </button>
                      <button
                        onClick={handleVideoCall}
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                        title={activeCall?.conversationId === activeConvId && activeCall?.isVideoOn ? "Turn Camera Off" : "Start Video Call"}
                        style={{ backgroundColor: activeCall?.conversationId === activeConvId && activeCall?.isVideoOn ? "var(--app-hover)" : undefined }}
                      >
                        <img
                          src={videoIcon}
                          alt="Video"
                          className="h-5 w-5"
                          style={{
                            filter: activeCall?.conversationId === activeConvId && activeCall?.isVideoOn
                              ? "brightness(0) saturate(100%) invert(58%) sepia(43%) saturate(540%) hue-rotate(85deg) brightness(94%) contrast(85%)"
                              : "brightness(0) invert(0.6)"
                          }}
                        />
                      </button>
                    </>
                  )}
                  {activeConv.is_group && (
                    <>
                      <button
                        onClick={handleVoiceCall}
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                        title={isInCall ? "Leave Group Call" : "Start Group Call"}
                      >
                        <img
                          src={isInCall ? callEndIcon : callIcon}
                          alt={isInCall ? "Leave Call" : "Call"}
                          className="h-5 w-5"
                          style={{ filter: isInCall
                            ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)"
                            : "brightness(0) invert(0.6)"
                          }}
                        />
                      </button>
                      <button
                        onClick={async () => {
                          if (groupCall.activeCall?.conversationId !== activeConvId) {
                            const memberIds = activeConv.members.map((m) => m.user_id);
                            const callName = activeConv.name?.trim() || activeConv.members.map((m) => m.display_name).join(", ");
                            await groupCall.startCall(activeConvId!, callName, memberIds);
                          }
                          await groupCall.toggleVideo();
                        }}
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                        title={groupCall.localVideoStream ? "Turn Camera Off" : "Turn Camera On"}
                        style={{ backgroundColor: groupCall.localVideoStream ? "var(--app-hover)" : undefined }}
                      >
                        <img
                          src={videoIcon}
                          alt="Video"
                          className="h-5 w-5"
                          style={{
                            filter: groupCall.localVideoStream
                              ? "brightness(0) saturate(100%) invert(58%) sepia(43%) saturate(540%) hue-rotate(85deg) brightness(94%) contrast(85%)"
                              : "brightness(0) invert(0.6)",
                          }}
                        />
                      </button>
                      <button
                        onClick={() => setShowMembersPanel((prev) => !prev)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                        title={showMembersPanel ? "Hide Members" : "Show Members"}
                        style={{ backgroundColor: showMembersPanel ? "var(--app-hover)" : undefined }}
                      >
                        <img src={friendsIcon} alt="Members" className="h-5 w-5 invert opacity-60" />
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4">{renderHeader()}</div>
                <div className="flex items-center gap-3" style={{ color: "var(--app-text-secondary)" }}>
                  {!activeNowOpen && !isDM && !isShop && (
                    <button
                      onClick={() => setActiveNowOpen(true)}
                      className="transition-opacity duration-200 animate-fade-in"
                      title="Show Active Now"
                    >
                      <img src={activityIcon} alt="Activity" className="h-5 w-5 invert opacity-60 hover:opacity-100 transition-opacity cursor-pointer" />
                    </button>
                  )}
                  <img src={messagesInboxIcon} alt="Inbox" className="h-5 w-5 cursor-pointer invert opacity-60 hover:opacity-100 transition-opacity" />
                </div>
              </>
            )}
          </div>

          {renderContent()}
        </div>
      </div>

      <VoiceCallOverlay />

      <CreateGroupModal
        isOpen={createGroupOpen}
        onClose={() => setCreateGroupOpen(false)}
        onCreated={(convId) => {
          navigate(`/@me/chat/${convId}`, { replace: true });
        }}
        createGroupConversation={createGroupConversation}
      />
    </div>
  );
};

/** Lightweight wrapper to render the group members list inside the mobile slide-out panel. */
const MembersPanelWrapper = ({ conversation, onClose }: { conversation: any; onClose: () => void }) => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-14 border-b shrink-0" style={{ borderColor: "var(--app-border)" }}>
        <span className="font-semibold text-sm" style={{ color: "var(--app-text-primary)" }}>Members</span>
        <button onClick={onClose} className="text-sm" style={{ color: "var(--app-text-secondary)" }}>Close</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <GroupMembersPanel conversation={conversation} onClose={onClose} onLeftGroup={onClose} />
      </div>
    </div>
  );
};

export default AppLayout;
