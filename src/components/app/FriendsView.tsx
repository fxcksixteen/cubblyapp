import { useState, useMemo } from "react";
import { useFriends, Friendship } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import { useActivity } from "@/contexts/ActivityContext";
import { Check, X } from "lucide-react";
import { getProfileColor } from "@/lib/profileColors";
import { activityLabel } from "@/lib/activityLabel";
import messagesHoverIcon from "@/assets/icons/messages-3.svg";
import searchIcon from "@/assets/icons/search.svg";
import emptyPendingIcon from "@/assets/icons/empty-pending.svg";
import emptyBlockedIcon from "@/assets/icons/empty-blocked.svg";
import addUserIcon from "@/assets/icons/add-user.svg";
import removeUserIcon from "@/assets/icons/remove-user.svg";
import blockUserIcon from "@/assets/icons/block-user.svg";
import activityIcon from "@/assets/icons/activity.svg";
import StatusIndicator from "@/components/app/StatusIndicator";
import UserProfileCard from "@/components/app/chat/UserProfileCard";

type FriendTab = "online" | "all" | "pending" | "blocked" | "add";

interface FriendsViewProps {
  activeTab: FriendTab;
  setActiveTab: (tab: FriendTab) => void;
  onOpenDM: (userId: string) => void;
  activeNowOpen: boolean;
  setActiveNowOpen: (open: boolean) => void;
}

const CUBBLY_BOT_ID = "00000000-0000-0000-0000-000000000001";

const emptyMessages: Record<string, string[]> = {
  online: [
    "No one's around right now — perfect time for a cozy break",
    "It's just you and the quiet vibes for now",
    "Everyone's off adventuring — they'll be back soon",
    "The online list is taking a little nap right now",
  ],
  all: [
    "Your friend list is waiting for its first addition",
    "No friends yet — but every great friendship starts somewhere",
    "It's a bit empty here — go say hi to someone new",
    "Your cozy corner is ready for some friendly faces",
  ],
  pending: [
    "No friend requests right now — but good things come to those who wait",
    "Your inbox is all clear — nothing pending here",
    "No requests waiting — maybe it's time to reach out first",
    "All caught up on friend requests — nice and tidy",
  ],
  blocked: [
    "Your block list is squeaky clean — everyone's welcome in your cozy corner",
    "Nobody's been blocked — keeping it peaceful around here",
    "All clear here — no blocked users to worry about",
    "Your block list is empty — and that's a lovely thing",
  ],
};

