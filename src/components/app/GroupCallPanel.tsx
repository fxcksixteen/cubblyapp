import { useEffect, useState, useRef } from "react";
import { useGroupCall } from "@/contexts/GroupCallContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getProfileColor } from "@/lib/profileColors";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneIcon from "@/assets/icons/headphone.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";
import callEndIcon from "@/assets/icons/call-end.svg";
import callIcon from "@/assets/icons/call.svg";

const formatDuration = (ms: number) => {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const speakingShadow = (level: number) =>
  `0 0 0 ${4 + level * 0.18}px rgba(59,165,92,${0.6 + level * 0.003}), 0 0 ${12 + level * 0.5}px rgba(59,165,92,${0.35 + level * 0.005})`;

interface PeerTileProps {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  audioLevel: number;
  isMuted: boolean;
  isLocal?: boolean;
}

const PeerTile = ({ userId, displayName, avatarUrl, audioLevel, isMuted, isLocal }: PeerTileProps) => {
  const color = getProfileColor(userId);
  const speaking = audioLevel > 5 && !isMuted;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white transition-all duration-150 overflow-hidden"
          style={{
            backgroundColor: color.bg,
            boxShadow: speaking ? speakingShadow(audioLevel) : "0 0 0 0px transparent",
          }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
          ) : (
            displayName.charAt(0).toUpperCase()
          )}
        </div>
        {isMuted && (
          <div
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#ed4245] border-2"
            style={{ borderColor: "var(--app-bg-tertiary)" }}
          >
            <img src={micMuteIcon} alt="Muted" className="h-3 w-3" style={{ filter: "brightness(0) invert(1)" }} />
          </div>
        )}
      </div>
      <span className="text-xs font-semibold max-w-[100px] truncate" style={{ color: "var(--app-text-primary)" }}>
        {displayName}{isLocal ? " (you)" : ""}
      </span>
    </div>
  );
};

interface Props {
  conversationId: string;
}

/**
 * Group voice call panel — mounted inside the chat area of a group conversation
 * when the local user is in the call for THIS conversation.
 */
const GroupCallPanel = ({ conversationId }: Props) => {
  const { user } = useAuth();
  const { activeCall, peers, selfAudioLevel, leaveCall, toggleMute, toggleDeafen, ping } = useGroupCall();
  const [elapsed, setElapsed] = useState(0);
  const [selfAvatar, setSelfAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setSelfAvatar(data?.avatar_url || null));
  }, [user]);

  useEffect(() => {
    if (!activeCall) return;
    const i = setInterval(() => setElapsed(Date.now() - activeCall.joinedAt), 1000);
    return () => clearInterval(i);
  }, [activeCall?.joinedAt]);

  if (!activeCall || activeCall.conversationId !== conversationId) return null;

  const displayName = user?.user_metadata?.display_name || "You";

  return (
    <div className="mx-4 mt-4 rounded-2xl overflow-hidden border" style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" }}>
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full animate-pulse bg-[#3ba55c]" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[#3ba55c]">
            Group Call · {formatDuration(elapsed)}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
          {peers.length + 1} in call{ping > 0 ? ` · ${ping}ms` : ""}
        </span>
      </div>

      {/* Participants grid */}
      <div className="flex flex-wrap items-center justify-center gap-8 px-6 py-8">
        <PeerTile
          userId={user!.id}
          displayName={displayName}
          avatarUrl={selfAvatar}
          audioLevel={selfAudioLevel}
          isMuted={activeCall.isMuted}
          isLocal
        />
        {peers.map((p) => (
          <PeerTile
            key={p.userId}
            userId={p.userId}
            displayName={p.displayName}
            avatarUrl={p.avatarUrl}
            audioLevel={p.audioLevel}
            isMuted={p.isMuted}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 px-6 pb-5">
        <button
          onClick={toggleMute}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ${
            activeCall.isMuted ? "bg-white/15 ring-2 ring-[#ed4245]/50" : "bg-white/10 hover:bg-white/20"
          }`}
          title={activeCall.isMuted ? "Unmute" : "Mute"}
        >
          <img
            src={activeCall.isMuted ? micMuteIcon : micIcon}
            alt="Mic"
            className="h-5 w-5"
            style={{ filter: activeCall.isMuted ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)" : "brightness(0) invert(1)" }}
          />
        </button>

        <button
          onClick={toggleDeafen}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ${
            activeCall.isDeafened ? "bg-white/15 ring-2 ring-[#ed4245]/50" : "bg-white/10 hover:bg-white/20"
          }`}
          title={activeCall.isDeafened ? "Undeafen" : "Deafen"}
        >
          <img
            src={activeCall.isDeafened ? headphoneDeafenIcon : headphoneIcon}
            alt="Deafen"
            className="h-5 w-5"
            style={{ filter: activeCall.isDeafened ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)" : "brightness(0) invert(1)" }}
          />
        </button>

        <div className="w-px h-6 mx-1" style={{ backgroundColor: "var(--app-border)" }} />

        <button
          onClick={leaveCall}
          className="flex h-10 px-5 items-center justify-center gap-2 rounded-full bg-[#ed4245] text-white hover:bg-[#c73b3e] active:scale-95 transition-all duration-150"
          title="Leave call"
        >
          <img src={callEndIcon} alt="Leave" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </button>
      </div>
    </div>
  );
};

/** Fixed top-center notification when someone calls our group. */
export const GroupIncomingCallOverlay = () => {
  const { incomingCall, activeCall, acceptCall, declineCall } = useGroupCall();
  if (!incomingCall || activeCall) return null;
  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 rounded-2xl border px-6 py-4 shadow-2xl animate-fade-in"
      style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}
    >
      {incomingCall.callerAvatarUrl ? (
        <img src={incomingCall.callerAvatarUrl} alt={incomingCall.callerName} className="h-12 w-12 rounded-full object-cover animate-pulse" />
      ) : (
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white animate-pulse"
          style={{ backgroundColor: getProfileColor(incomingCall.callerId).bg }}
        >
          {incomingCall.callerName.charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
          {incomingCall.conversationName}
        </p>
        <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
          {incomingCall.callerName} started a group call
        </p>
      </div>
      <button
        onClick={acceptCall}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3ba55c] text-white hover:bg-[#2d8b4e] transition-colors"
        title="Join"
      >
        <img src={callIcon} alt="Join" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
      </button>
      <button
        onClick={declineCall}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ed4245] text-white hover:bg-[#c73b3e] transition-colors"
        title="Dismiss"
      >
        <img src={callEndIcon} alt="Dismiss" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
      </button>
    </div>
  );
};

export default GroupCallPanel;
