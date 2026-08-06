import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getProfileColor } from "@/lib/profileColors";
import UserBadges from "@/components/app/UserBadges";

interface MutualFriend {
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

interface MutualServer {
  id: string;
  name: string;
  icon_url: string | null;
}

interface Props {
  /** The profile being viewed. */
  userId: string;
  onOpenProfile?: (userId: string) => void;
  onOpenServer?: (serverId: string) => void;
}

type Tab = "friends" | "servers";

/**
 * Discord-style "Mutual Friends" / "Mutual Servers" tabs for the full profile
 * card. Switching tabs slides the panel horizontally in the direction of
 * travel.
 */
const MutualsTabs = ({ userId, onOpenProfile, onOpenServer }: Props) => {
  const [tab, setTab] = useState<Tab>("friends");
  const [dir, setDir] = useState<1 | -1>(1);
  const [friends, setFriends] = useState<MutualFriend[] | null>(null);
  const [servers, setServers] = useState<MutualServer[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFriends(null);
    setServers(null);
    (async () => {
      const [f, s] = await Promise.all([
        supabase.rpc("mutual_friends", { _other: userId }),
        supabase.rpc("mutual_servers", { _other: userId }),
      ]);
      if (cancelled) return;
      setFriends((f.data as MutualFriend[]) || []);
      setServers((s.data as MutualServer[]) || []);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const switchTo = (next: Tab) => {
    if (next === tab) return;
    setDir(next === "servers" ? 1 : -1);
    setTab(next);
  };

  const list = tab === "friends" ? friends : servers;
  const empty = tab === "friends" ? "No mutual friends" : "No mutual servers";

  return (
    <div className="mt-3 rounded-lg bg-[#1e1f22] overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-2 pt-2">
        {(["friends", "servers"] as Tab[]).map((t) => {
          const active = t === tab;
          return (
            <button
              key={t}
              onClick={() => switchTo(t)}
              className="relative flex-1 rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors"
              style={{
                color: active ? "#ffffff" : "#949ba4",
                backgroundColor: active ? "rgba(255,255,255,0.07)" : "transparent",
              }}
            >
              {t === "friends" ? "Mutual Friends" : "Mutual Servers"}
              {!!(t === "friends" ? friends?.length : servers?.length) && (
                <span className="ml-1.5 text-[10px] font-bold text-white/45 tabular-nums">
                  {t === "friends" ? friends!.length : servers!.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="p-2 overflow-hidden">
        <div
          key={tab}
          className="max-h-[210px] overflow-y-auto"
          style={{ animation: `cubbly-mutuals-slide-${dir === 1 ? "left" : "right"} 220ms ease-out` }}
        >
          {list === null ? (
            <div className="flex flex-col gap-1.5 p-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-9 rounded-md bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-[#949ba4]">{empty}</p>
          ) : tab === "friends" ? (
            <div className="flex flex-col">
              {(list as MutualFriend[]).map((f) => {
                const c = getProfileColor(f.user_id);
                return (
                  <button
                    key={f.user_id}
                    onClick={() => onOpenProfile?.(f.user_id)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                  >
                    {f.avatar_url ? (
                      <img src={f.avatar_url} alt="" decoding="sync" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                    ) : (
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: c.bg }}
                      >
                        {(f.display_name || f.username || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#dbdee1]">
                      {f.display_name || f.username}
                    </span>
                    <UserBadges userId={f.user_id} size={12} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col">
              {(list as MutualServer[]).map((s) => {
                const c = getProfileColor(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => onOpenServer?.(s.id)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                  >
                    {s.icon_url ? (
                      <img src={s.icon_url} alt="" decoding="sync" className="h-7 w-7 shrink-0 rounded-[10px] object-cover" />
                    ) : (
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-bold text-white"
                        style={{ backgroundColor: c.bg }}
                      >
                        {(s.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#dbdee1]">{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MutualsTabs;