const FriendsView = ({ activeTab, setActiveTab, onOpenDM, activeNowOpen, setActiveNowOpen }: FriendsViewProps) => {
  const { user, onlineUserIds } = useAuth();
  const { getActivity } = useActivity();
  const { friends, pending, blocked, sendFriendRequest, acceptRequest, declineRequest, unblockUser, removeFriend } = useFriends();
  const [addInput, setAddInput] = useState("");
  const [addStatus, setAddStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileCard, setProfileCard] = useState<{ userId: string; name: string; x: number; y: number } | null>(null);

  const randomMessage = useMemo(() => {
    const msgs = emptyMessages[activeTab] || emptyMessages.online;
    return msgs[Math.floor(Math.random() * msgs.length)];
  }, [activeTab]);

  const isActuallyOnline = (userId: string) => {
    return userId === CUBBLY_BOT_ID || onlineUserIds.has(userId);
  };

  const getEffectiveStatus = (friendship: Friendship) => {
    if (!isActuallyOnline(friendship.profile.user_id)) return "offline";
    return friendship.profile.status === "invisible" ? "online" : friendship.profile.status;
  };

  const getStatusLabel = (friendship: Friendship) => {
    const status = getEffectiveStatus(friendship);

    if (status === "idle") return "Idle";
    if (status === "dnd") return "Do Not Disturb";
    if (status === "online") return "Online";
    return "Offline";
  };

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
    if (activeTab === "online") list = friends.filter((f) => isActuallyOnline(f.profile.user_id));
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
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
          {isIncoming && (
            <button
              onClick={() => acceptRequest(friendship.id)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[#3ba55c] hover:text-white cubbly-3d-circle"
              style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}
              title="Accept"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => declineRequest(friendship.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#ed4245] hover:text-white cubbly-3d-circle"
            style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}
            title={isIncoming ? "Decline" : "Cancel"}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      );
    }

    if (activeTab === "blocked") {
      return (
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => unblockUser(friendship.id)}
            className="flex h-9 w-9 items-center justify-center rounded-full cubbly-3d-circle"
            style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)", color: "var(--app-text-secondary, #b5bac1)" }}
            title="Unblock"
          >
            <img src={blockUserIcon} alt="Unblock" className="h-4 w-4 invert opacity-70" />
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onOpenDM(friendship.profile.user_id)}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors cubbly-3d-circle"
          style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)", color: "var(--app-text-secondary, #b5bac1)" }}
          title="Message"
        >
          <img src={messagesHoverIcon} alt="Message" className="h-5 w-5 invert opacity-70 transition-opacity group-hover:opacity-100" />
        </button>
        <button
          onClick={() => removeFriend(friendship.id)}
          className="flex h-9 w-9 items-center justify-center rounded-full transition-colors cubbly-3d-circle hover:text-[#ed4245]"
          style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)", color: "var(--app-text-secondary, #b5bac1)" }}
          title="Remove Friend"
        >
          <img src={removeUserIcon} alt="Remove" className="h-4 w-4 invert opacity-70" />
        </button>
      </div>
    );
  };

  const emptyIcon = activeTab === "pending" ? emptyPendingIcon
    : activeTab === "blocked" ? emptyBlockedIcon
    : activeTab === "online" ? emptyPendingIcon
    : emptyPendingIcon;

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === "add" ? (
          <div className="mb-4">
            <h2 className="text-base font-semibold text-white">Add Friend</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--app-text-secondary, #b5bac1)" }}>You can add friends with their Cubbly username.</p>
            <div className="mt-4 flex items-center gap-2 rounded-lg border px-4 py-3" style={{ borderColor: "var(--app-border, #1e1f22)", backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
              <input
                type="text"
                value={addInput}
                onChange={(e) => { setAddInput(e.target.value); setAddStatus(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleSendRequest()}
                placeholder="Enter a username..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#6d6f78]"
                style={{ color: "var(--app-text-primary, #dbdee1)" }}
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

            <h3 className="mb-2 px-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
              {activeTab === "online" ? `Online — ${displayList.length}` :
               activeTab === "all" ? `All Friends — ${displayList.length}` :
               activeTab === "pending" ? `Pending — ${displayList.length}` :
               `Blocked — ${displayList.length}`}
            </h3>

            {displayList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <img src={emptyIcon} alt="" className="mb-3 h-14 w-14 invert opacity-30" />
                <p className="text-sm" style={{ color: "var(--app-text-secondary, #949ba4)" }}>{randomMessage}</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {displayList.map((friendship) => (
                  <div
                    key={friendship.id}
                    className="group flex items-center gap-3 rounded-lg border-t px-2 py-3 transition-colors cursor-pointer"
                    style={{ borderColor: "var(--app-border, #3f4147)" }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-active, #404249)"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                    onClick={(e) => {
                      setProfileCard({
                        userId: friendship.profile.user_id,
                        name: friendship.profile.display_name,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                  >
                    <div className="relative">
                      {friendship.profile.avatar_url ? (
                        <img
                          src={friendship.profile.avatar_url}
                          alt={friendship.profile.display_name}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ backgroundColor: getProfileColor(friendship.profile.user_id).bg }}
                        >
                          {friendship.profile.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5">
                        <StatusIndicator
                          status={getEffectiveStatus(friendship)}
                          size="sm"
                          borderColor="var(--app-bg-primary, #313338)"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-semibold leading-tight text-white">{friendship.profile.display_name}</p>
                      {(() => {
                        const act = getActivity(friendship.profile.user_id);
                        const friendOnline = friendship.profile.user_id === CUBBLY_BOT_ID || onlineUserIds.has(friendship.profile.user_id);
                        const label = activityLabel(act, friendOnline);
                        if (activeTab !== "pending" && label) {
                          return (
                            <p className="truncate text-xs leading-tight" style={{ color: "#3ba55c" }}>
                              {label}
                            </p>
                          );
                        }
                        return (
                          <p className="truncate text-xs leading-tight" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
                            {activeTab === "pending"
                              ? (friendship.addressee_id === user?.id ? "Incoming Friend Request" : "Outgoing Friend Request")
                              : getStatusLabel(friendship)}
                          </p>
                        );
                      })()}
                    </div>
                    {renderFriendActions(friendship)}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div
        className={`hidden lg:flex flex-shrink-0 flex-col border-l transition-all duration-300 ease-in-out overflow-hidden ${
          activeNowOpen ? "w-[340px] px-4 py-4 opacity-100" : "w-0 px-0 py-0 opacity-0 border-l-0"
        }`}
        style={{ borderColor: "var(--app-border, #3f4147)" }}
      >
        <div className="min-w-[308px]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">Active Now</h3>
            <button
              onClick={() => setActiveNowOpen(false)}
              className="rounded p-1 transition-colors"
              style={{ color: "var(--app-text-secondary, #949ba4)" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
              title="Hide Active Now"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {(() => {
            const activeFriends = friends.filter((f) => {
              const act = getActivity(f.profile.user_id);
              return act?.name && isActuallyOnline(f.profile.user_id);
            });
            if (activeFriends.length === 0) {
              return (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold text-white">It's quiet for now...</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
                    When a friend starts an activity—like playing a game or hanging out on voice—we'll show it here!
                  </p>
                </div>
              );
            }
            return (
              <div className="flex flex-col gap-2">
                {activeFriends.map((f) => {
                  const act = getActivity(f.profile.user_id)!;
                  return (
                    <button
                      key={f.id}
                      onClick={(e) => setProfileCard({ userId: f.profile.user_id, name: f.profile.display_name, x: e.clientX, y: e.clientY })}
                      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors"
                      style={{ borderColor: "var(--app-border, #3f4147)", backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-active, #404249)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--app-bg-secondary, #2b2d31)"; }}
                    >
                      <div className="relative shrink-0">
                        {f.profile.avatar_url ? (
                          <img src={f.profile.avatar_url} alt={f.profile.display_name} className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: getProfileColor(f.profile.user_id).bg }}>
                            {f.profile.display_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="absolute -bottom-0.5 -right-0.5">
                          <StatusIndicator status={getEffectiveStatus(f)} size="sm" borderColor="var(--app-bg-secondary, #2b2d31)" />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white leading-tight">{f.profile.display_name}</p>
                        <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#3ba55c" }}>
                          {act.details === "software" || act.activity_type === "using" ? "Using" : "Playing"}
                        </p>
                        <p className="truncate text-sm" style={{ color: "var(--app-text-primary, #dbdee1)" }}>{act.name}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
      {profileCard && (
        <UserProfileCard
          userId={profileCard.userId}
          displayName={profileCard.name}
          position={{ x: profileCard.x, y: profileCard.y }}
          onClose={() => setProfileCard(null)}
          onSendMessage={(userId) => { setProfileCard(null); onOpenDM(userId); }}
        />
      )}
    </div>
  );
};

export default FriendsView;
