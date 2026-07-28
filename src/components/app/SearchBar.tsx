import { useState, useRef, useEffect } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useFriends } from "@/hooks/useFriends";
import { getProfileColor } from "@/lib/profileColors";
import searchIcon from "@/assets/icons/search.svg";
import GroupAvatar from "@/components/app/GroupAvatar";

interface SearchBarProps {
  onOpenDM: (userId: string) => void;
  /** Opens an existing conversation by id (used for group chats). */
  onOpenConversation?: (conversationId: string) => void;
}

const SearchBar = ({ onOpenDM, onOpenConversation }: SearchBarProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { conversations } = useConversations();
  const { friends } = useFriends();

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const q = query.toLowerCase();

  // Group chats match on their own name (or their members' names), never on a
  // single participant's name — that made groups look like a friend's DM.
  const conversationLabel = (conversation: (typeof conversations)[number]) =>
    conversation.is_group
      ? conversation.name || "Group chat"
      : conversation.participant.display_name;

  const filteredConversations = conversations.filter((conversation) => {
    if (!q) return true;
    if (conversation.is_group) {
      return (
        (conversation.name || "group chat").toLowerCase().includes(q) ||
        conversation.members.some(
          (m) => m.display_name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q),
        )
      );
    }
    return (
      conversation.participant.display_name.toLowerCase().includes(q) ||
      conversation.participant.username.toLowerCase().includes(q)
    );
  });

  // De-duplicate: a friend who already has a DM open should only appear once.
  const dmUserIds = new Set(
    conversations.filter((c) => !c.is_group).map((c) => c.participant.user_id),
  );
  const seenFriendIds = new Set<string>();
  const filteredFriends = friends.filter((friend) => {
    const id = friend.profile.user_id;
    if (dmUserIds.has(id) || seenFriendIds.has(id)) return false;
    if (q && !(friend.profile.display_name.toLowerCase().includes(q) || friend.profile.username.toLowerCase().includes(q))) return false;
    seenFriendIds.add(id);
    return true;
  });

  const shellStyle = {
    backgroundColor: "var(--app-input)",
    borderColor: "var(--app-border)",
  } as const;

  return (
    <div ref={ref} className="relative mx-3 mt-3">
      {!open ? (
        <button
          onClick={handleOpen}
          className="flex h-8 w-full items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors hover:opacity-95 cubbly-3d-pill"
          style={{ ...shellStyle, color: "var(--app-text-secondary)" }}
        >
          <span className="flex-1 text-left whitespace-nowrap overflow-hidden text-ellipsis">Find or start a conversation</span>
          <img src={searchIcon} alt="" className="h-4 w-4 shrink-0 invert opacity-50" />
        </button>
      ) : (
        <div>
          <div className="flex h-8 items-center gap-2 rounded-full border px-3 cubbly-3d-pill" style={shellStyle}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find or start a conversation"
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#6d6f78]"
              style={{ color: "var(--app-text-primary)" }}
            />
            <img src={searchIcon} alt="" className="h-4 w-4 shrink-0 invert opacity-50" />
          </div>

          <div
            className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 max-h-[320px] overflow-y-auto rounded-2xl border shadow-xl"
            style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" }}
          >
            {filteredConversations.length === 0 && filteredFriends.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs" style={{ color: "var(--app-text-secondary)" }}>
                No results found
              </p>
            ) : (
              <div className="p-1.5">
                {filteredConversations.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-[10px] font-bold uppercase" style={{ color: "var(--app-text-secondary)" }}>
                      Recent
                    </p>
                    {filteredConversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        onClick={() => {
                          if (conversation.is_group) onOpenConversation?.(conversation.id);
                          else onOpenDM(conversation.participant.user_id);
                          setOpen(false);
                          setQuery("");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors"
                        style={{ color: "var(--app-text-primary)" }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                      >
                        {conversation.is_group ? (
                          <GroupAvatar conversation={conversation} size={32} />
                        ) : conversation.participant.avatar_url ? (
                          <img src={conversation.participant.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: getProfileColor(conversation.participant.user_id).bg }}
                          >
                            {conversation.participant.display_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate">{conversationLabel(conversation)}</span>
                        <span className="ml-auto shrink-0 text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
                          {conversation.is_group
                            ? `${conversation.members.length + 1} members`
                            : conversation.participant.username}
                        </span>
                      </button>
                    ))}
                  </>
                )}

                {filteredFriends.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-[10px] font-bold uppercase" style={{ color: "var(--app-text-secondary)" }}>
                      Friends
                    </p>
                    {filteredFriends.map((friend) => (
                      <button
                        key={friend.id}
                        onClick={() => {
                          onOpenDM(friend.profile.user_id);
                          setOpen(false);
                          setQuery("");
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors"
                        style={{ color: "var(--app-text-primary)" }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
                      >
                        {friend.profile.avatar_url ? (
                          <img src={friend.profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div
                            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ backgroundColor: getProfileColor(friend.profile.user_id).bg }}
                          >
                            {friend.profile.display_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span>{friend.profile.display_name}</span>
                        <span className="ml-auto text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
                          {friend.profile.username}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
