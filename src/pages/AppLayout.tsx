import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Hash, Mic, Headphones, Plus, SmilePlus, Search, Inbox,
  Users, LogOut, MessageSquare, Compass, ShoppingBag,
  UserPlus, MoreVertical, X, Check, Clock
} from "lucide-react";

type FriendTab = "online" | "all" | "pending" | "blocked" | "add";

interface Friend {
  id: string;
  name: string;
  username: string;
  status: "online" | "idle" | "dnd" | "offline";
  activity?: string;
  avatar: string;
}

const mockFriends: Friend[] = [
  { id: "1", name: "Maple", username: "maple_bear", status: "online", activity: "Playing Minecraft", avatar: "🍁" },
  { id: "2", name: "Honey", username: "honeybee42", status: "online", activity: "Listening to Spotify", avatar: "🍯" },
  { id: "3", name: "Cocoa", username: "cocoa_puff", status: "idle", avatar: "🍫" },
  { id: "4", name: "Biscuit", username: "biscuit_boy", status: "dnd", activity: "Do Not Disturb", avatar: "🍪" },
  { id: "5", name: "Nutmeg", username: "nutmeg99", status: "offline", avatar: "🌰" },
  { id: "6", name: "Cinnamon", username: "cinnamon_roll", status: "offline", avatar: "🫚" },
];

const statusColors: Record<string, string> = {
  online: "bg-[#3ba55c]",
  idle: "bg-[#faa61a]",
  dnd: "bg-[#ed4245]",
  offline: "bg-[#747f8d]",
};

const dmChannels = [
  { id: "dm1", name: "Maple", avatar: "🍁", status: "online" as const },
  { id: "dm2", name: "Honey", avatar: "🍯", status: "online" as const },
  { id: "dm3", name: "Cocoa", avatar: "🍫", status: "idle" as const },
];

const navItems = [
  { id: "friends" as const, icon: Users, label: "Friends" },
  { id: "nitro" as const, icon: ShoppingBag, label: "Shop" },
];

