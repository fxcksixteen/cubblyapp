import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useVoice } from "@/contexts/VoiceContext";
import { useGroupCall } from "@/contexts/GroupCallContext";
import { playSound } from "@/lib/sounds";
import ProfilePopup from "./ProfilePopup";
import SettingsModal from "./SettingsModal";
import UserDisplayName from "./UserDisplayName";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneIcon from "@/assets/icons/headphone.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";
import settingsIcon from "@/assets/icons/settings.svg";

/**
 * The small bottom-of-sidebar profile panel: avatar + display name/username,
 * mute, deafen and settings buttons. Shared between the DM sidebar and the
 * server channel sidebar so both look and behave identically.
 */
const UserPanel = () => {
  const { user } = useAuth();
  const { activeCall, toggleMute, toggleDeafen } = useVoice();
  const { activeCall: groupCall, toggleMute: toggleGroupMute, toggleDeafen: toggleGroupDeafen } = useGroupCall();
  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();

  const [localMuted, setLocalMuted] = useState(false);
  const [localDeafened, setLocalDeafened] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userStatus, setUserStatus] = useState("online");
  const [customStatus, setCustomStatus] = useState<{ text: string; emoji: string | null } | null>(null);
  // Discord-style: when a custom status is set, the second line cross-fades
  // between the username and the custom status instead of hiding one of them.
  const [showCustom, setShowCustom] = useState(false);

  // Load the user's saved presence status so the dot under their avatar in the
  // server sidebar matches reality (online / idle / dnd / invisible) instead of
  // always showing the "online" default.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status) setUserStatus(data.status);
      });
  }, [user]);

  // Load + live-watch the user's custom status so the panel can animate it.
  useEffect(() => {
    if (!user) { setCustomStatus(null); return; }
    let alive = true;
    const load = () => {
      supabase
        .from("custom_statuses")
        .select("text, emoji, expires_at")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!alive) return;
          if (!data || (!data.text && !(data as any).emoji)) { setCustomStatus(null); return; }
          if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) { setCustomStatus(null); return; }
          setCustomStatus({ text: data.text || "", emoji: (data as any).emoji ?? null });
        });
    };
    load();
    const channel = supabase
      .channel(`user-panel-status:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_statuses", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [user]);

  // When a status is set it stays visible; the username only slides in while
  // the pointer is over the panel.
  useEffect(() => {
    if (!customStatus) setShowCustom(false);
    else setShowCustom(true);
  }, [customStatus]);

  // Reflect whichever call the user is actually in — DM voice or group/server
  // voice. Priority: DM active call > group/server call > local (no-call) state.
  const muted = activeCall ? activeCall.isMuted : groupCall ? groupCall.isMuted : localMuted;
  const deafened = activeCall ? activeCall.isDeafened : groupCall ? groupCall.isDeafened : localDeafened;

  return (
    <>
      <div
        className="flex items-center gap-2.5 px-2 py-2 user-panel"
        style={{ backgroundColor: "var(--app-bg-accent)" }}
      >
        <ProfilePopup
          currentStatus={userStatus}
          onStatusChange={setUserStatus}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 overflow-hidden min-w-0">
          <p className="truncate text-[15px] font-bold text-white leading-snug flex items-center gap-1.5">
            <UserDisplayName userId={user?.id} name={displayName} fallbackColor="#ffffff" className="truncate" />
          </p>
          <div className="relative h-[15px] overflow-hidden">
            <p
              className="absolute inset-x-0 truncate text-[11px] leading-snug transition-all duration-300"
              style={{
                color: "var(--app-text-secondary, #949ba4)",
                opacity: showCustom ? 0 : 1,
                transform: showCustom ? "translateY(-100%)" : "translateY(0)",
              }}
            >
              {username}
            </p>
            {customStatus && (
              <p
                className="absolute inset-x-0 truncate text-[11px] leading-snug transition-all duration-300 flex items-center gap-1"
                style={{
                  color: "var(--app-text-primary, #dbdee1)",
                  opacity: showCustom ? 1 : 0,
                  transform: showCustom ? "translateY(0)" : "translateY(100%)",
                }}
              >
                {customStatus.emoji && <span className="cubbly-keep-animation">{customStatus.emoji}</span>}
                {customStatus.text && <span className="truncate">{customStatus.text}</span>}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => {
              if (activeCall) { toggleMute(); }
              else if (groupCall) { toggleGroupMute(); }
              else {
                const next = !localMuted;
                setLocalMuted(next);
                playSound(next ? "mute" : "unmute", { volume: 0.4 });
              }
            }}
            className="rounded p-1.5 transition-colors"
            style={{ backgroundColor: muted ? "rgba(237,66,69,0.2)" : undefined }}
            onMouseEnter={(e) => { if (!muted) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
            onMouseLeave={(e) => { if (!muted) e.currentTarget.style.backgroundColor = ""; }}
            title={muted ? "Unmute" : "Mute"}
          >
            <img
              src={muted ? micMuteIcon : micIcon}
              alt={muted ? "Muted" : "Microphone"}
              className={`h-[18px] w-[18px] transition-opacity ${muted ? "opacity-100" : "invert opacity-70 hover:opacity-100"}`}
              style={muted ? { filter: "invert(36%) sepia(93%) saturate(7471%) hue-rotate(348deg) brightness(101%) contrast(88%)" } : undefined}
            />
          </button>
          <button
            onClick={() => {
              if (activeCall) { toggleDeafen(); }
              else if (groupCall) { toggleGroupDeafen(); }
              else {
                const next = !localDeafened;
                setLocalDeafened(next);
                playSound(next ? "deafen" : "undeafen", { volume: 0.4 });
              }
            }}
            className="rounded p-1.5 transition-colors"
            style={{ backgroundColor: deafened ? "rgba(237,66,69,0.2)" : undefined }}
            onMouseEnter={(e) => { if (!deafened) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
            onMouseLeave={(e) => { if (!deafened) e.currentTarget.style.backgroundColor = ""; }}
            title={deafened ? "Undeafen" : "Deafen"}
          >
            <img
              src={deafened ? headphoneDeafenIcon : headphoneIcon}
              alt={deafened ? "Deafened" : "Headphones"}
              className={`h-[18px] w-[18px] transition-opacity ${deafened ? "opacity-100" : "invert opacity-70 hover:opacity-100"}`}
              style={deafened ? { filter: "invert(36%) sepia(93%) saturate(7471%) hue-rotate(348deg) brightness(101%) contrast(88%)" } : undefined}
            />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded p-1.5 transition-colors"
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = ""; }}
            title="User Settings"
          >
            <img
              src={settingsIcon}
              alt="Settings"
              className="h-[18px] w-[18px] invert opacity-70 hover:opacity-100 transition-opacity"
            />
          </button>
        </div>
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
};

export default UserPanel;
