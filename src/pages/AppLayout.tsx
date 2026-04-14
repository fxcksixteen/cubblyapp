import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useConversations } from "@/hooks/useConversations";
import { Inbox, Phone, Video } from "lucide-react";
import ServerSidebar from "@/components/app/ServerSidebar";
import DMSidebar from "@/components/app/DMSidebar";
import FriendsView from "@/components/app/FriendsView";
import ChatView from "@/components/app/ChatView";
import ShopView from "@/components/app/ShopView";
import friendsIcon from "@/assets/icons/friends.svg";

type FriendTab = "online" | "all" | "pending" | "blocked" | "add";

const AppLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const pathParts = location.pathname.split("/").filter(Boolean);
  
  // Parse route: /@me/chat/:id or /@me/:tab
  const isChatRoute = pathParts[1] === "chat" && pathParts[2];
  const chatIdFromUrl = isChatRoute ? pathParts[2] : null;
  const urlTab = pathParts[1] as FriendTab | undefined;
  const validTabs: FriendTab[] = ["online", "all", "pending", "blocked", "add"];
  const friendTab: FriendTab = urlTab && validTabs.includes(urlTab) ? urlTab : "online";

  const { conversations, openOrCreateConversation, closeConversation, refetch: refetchConvs } = useConversations();
  
  // Temporary DMs that haven't been messaged yet (shown in sidebar but can be closed)
  const [tempDMs, setTempDMs] = useState<string[]>([]);

  // Derive activeView from URL
  const activeView = chatIdFromUrl ? `dm:${chatIdFromUrl}` : 
    (pathParts[1] === "shop" ? "shop" : "friends");

  const setFriendTab = (tab: FriendTab) => {
    navigate(`/@me/${tab}`, { replace: true });
  };

  const handleOpenDM = async (userId: string) => {
    const convId = await openOrCreateConversation(userId);
    if (convId) {
      // Add to temp DMs so it shows in sidebar immediately
      setTempDMs(prev => prev.includes(convId) ? prev : [...prev, convId]);
      navigate(`/@me/chat/${convId}`, { replace: true });
      await refetchConvs();
    }
  };

  const handleCloseConversation = (convId: string) => {
    // Only allow closing if no messages exist, otherwise just remove from temp
    const conv = conversations.find(c => c.id === convId);
    if (conv && !conv.lastMessage) {
      // No messages - remove entirely
      closeConversation(convId);
      setTempDMs(prev => prev.filter(id => id !== convId));
    } else {
      // Has messages - still close from sidebar view
      closeConversation(convId);
    }
    if (chatIdFromUrl === convId) {
      navigate("/@me", { replace: true });
    }
  };

  const isDM = activeView.startsWith("dm:");
  const isShop = activeView === "shop";
  const activeConvId = isDM ? activeView.replace("dm:", "") : null;
  const activeConv = conversations.find(c => c.id === activeConvId);

  // Merge conversations: show all with messages + temp DMs without messages
  const visibleConversations = conversations.filter(c => 
    c.lastMessage || tempDMs.includes(c.id)
  );

  const renderHeader = () => {
    if (isDM && activeConv) {
      return null; // DM header is rendered separately below
    }
    if (isShop) {
      return <span className="font-semibold text-white">Shop</span>;
    }
    return (
      <>
        <div className="flex items-center gap-2">
          <img src={friendsIcon} alt="" className="h-5 w-5 invert opacity-60" />
          <span className="font-semibold text-white">Friends</span>
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
          recipientName={activeConv?.participant.display_name || "User"}
          recipientAvatar={activeConv?.participant.avatar_url || undefined}
        />
      );
    }
    if (isShop) {
      return <ShopView />;
    }
    return (
      <FriendsView
        activeTab={friendTab}
        setActiveTab={setFriendTab}
        onOpenDM={handleOpenDM}
      />
    );
  };

  return (
    <div className="app-themed flex h-screen w-full overflow-hidden bg-[#313338] text-[#dbdee1] font-body">
      <ServerSidebar onHomeClick={() => navigate("/@me", { replace: true })} />

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
            navigate("/@me", { replace: true });
          }
        }}
        onCloseConversation={handleCloseConversation}
        onOpenDM={handleOpenDM}
      />

      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-[#1f2023] px-4 shadow-sm">
          {isDM && activeConv ? (
            <>
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#5865f2] text-xs font-bold text-white">
                    {activeConv.participant.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#313338] ${
                    activeConv.participant.status === "online" ? "bg-[#3ba55c]" :
                    activeConv.participant.status === "idle" ? "bg-[#faa61a]" :
                    activeConv.participant.status === "dnd" ? "bg-[#ed4245]" : "bg-[#747f8d]"
                  }`} />
                </div>
                <span className="font-semibold text-white text-sm">{activeConv.participant.display_name}</span>
              </div>
              <div className="flex items-center gap-3 text-[#b5bac1]">
                <button className="hover:text-[#dbdee1] transition-colors" title="Start Voice Call">
                  <Phone className="h-5 w-5" />
                </button>
                <button className="hover:text-[#dbdee1] transition-colors" title="Start Video Call">
                  <Video className="h-5 w-5" />
                </button>
                <Inbox className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-4">
                {renderHeader()}
              </div>
              <div className="flex items-center gap-4 text-[#b5bac1]">
                <Inbox className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
              </div>
            </>
          )}
        </div>

        {renderContent()}
      </div>
    </div>
  );
};

export default AppLayout;
