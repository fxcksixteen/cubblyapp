import { useAuth } from "@/contexts/AuthContext";
import { Hash, Mic, Headphones, Settings, Plus, Gift, Sticker, SmilePlus, Search, Inbox, Users, Pin, LogOut } from "lucide-react";

const servers = [
  { id: "home", label: "Home", color: "#5865f2" },
  { id: "s1", label: "C", color: "#3ba55c" },
  { id: "s2", label: "G", color: "#faa61a" },
];

const channels = [
  { id: "general", name: "general", category: "TEXT CHANNELS" },
  { id: "welcome", name: "welcome", category: "TEXT CHANNELS" },
  { id: "memes", name: "memes", category: "FUN" },
  { id: "music", name: "music", category: "FUN" },
];

const groupedChannels = channels.reduce<Record<string, typeof channels>>((acc, ch) => {
  (acc[ch.category] ??= []).push(ch);
  return acc;
}, {});

const AppLayout = () => {
  const { user, signOut } = useAuth();
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#313338] text-[#dbdee1]">
      {/* Server sidebar */}
      <div className="flex w-[72px] flex-shrink-0 flex-col items-center gap-2 bg-[#1e1f22] py-3">
        {servers.map((s) => (
          <button
            key={s.id}
            className="group relative flex h-12 w-12 items-center justify-center rounded-[24px] transition-all duration-200 hover:rounded-[16px]"
            style={{ backgroundColor: s.color }}
          >
            <span className="text-sm font-semibold text-white">{s.label === "Home" ? "🏠" : s.label}</span>
            <div className="absolute left-0 h-0 w-1 rounded-r-full bg-white transition-all group-hover:h-5" />
          </button>
        ))}
        <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />
        <button className="flex h-12 w-12 items-center justify-center rounded-[24px] bg-[#313338] text-[#3ba55c] transition-all hover:rounded-[16px] hover:bg-[#3ba55c] hover:text-white">
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Channel sidebar */}
      <div className="flex w-60 flex-shrink-0 flex-col bg-[#2b2d31]">
        {/* Server header */}
        <div className="flex h-12 items-center border-b border-[#1f2023] px-4 font-semibold text-white shadow-sm">
          Cubbly
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto px-2 pt-4">
          {Object.entries(groupedChannels).map(([category, chs]) => (
            <div key={category} className="mb-4">
              <h3 className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">
                {category}
              </h3>
              {chs.map((ch) => (
                <button
                  key={ch.id}
                  className="flex w-full items-center gap-1.5 rounded-[4px] px-2 py-1.5 text-[15px] font-medium text-[#949ba4] transition-colors hover:bg-[#35373c] hover:text-[#dbdee1]"
                >
                  <Hash className="h-5 w-5 shrink-0 text-[#80848e]" />
                  {ch.name}
                </button>
              ))}
            </div>
          ))}
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

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Chat header */}
        <div className="flex h-12 items-center justify-between border-b border-[#1f2023] px-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Hash className="h-5 w-5 text-[#80848e]" />
            <span className="font-semibold text-white">general</span>
          </div>
          <div className="flex items-center gap-4 text-[#b5bac1]">
            <Pin className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
            <Users className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
            <Search className="h-4 w-4 cursor-pointer hover:text-[#dbdee1]" />
            <Inbox className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
          </div>
        </div>

        {/* Messages area */}
        <div className="flex flex-1 flex-col justify-end overflow-y-auto px-4 pb-6">
          <div className="mb-4 pt-8">
            <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-[#5865f2]">
              <Hash className="h-10 w-10 text-white" />
            </div>
            <h2 className="mt-2 text-3xl font-bold text-white">Welcome to #general!</h2>
            <p className="mt-1 text-[#949ba4]">This is the start of the #general channel.</p>
          </div>
        </div>

        {/* Message input */}
        <div className="px-4 pb-6">
          <div className="flex items-center gap-2 rounded-lg bg-[#383a40] px-4 py-2.5">
            <Plus className="h-5 w-5 cursor-pointer text-[#b5bac1] hover:text-[#dbdee1]" />
            <input
              type="text"
              placeholder="Message #general"
              className="flex-1 border-none bg-transparent text-base text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
            />
            <div className="flex items-center gap-3 text-[#b5bac1]">
              <Gift className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
              <Sticker className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
              <SmilePlus className="h-5 w-5 cursor-pointer hover:text-[#dbdee1]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
