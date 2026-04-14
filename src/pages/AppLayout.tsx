import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useConversations } from "@/hooks/useConversations";
import { Users, Inbox, Hash } from "lucide-react";
import ServerSidebar from "@/components/app/ServerSidebar";
import DMSidebar from "@/components/app/DMSidebar";
import FriendsView from "@/components/app/FriendsView";
import ChatView from "@/components/app/ChatView";

type FriendTab = "online" | "all" | "pending" | "blocked" | "add";

const AppLayout = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive friend tab from URL
  const pathParts = location.pathname.split("/").filter(Boolean);
  const urlTab = pathParts[1] as FriendTab | undefined;
  const validTabs: FriendTab[] = ["online", "all", "pending", "blocked", "add"];
  const friendTab: FriendTab = urlTab && validTabs.includes(urlTab) ? urlTab : "online";

  const { conversations, openOrCreateConversation, closeConversation, refetch: refetchConvs } = useConversations();
  const [activeView, setActiveView] = useState<string>("friends");

  const setFriendTab = (tab: FriendTab) => {
    navigate(`/@me/${tab}`, { replace: true });
    setActiveView("friends");
  };

  const handleOpenDM = async (userId: string) => {
    const convId = await openOrCreateConversation(userId);
    if (convId) {
      setActiveView(`dm:${convId}`);
      await refetchConvs();
    }
  };

  const handleCloseConversation = (convId: string) => {
    closeConversation(convId);
    if (activeView === `dm:${convId}`) {
      setActiveView("friends");
    }
  };

  const isDM = activeView.startsWith("dm:");
  const activeConvId = isDM ? activeView.replace("dm:", "") : null;
  const activeConv = conversations.find(c => c.id === activeConvId);

  return (
    <div className="app-themed flex h-screen w-full overflow-hidden bg-[#313338] text-[#dbdee1] font-body">
      {/* Server sidebar */}
      <ServerSidebar onHomeClick={() => { setActiveView("friends"); navigate("/@me", { replace: true }); }} />

      {/* DM sidebar */}
      <DMSidebar
        conversations={conversations}
        activeView={activeView}
        setActiveView={setActiveView}
        onCloseConversation={handleCloseConversation}
        onOpenDM={handleOpenDM}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-[#1f2023] px-4 shadow-sm">
          <div className="flex items-center gap-4">
            {isDM && activeConv ? (
              <div className="flex items-center gap-2">
                <span className="text-[#80848e]">@</span>
                <span className="font-semibold text-white">{activeConv.participant.display_name}</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#80848e]" />
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
            )}
          </div>
          <div className="flex items-center gap-4 text-[#b5bac1]">
            <Inbox className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
          </div>
        </div>

        {/* Content */}
        {isDM && activeConvId ? (
          <ChatView
            conversationId={activeConvId}
            recipientName={activeConv?.participant.display_name || "User"}
            recipientAvatar={activeConv?.participant.avatar_url || undefined}
          />
        ) : (
          <FriendsView
            activeTab={friendTab}
            setActiveTab={setFriendTab}
            onOpenDM={handleOpenDM}
          />
        )}
      </div>
    </div>
  );
};

export default AppLayout;
