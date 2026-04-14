import { useState, useRef, useEffect } from "react";
import { useConversations } from "@/hooks/useConversations";
import { useFriends } from "@/hooks/useFriends";
import searchIcon from "@/assets/icons/search.svg";

interface SearchBarProps {
  onOpenDM: (userId: string) => void;
}

const SearchBar = ({ onOpenDM }: SearchBarProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { conversations } = useConversations();
  const { friends } = useFriends();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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
  const filteredConvs = conversations.filter(c =>
    c.participant.display_name.toLowerCase().includes(q) ||
    c.participant.username.toLowerCase().includes(q)
  );
  const filteredFriends = friends.filter(f =>
    !conversations.some(c => c.participant.user_id === f.profile.user_id) &&
    (f.profile.display_name.toLowerCase().includes(q) ||
     f.profile.username.toLowerCase().includes(q))
  );

  return (
    <div ref={ref} className="relative mx-2 mt-2">
      {!open ? (
        <button
          onClick={handleOpen}
          className="flex h-7 w-full items-center gap-2 rounded-full bg-[#1e1f22] px-3 text-xs text-[#949ba4] hover:bg-[#1a1b1e] transition-colors"
        >
          <span className="flex-1 text-left">Find or start a conversation</span>
          <img src={searchIcon} alt="" className="h-3.5 w-3.5 invert opacity-50" />
        </button>
      ) : (
        <div>
          <div className="flex h-7 items-center gap-2 rounded-full bg-[#1e1f22] px-3">
            <img src={searchIcon} alt="" className="h-3.5 w-3.5 invert opacity-50" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find or start a conversation"
              className="flex-1 bg-transparent text-xs text-[#dbdee1] outline-none placeholder:text-[#6d6f78]"
            />
          </div>

          {/* Dropdown */}
          <div className="absolute left-0 right-0 top-8 z-50 max-h-[300px] overflow-y-auto rounded-lg bg-[#111214] border border-[#2b2d31] shadow-xl">
            {filteredConvs.length === 0 && filteredFriends.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-[#949ba4]">No results found</p>
            ) : (
              <div className="p-1.5">
                {filteredConvs.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-[10px] font-bold uppercase text-[#949ba4]">Recent</p>
                    {filteredConvs.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { onOpenDM(c.participant.user_id); setOpen(false); setQuery(""); }}
                        className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-[#dbdee1] hover:bg-[#35373c]"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#5865f2] text-xs font-bold text-white">
                          {c.participant.display_name.charAt(0).toUpperCase()}
                        </div>
                        <span>{c.participant.display_name}</span>
                        <span className="ml-auto text-[11px] text-[#949ba4]">{c.participant.username}</span>
                      </button>
                    ))}
                  </>
                )}
                {filteredFriends.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-[10px] font-bold uppercase text-[#949ba4]">Friends</p>
                    {filteredFriends.map(f => (
                      <button
                        key={f.id}
                        onClick={() => { onOpenDM(f.profile.user_id); setOpen(false); setQuery(""); }}
                        className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-[#dbdee1] hover:bg-[#35373c]"
                      >
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#5865f2] text-xs font-bold text-white">
                          {f.profile.display_name.charAt(0).toUpperCase()}
                        </div>
                        <span>{f.profile.display_name}</span>
                        <span className="ml-auto text-[11px] text-[#949ba4]">{f.profile.username}</span>
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
