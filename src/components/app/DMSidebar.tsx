import { useAuth } from "@/contexts/AuthContext";
import { Conversation } from "@/hooks/useConversations";
import { Plus, X, Users, ShoppingBag, Mic, Headphones, LogOut } from "lucide-react";
import cubblyWordmark from "@/assets/cubbly-wordmark.png";

interface DMSidebarProps {
  conversations: Conversation[];
  activeView: string;
  setActiveView: (view: string) => void;
  onCloseConversation: (convId: string) => void;
}

const statusColors: Record<string, string> = {
  online: "bg-[#3ba55c]",
  idle: "bg-[#faa61a]",
  dnd: "bg-[#ed4245]",
  offline: "bg-[#747f8d]",
};

const DMSidebar = ({ conversations, activeView, setActiveView, onCloseConversation }: DMSidebarProps) => {
  const { user, signOut } = useAuth();
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();

  const navItems = [
    { id: "friends", icon: Users, label: "Friends" },
    { id: "shop", icon: ShoppingBag, label: "Shop" },
  ];

  return (
    <div className="flex w-60 flex-shrink-0 flex-col bg-[#2b2d31]">
      {/* Search bar */}
      <button className="mx-2 mt-2 flex h-7 items-center rounded px-2 text-xs text-[#949ba4] bg-[#1e1f22] hover:bg-[#1a1b1e] transition-colors">
        Find or start a conversation
      </button>

      <div className="flex-1 overflow-y-auto px-2 pt-3">
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
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveView(`dm:${conv.id}`)}
              className={`group flex w-full items-center gap-3 rounded-[4px] px-2 py-1.5 transition-colors ${
                activeView === `dm:${conv.id}`
                  ? "bg-[#404249] text-white"
                  : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
              }`}
            >
              <div className="relative">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-sm font-bold text-white">
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
  );
};

export default DMSidebar;
