import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useConversations } from "@/hooks/useConversations";
import { useVoice } from "@/contexts/VoiceContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getProfileColor } from "@/lib/profileColors";
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
import friendsIcon from "@/assets/icons/friends.svg";

type FriendTab = "online" | "all" | "pending" | "blocked" | "add";

const statusColors: Record<string, string> = {
  online: "online",
  idle: "idle",
  dnd: "dnd",
  invisible: "invisible",
  offline: "offline",
};

const BOT_USER_ID = "00000000-0000-0000-0000-000000000001";

const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { activeCall, startCall, endCall } = useVoice();

  const pathParts = location.pathname.split("/").filter(Boolean);
  const isChatRoute = pathParts[1] === "chat" && pathParts[2];
  const chatIdFromUrl = isChatRoute ? pathParts[2] : null;
  const urlTab = pathParts[1] as FriendTab | undefined;
  const validTabs: FriendTab[] = ["online", "all", "pending", "blocked", "add"];
  const friendTab: FriendTab = urlTab && validTabs.includes(urlTab) ? urlTab : "online";

  const { conversations, openOrCreateConversation, closeConversation, refetch: refetchConvs } = useConversations();
  const [tempDMs, setTempDMs] = useState<string[]>([]);

  useEffect(() => {
    if (location.pathname === "/@me" || location.pathname === "/@me/") {
      navigate("/@me/online", { replace: true });
    }
  }, [location.pathname, navigate]);

  const activeView = chatIdFromUrl ? `dm:${chatIdFromUrl}` : pathParts[1] === "shop" ? "shop" : "friends";

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
  const activeConvId = isDM ? activeView.replace("dm:", "") : null;
  const activeConv = conversations.find((conversation) => conversation.id === activeConvId);
  const activeParticipant = activeConv?.participant;

  const visibleConversations = conversations.filter(
    (conversation) => conversation.lastMessage || tempDMs.includes(conversation.id) || conversation.id === activeConvId,
  );

  const isInCall = activeCall?.conversationId === activeConvId;

  const currentUsername = user?.user_metadata?.username?.toLowerCase() || "";
  const isAdmin = currentUsername === "kaszy";

  const handleVoiceCall = async () => {
    if (isInCall) {
      endCall();
    } else if (activeParticipant) {
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

  const renderHeader = () => {
    if (isShop) {
      return <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Shop</span>;
    }

    return (
      <>
        <div className="flex items-center gap-2">
          <img src={friendsIcon} alt="" className="h-5 w-5 invert opacity-60" />
          <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>Friends</span>
        </div>
        <div className="h-6 w-px bg-[#3f4147]" />
        <div className="flex items-center gap-1">
          {(["online", "all", "pending", "blocked"] as FriendTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFriendTab(tab)}
              className={`rounded px-2.5 py-1 text-sm font-medium capitalize transition-colors ${
                friendTab === tab && activeView === "friends"
                  ? "bg-[#404249] text-white"
                  : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]"
              }`}
            >
              {tab}
            </button>
          ))}
          <button
            onClick={() => setFriendTab("add")}
            className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
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
    if (isDM && activeConvId) {
      return (
        <ChatView
          conversationId={activeConvId}
          recipientName={activeParticipant?.display_name || "User"}
          recipientAvatar={activeParticipant?.avatar_url || undefined}
          recipientUserId={activeParticipant?.user_id}
        />
      );
    }

    if (isShop) {
      return <ShopView />;
    }

    return <FriendsView activeTab={friendTab} setActiveTab={setFriendTab} onOpenDM={handleOpenDM} />;
  };

  const participantColor = activeParticipant ? getProfileColor(activeParticipant.user_id) : null;

  return (
    <div className="app-themed flex h-screen w-full overflow-hidden font-body" style={{ backgroundColor: "var(--app-bg-primary)", color: "var(--app-text-primary)" }}>
      <ServerSidebar isActive onHomeClick={() => {}} />

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
      />

      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center justify-between border-b px-5 shadow-sm" style={{ backgroundColor: "var(--app-bg-primary)", borderColor: "var(--app-border)" }}>
          {isDM && activeConvId ? (
            <>
              <div className="flex items-center gap-3">
                <div className="relative">
                  {activeParticipant?.avatar_url ? (
                    <img src={activeParticipant.avatar_url} alt={activeParticipant.display_name} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: participantColor?.bg || "#5865f2" }}
                    >
                      {(activeParticipant?.display_name || "User").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <StatusIndicator status={activeParticipant?.status || "offline"} size="sm" borderColor="var(--app-bg-primary)" />
                  </div>
                </div>
                <span className="text-[15px] font-semibold" style={{ color: "var(--app-text-primary)" }}>
                  {activeParticipant?.display_name || "Conversation"}
                </span>
              </div>
              <div className="flex items-center gap-4" style={{ color: "var(--app-text-secondary)" }}>
                <button
                  onClick={handleVoiceCall}
                  className="transition-all hover:opacity-100"
                  style={{ opacity: isInCall ? 1 : 0.9 }}
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
                <button className="transition-opacity hover:opacity-100" style={{ opacity: 0.9 }} title="Start Video Call">
                  <img src={videoIcon} alt="Video" className="h-5 w-5" style={{ filter: "brightness(0) invert(0.6)" }} />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">{renderHeader()}</div>
              <div className="flex items-center gap-3" style={{ color: "var(--app-text-secondary)" }}>
                <img src={messagesInboxIcon} alt="Inbox" className="h-5 w-5 cursor-pointer invert opacity-60 hover:opacity-100 transition-opacity" />
              </div>
            </>
          )}
        </div>

        {renderContent()}
      </div>

      <VoiceCallOverlay />
    </div>
  );
};

export default AppLayout;
