import { useEffect, useMemo, useState } from "react";
import { Monitor } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCallParticipants } from "@/hooks/useCallParticipants";
import { getProfileColor } from "@/lib/profileColors";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";

interface Props {
  /** The ongoing call_event we're spectating (we are NOT in it). */
  callEventId: string;
  startedAt: string;
  joining: boolean;
  onJoin: () => void;
}

const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
};

/**
 * v0.4.22 — Discord parity for "you left, the call is still going".
 *
 * Previously this state collapsed into a plain text banner ("Ongoing call in
 * this chat"). Discord keeps showing the call UI with the people who ARE in
 * the call, and just swaps the controls for a Join button. That's what this
 * renders: real tiles for every remaining participant (never yourself, since
 * you're not in it), live mute/deafen/sharing badges, and Join.
 */
const OngoingCallPanel = ({ callEventId, startedAt, joining, onJoin }: Props) => {
  const { user } = useAuth();
  const { participants } = useCallParticipants(callEventId);
  const [profiles, setProfiles] = useState<Record<string, { display_name: string | null; avatar_url: string | null }>>({});
  const [elapsed, setElapsed] = useState(0);

  const others = useMemo(
    () => Array.from(participants.values()).filter((p) => p.user_id !== user?.id),
    [participants, user?.id],
  );

  useEffect(() => {
    const missing = others.map((p) => p.user_id).filter((id) => !profiles[id]);
    if (!missing.length) return;
    supabase
      .from("profiles")
      .select("user_id, display_name, avatar_url")
      .in("user_id", missing)
      .then(({ data }) => {
        if (!data?.length) return;
        setProfiles((prev) => {
          const next = { ...prev };
          data.forEach((row: any) => {
            next[row.user_id] = { display_name: row.display_name, avatar_url: row.avatar_url };
          });
          return next;
        });
      });
  }, [others, profiles]);

  useEffect(() => {
    const started = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - started);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const anySharing = others.some((p) => p.is_screen_sharing);

  return (
    <div
      className="mx-4 mt-4 rounded-2xl overflow-hidden border"
      style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" }}
    >
      {/* Header — mirrors the live call panel */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#3ba55c" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#3ba55c" }}>
            {formatDuration(elapsed)}
          </span>
        </div>
        {anySharing && (
          <div className="flex items-center gap-1.5">
            <Monitor className="h-3.5 w-3.5" style={{ color: "#3ba55c" }} />
            <span className="text-[11px] font-semibold" style={{ color: "#3ba55c" }}>Screen shared</span>
          </div>
        )}
      </div>

      {/* Participants currently in the call (you're not one of them) */}
      <div className="flex flex-wrap items-center justify-center gap-10 px-6 py-8">
        {others.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Waiting for someone to join…
          </p>
        ) : (
          others.map((p) => {
            const profile = profiles[p.user_id];
            const name = profile?.display_name || "Member";
            const color = getProfileColor(p.user_id).bg;
            return (
              <div key={p.user_id} className="flex flex-col items-center gap-2">
                <div className="relative">
                  <div
                    className="flex h-[80px] w-[80px] items-center justify-center rounded-full text-2xl font-bold text-white overflow-hidden"
                    style={{ backgroundColor: color }}
                  >
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt={name} className="h-full w-full object-cover" />
                      : name.charAt(0).toUpperCase()}
                  </div>
                  {(p.is_deafened || p.is_muted) && (
                    <div
                      className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2"
                      style={{ backgroundColor: "#ed4245", borderColor: "var(--app-bg-tertiary)" }}
                    >
                      <img
                        src={p.is_deafened ? headphoneDeafenIcon : micMuteIcon}
                        alt={p.is_deafened ? "Deafened" : "Muted"}
                        className="h-3.5 w-3.5"
                        style={{ filter: "brightness(0) invert(1)" }}
                      />
                    </div>
                  )}
                </div>
                <span className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{name}</span>
                {p.is_screen_sharing && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#3ba55c" }}>
                    Sharing
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Controls — the only action available while you're out of the call */}
      <div className="flex items-center justify-center gap-3 px-5 pb-5">
        <button
          onClick={onJoin}
          disabled={joining}
          className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: "#3ba55c" }}
        >
          {joining ? "Joining…" : "Join Call"}
        </button>
      </div>
    </div>
  );
};

export default OngoingCallPanel;