const AppLayout = () => {
  const { user, signOut } = useAuth();
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();
  const [activeTab, setActiveTab] = useState<FriendTab>("online");
  const [activeView, setActiveView] = useState<"friends" | "nitro" | string>("friends");
  const [addFriendInput, setAddFriendInput] = useState("");

  const filteredFriends = mockFriends.filter((f) => {
    if (activeTab === "online") return f.status !== "offline";
    if (activeTab === "all") return true;
    if (activeTab === "pending") return false;
    if (activeTab === "blocked") return false;
    return true;
  });

  const onlineCount = mockFriends.filter((f) => f.status !== "offline").length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#313338] text-[#dbdee1] font-body">
      {/* Server sidebar */}
      <div className="flex w-[72px] flex-shrink-0 flex-col items-center gap-2 bg-[#1e1f22] py-3">
        {/* Home / DM button */}
        <button
          onClick={() => setActiveView("friends")}
          className="group relative flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] transition-all duration-200 hover:rounded-[16px] hover:bg-[#5865f2]"
        >
          <MessageSquare className="h-5 w-5 text-[#dbdee1]" />
          <div className="absolute left-0 h-0 w-1 rounded-r-full bg-foreground transition-all group-hover:h-5" />
        </button>

        <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

        {/* Discover */}
        <button className="group relative flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#3ba55c] transition-all duration-200 hover:rounded-[16px] hover:bg-[#3ba55c] hover:text-white">
          <Compass className="h-5 w-5" />
        </button>

        <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

        {/* Add server */}
        <button className="group flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#3ba55c] transition-all hover:rounded-[16px] hover:bg-[#3ba55c] hover:text-white">
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* DM / Navigation sidebar */}
      <div className="flex w-60 flex-shrink-0 flex-col bg-[#2b2d31]">
        {/* Search bar */}
        <button className="mx-2 mt-2 flex h-7 items-center rounded px-2 text-xs text-[#949ba4] bg-[#1e1f22] hover:bg-[#1a1b1e] transition-colors">
          Find or start a conversation
        </button>

        <div className="flex-1 overflow-y-auto px-2 pt-3">
          {/* Nav items */}
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`flex w-full items-center gap-3 rounded-[4px] px-3 py-2 text-[15px] font-medium transition-colors ${
                activeView === item.id
                  ? "bg-[#404249] text-white"
                  : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
              }`}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {item.label}
              {item.id === "friends" && onlineCount > 0 && (
                <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ed4245] px-1 text-[10px] font-bold text-white">
                  {onlineCount}
                </span>
              )}
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
            {dmChannels.map((dm) => (
              <button
                key={dm.id}
                onClick={() => setActiveView(dm.id)}
                className={`group flex w-full items-center gap-3 rounded-[4px] px-2 py-1.5 transition-colors ${
                  activeView === dm.id
                    ? "bg-[#404249] text-white"
                    : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
                }`}
              >
                <div className="relative">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-sm">
                    {dm.avatar}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-[#2b2d31] ${statusColors[dm.status]}`} />
                </div>
                <span className="truncate text-sm font-medium">{dm.name}</span>
                <X className="ml-auto h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 text-[#949ba4] hover:text-[#dbdee1]" />
              </button>
            ))}
          </div>
        </div>

        {/* User panel */}
        <div className="flex items-center gap-2 bg-[#232428] px-2 py-1">
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-xs font-bold text-white">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#232428] bg-[#3ba55c]" />
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-semibold text-white leading-tight">{displayName}</p>
            <p className="truncate text-[11px] text-[#949ba4] leading-tight">{username}</p>
          </div>
          <div className="flex items-center gap-1">
            <button className="rounded p-1 text-[#b5bac1] hover:bg-[#35373c]"><Mic className="h-4 w-4" /></button>
            <button className="rounded p-1 text-[#b5bac1] hover:bg-[#35373c]"><Headphones className="h-4 w-4" /></button>
            <button onClick={signOut} className="rounded p-1 text-[#b5bac1] hover:bg-[#35373c]" title="Log out"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-[#1f2023] px-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#80848e]" />
              <span className="font-semibold text-white">Friends</span>
            </div>
            <div className="h-6 w-px bg-[#3f4147]" />
            <div className="flex items-center gap-1">
              {(["online", "all", "pending", "blocked"] as FriendTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setActiveView("friends"); }}
                  className={`rounded px-2.5 py-1 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab
                      ? "bg-[#404249] text-white"
                      : "text-[#b5bac1] hover:bg-[#35373c] hover:text-[#dbdee1]"
                  }`}
                >
                  {tab}
                </button>
              ))}
              <button
                onClick={() => { setActiveTab("add"); setActiveView("friends"); }}
                className={`rounded px-2.5 py-1 text-sm font-medium transition-colors ${
                  activeTab === "add"
                    ? "bg-transparent text-[#3ba55c]"
                    : "bg-[#3ba55c] text-white hover:bg-[#2d8b4e]"
                }`}
              >
                Add Friend
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[#b5bac1]">
            <Inbox className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Friends list */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {activeTab === "add" ? (
              <div className="mb-4">
                <h2 className="text-base font-semibold text-white">Add Friend</h2>
                <p className="mt-1 text-sm text-[#b5bac1]">You can add friends with their Cubbly username.</p>
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#1e1f22] bg-[#1e1f22] px-4 py-3">
                  <input
                    type="text"
                    value={addFriendInput}
                    onChange={(e) => setAddFriendInput(e.target.value)}
                    placeholder="You can add friends with their Cubbly username."
                    className="flex-1 bg-transparent text-sm text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
                  />
                  <button
                    disabled={!addFriendInput.trim()}
                    className="rounded-[3px] bg-[#5865f2] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50"
                  >
                    Send Friend Request
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="mb-3">
                  <div className="flex items-center rounded-[4px] bg-[#1e1f22] px-2 py-1.5">
                    <input
                      type="text"
                      placeholder="Search"
                      className="flex-1 bg-transparent text-sm text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
                    />
                    <Search className="h-4 w-4 text-[#949ba4]" />
                  </div>
                </div>

                <h3 className="mb-2 px-0.5 text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">
                  {activeTab === "online" ? `Online — ${filteredFriends.length}` :
                   activeTab === "all" ? `All Friends — ${filteredFriends.length}` :
                   activeTab === "pending" ? "Pending — 0" : "Blocked — 0"}
                </h3>

                {filteredFriends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="text-5xl mb-3">
                      {activeTab === "pending" ? "📬" : activeTab === "blocked" ? "🚫" : "😴"}
                    </div>
                    <p className="text-sm text-[#949ba4]">
                      {activeTab === "pending"
                        ? "There are no pending friend requests. Here's Wumpus for now."
                        : activeTab === "blocked"
                        ? "You can't unblock the Wumpus."
                        : "No one's around to play with Wumpus."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {filteredFriends.map((friend) => (
                      <div
                        key={friend.id}
                        className="group flex items-center gap-3 rounded-lg border-t border-[#3f4147] px-2 py-3 transition-colors hover:bg-[#404249]"
                      >
                        <div className="relative">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-base">
                            {friend.avatar}
                          </div>
                          <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-[#313338] group-hover:border-[#404249] ${statusColors[friend.status]}`} />
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-semibold text-white leading-tight">{friend.name}</p>
                          <p className="truncate text-xs text-[#949ba4] leading-tight">
                            {friend.activity || (friend.status === "idle" ? "Idle" : friend.status === "dnd" ? "Do Not Disturb" : friend.status === "offline" ? "Offline" : "Online")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#b5bac1] hover:text-[#dbdee1]">
                            <MessageSquare className="h-4 w-4" />
                          </button>
                          <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#b5bac1] hover:text-[#dbdee1]">
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Active Now sidebar */}
          <div className="hidden xl:flex w-[340px] flex-shrink-0 flex-col border-l border-[#3f4147] px-4 py-4">
            <h3 className="mb-4 text-xl font-bold text-white">Active Now</h3>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-white">It's quiet for now...</p>
              <p className="mt-1 text-sm text-[#949ba4]">
                When a friend starts an activity—like playing a game or hanging out on voice—we'll show it here!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
