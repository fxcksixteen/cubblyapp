import { useEffect, useState, CSSProperties } from "react";
import { Trash2, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalSetting } from "@/hooks/useLocalSetting";
import { toast } from "sonner";
import { SettingsCard, SettingsToggleRow, SettingsSectionLabel } from "./_shared";

interface Props {
  cardStyle: CSSProperties;
}

interface BlockedRow {
  blocked_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export default function ContentSocialSettings({ cardStyle }: Props) {
  const { user } = useAuth();
  const [filterExplicit, setFilterExplicit] = useLocalSetting("cubbly:content:filterExplicit", true);
  const [filterDmMedia, setFilterDmMedia] = useLocalSetting("cubbly:content:filterDmMedia", false);
  const [hideSpoilers, setHideSpoilers] = useLocalSetting("cubbly:content:hideSpoilers", true);
  const [autoplayGifs, setAutoplayGifs] = useLocalSetting("cubbly:content:autoplayGifs", true);
  const [autoplayVideos, setAutoplayVideos] = useLocalSetting("cubbly:content:autoplayVideos", false);
  const [previewLinks, setPreviewLinks] = useLocalSetting("cubbly:content:previewLinks", true);
  const [convertEmoticons, setConvertEmoticons] = useLocalSetting("cubbly:content:convertEmoticons", true);

  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("blocked_users" as any)
          .select("blocked_id, profiles:blocked_id(display_name, username, avatar_url)")
          .eq("blocker_id", user.id);
        if (cancelled) return;
        if (error) setBlocked([]);
        else {
          const rows: BlockedRow[] = (data || []).map((r: any) => ({
            blocked_id: r.blocked_id,
            display_name: r.profiles?.display_name ?? null,
            username: r.profiles?.username ?? null,
            avatar_url: r.profiles?.avatar_url ?? null,
          }));
          setBlocked(rows);
        }
      } catch {
        if (!cancelled) setBlocked([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const unblock = async (blockedId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("blocked_users" as any)
      .delete()
      .eq("blocker_id", user.id)
      .eq("blocked_id", blockedId);
    if (error) { toast.error("Couldn't unblock"); return; }
    setBlocked((prev) => prev.filter((b) => b.blocked_id !== blockedId));
    toast.success("Unblocked");
  };

  return (
    <div className="space-y-5">
      <SettingsCard cardStyle={cardStyle}>
        <SettingsSectionLabel>Media Filters</SettingsSectionLabel>
        <SettingsToggleRow title="Filter explicit images" description="Blur images flagged as sensitive across DMs and servers." checked={filterExplicit} onChange={setFilterExplicit} />
        <SettingsToggleRow title="Filter DM media from strangers" description="Blur attachments in DMs from people you don't share a server with." checked={filterDmMedia} onChange={setFilterDmMedia} />
        <SettingsToggleRow title="Hide spoilers by default" description="Always require a click to reveal spoiler-tagged content." checked={hideSpoilers} onChange={setHideSpoilers} />
      </SettingsCard>

      <SettingsCard cardStyle={cardStyle}>
        <SettingsSectionLabel>Embeds &amp; Playback</SettingsSectionLabel>
        <SettingsToggleRow title="Autoplay GIFs" description="When off, GIFs become click-to-play." checked={autoplayGifs} onChange={setAutoplayGifs} />
        <SettingsToggleRow title="Autoplay videos" description="Embedded videos start playing without interaction." checked={autoplayVideos} onChange={setAutoplayVideos} />
        <SettingsToggleRow title="Show link previews" description="Display rich previews for links shared in chat." checked={previewLinks} onChange={setPreviewLinks} />
        <SettingsToggleRow title="Convert emoticons to emoji" description=":) becomes 🙂 when you send a message." checked={convertEmoticons} onChange={setConvertEmoticons} />
      </SettingsCard>

      <SettingsCard cardStyle={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>Blocked Users</p>
          <span className="text-xs" style={{ color: "var(--app-text-secondary)" }}>{blocked.length}</span>
        </div>
        {loading ? (
          <p className="text-sm py-4" style={{ color: "var(--app-text-secondary)" }}>Loading…</p>
        ) : blocked.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <UserX className="h-8 w-8 mb-2" style={{ color: "var(--app-text-secondary)" }} />
            <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>You haven't blocked anyone.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {blocked.map((b) => (
              <div key={b.blocked_id} className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-white/5">
                <div className="flex items-center gap-3 min-w-0">
                  {b.avatar_url ? (
                    <img src={b.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-[#5865f2] flex items-center justify-center text-xs font-bold text-white">
                      {(b.display_name || b.username || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{b.display_name || b.username || "Unknown"}</p>
                    {b.username && <p className="text-xs truncate" style={{ color: "var(--app-text-secondary)" }}>@{b.username}</p>}
                  </div>
                </div>
                <button
                  onClick={() => unblock(b.blocked_id)}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[#ed4245]/10 text-[#ed4245]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
