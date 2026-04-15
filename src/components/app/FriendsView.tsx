import { useState } from "react";
import { useFriends, Friendship } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import {
  Check, X, UserX, UserMinus
} from "lucide-react";
import messagesIcon from "@/assets/icons/messages.svg";
import searchIcon from "@/assets/icons/search.svg";

type FriendTab = "online" | "all" | "pending" | "blocked" | "add";

interface FriendsViewProps {
  activeTab: FriendTab;
  setActiveTab: (tab: FriendTab) => void;
  onOpenDM: (userId: string) => void;
}

const statusColors: Record<string, string> = {
  online: "bg-[#3ba55c]",
  idle: "bg-[#faa61a]",
  dnd: "bg-[#ed4245]",
  offline: "bg-[#747f8d]",
};

const FriendsView = ({ activeTab, setActiveTab, onOpenDM }: FriendsViewProps) => {
  const { user } = useAuth();
  const { friends, pending, blocked, sendFriendRequest, acceptRequest, declineRequest, unblockUser, removeFriend } = useFriends();
  const [addInput, setAddInput] = useState("");
  const [addStatus, setAddStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSendRequest = async () => {
    if (!addInput.trim()) return;
    setAddStatus(null);
    const result = await sendFriendRequest(addInput);
    if (result.error) {
      setAddStatus({ type: "error", msg: result.error });
    } else {
      setAddStatus({ type: "success", msg: `Friend request sent to ${addInput}!` });
      setAddInput("");
    }
  };

  const getDisplayList = (): Friendship[] => {
    let list: Friendship[] = [];
    if (activeTab === "online") list = friends.filter(f => f.profile.status !== "offline");
    else if (activeTab === "all") list = friends;
    else if (activeTab === "pending") list = pending;
    else if (activeTab === "blocked") list = blocked;

    if (searchQuery) {
      list = list.filter(f =>
        f.profile.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.profile.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return list;
  };

  const displayList = getDisplayList();

  const placeholderText = activeTab === "online" ? "Search online friends"
    : activeTab === "all" ? "Search all friends"
    : activeTab === "pending" ? "Search pending requests"
    : "Search blocked users";

  const renderFriendActions = (friendship: Friendship) => {
    if (activeTab === "pending") {
      const isIncoming = friendship.addressee_id === user?.id;
      return (
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
          {isIncoming && (
            <button
              onClick={() => acceptRequest(friendship.id)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#3ba55c] hover:text-white cubbly-3d-circle"
              title="Accept"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => declineRequest(friendship.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#ed4245] hover:text-white cubbly-3d-circle"
            title={isIncoming ? "Decline" : "Cancel"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      );
    }

    if (activeTab === "blocked") {
      return (
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            onClick={() => unblockUser(friendship.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#b5bac1] hover:text-[#dbdee1] cubbly-3d-circle"
            title="Unblock"
          >
            <UserX className="h-4 w-4" />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
        <button
          onClick={() => onOpenDM(friendship.profile.user_id)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#b5bac1] hover:bg-[#36393f] hover:text-[#dbdee1] transition-colors cubbly-3d-circle"
          title="Message"
        >
          <img src={messagesIcon} alt="Message" className="h-5 w-5 invert opacity-80" />
        </button>
        <button
          onClick={() => removeFriend(friendship.id)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2b2d31] text-[#b5bac1] hover:bg-[#ed4245]/20 hover:text-[#ed4245] transition-colors cubbly-3d-circle"
          title="Remove Friend"
        >
          <UserMinus className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === "add" ? (
          <div className="mb-4">
            <h2 className="text-base font-semibold text-white">Add Friend</h2>
            <p className="mt-1 text-sm text-[#b5bac1]">You can add friends with their Cubbly username.</p>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#1e1f22] bg-[#1e1f22] px-4 py-3">
              <input
                type="text"
                value={addInput}
                onChange={(e) => { setAddInput(e.target.value); setAddStatus(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleSendRequest()}
                placeholder="Enter a username..."
                className="flex-1 bg-transparent text-sm text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
              />
              <button
                onClick={handleSendRequest}
                disabled={!addInput.trim()}
                className="rounded-[3px] bg-[#5865f2] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50"
              >
                Send Friend Request
              </button>
            </div>
            {addStatus && (
              <p className={`mt-2 text-sm ${addStatus.type === "success" ? "text-[#3ba55c]" : "text-[#ed4245]"}`}>
                {addStatus.msg}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-3">
              <div
                className="flex h-8 items-center gap-2 rounded-full border px-3 cubbly-3d-pill"
                style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)" }}
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={placeholderText}
                  className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#6d6f78]"
                  style={{ color: "var(--app-text-primary)" }}
                />
                <img src={searchIcon} alt="" className="h-4 w-4 shrink-0 invert opacity-50" />
              </div>
            </div>

            <h3 className="mb-2 px-0.5 text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">
              {activeTab === "online" ? `Online — ${displayList.length}` :
               activeTab === "all" ? `All Friends — ${displayList.length}` :
               activeTab === "pending" ? `Pending — ${displayList.length}` :
               `Blocked — ${displayList.length}`}
            </h3>

            {displayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="text-5xl mb-3">
                  {activeTab === "pending" ? "📬" : activeTab === "blocked" ? "🚫" : activeTab === "online" ? "😴" : "👋"}
                </div>
                <p className="text-sm text-[#949ba4]">
                  {activeTab === "pending" ? "There are no pending friend requests."
                    : activeTab === "blocked" ? "You haven't blocked anyone."
                    : activeTab === "online" ? "No friends are online right now."
                    : "You don't have any friends yet. Add some!"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col">
                {displayList.map((friendship) => (
                  <div
                    key={friendship.id}
                    className="group flex items-center gap-3 rounded-lg border-t border-[#3f4147] px-2 py-3 transition-colors hover:bg-[#404249]"
                  >
                    <div className="relative">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5865f2] text-sm font-bold text-white">
                        {friendship.profile.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[2.5px] border-[#313338] group-hover:border-[#404249] ${statusColors[friendship.profile.status]}`} />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-semibold text-white leading-tight">{friendship.profile.display_name}</p>
                      <p className="truncate text-xs text-[#949ba4] leading-tight">
                        {activeTab === "pending"
                          ? (friendship.addressee_id === user?.id ? "Incoming Friend Request" : "Outgoing Friend Request")
                          : friendship.profile.status === "online" ? "Online"
                          : friendship.profile.status === "idle" ? "Idle"
                          : friendship.profile.status === "dnd" ? "Do Not Disturb"
                          : "Offline"}
                      </p>
                    </div>
                    {renderFriendActions(friendship)}
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
  );
};

export default FriendsView;
