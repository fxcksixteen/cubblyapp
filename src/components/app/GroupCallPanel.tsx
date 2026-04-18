import { useEffect, useState, useRef } from "react";
import { Maximize2 } from "lucide-react";
import { useGroupCall, GroupPeer } from "@/contexts/GroupCallContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getProfileColor } from "@/lib/profileColors";
import ScreenSharePicker from "./ScreenSharePicker";
import FullscreenScreenShareViewer from "./FullscreenScreenShareViewer";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneIcon from "@/assets/icons/headphone.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";
import callEndIcon from "@/assets/icons/call-end.svg";
import callIcon from "@/assets/icons/call.svg";
import videoIcon from "@/assets/icons/video-camera.svg";
import screenshareIcon from "@/assets/icons/screenshare.svg";

const formatDuration = (ms: number) => {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const SPEAKING_THRESHOLD = 10;
const speakingShadow = (level: number) => {
  const clamped = Math.max(SPEAKING_THRESHOLD, Math.min(100, level));
  const t = (clamped - SPEAKING_THRESHOLD) / (100 - SPEAKING_THRESHOLD);
  const eased = 1 - Math.pow(1 - t, 2);
  const ring = 4 + eased * 10;
  const glow = 12 + eased * 20;
  return `0 0 0 ${ring}px rgba(59,165,92,${0.7 + eased * 0.25}), 0 0 ${glow}px rgba(59,165,92,${0.35 + eased * 0.35})`;
};

interface PeerTileProps {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  audioLevel: number;
  isMuted: boolean;
  isLocal?: boolean;
  /** When set, the tile renders a <video> instead of the avatar circle. */
  videoStream?: MediaStream | null;
  /** Called when the user clicks the maximize button on a video tile. */
  onMaximize?: () => void;
  /** Called when the user right-clicks the tile (used to open the volume menu). Suppressed for the local user. */
  onContextMenu?: (e: React.MouseEvent) => void;
}

const PeerTile = ({ userId, displayName, avatarUrl, audioLevel, isMuted, isLocal, videoStream, onMaximize, onContextMenu }: PeerTileProps) => {
  const color = getProfileColor(userId);
  const speaking = audioLevel > SPEAKING_THRESHOLD && !isMuted;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  if (videoStream) {
    return (
      <div className="flex flex-col items-center gap-2" onContextMenu={onContextMenu}>
        <div
          className="group relative overflow-hidden rounded-xl bg-black"
          style={{
            width: 220,
            height: 124,
            transition: "box-shadow 80ms linear",
            boxShadow: speaking ? speakingShadow(audioLevel) : "0 0 0 0px transparent",
          }}
        >
          <video ref={videoRef} muted={isLocal} playsInline className="h-full w-full object-cover" />
          {onMaximize && (
            <button
              type="button"
              onClick={onMaximize}
              className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/75 transition-opacity"
              title="Fullscreen"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
          )}
          {isMuted && (
            <div className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#ed4245]">
              <img src={micMuteIcon} alt="Muted" className="h-3 w-3" style={{ filter: "brightness(0) invert(1)" }} />
            </div>
          )}
        </div>
        <span className="text-xs font-semibold max-w-[200px] truncate" style={{ color: "var(--app-text-primary)" }}>
          {displayName}{isLocal ? " (you)" : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2" onContextMenu={onContextMenu}>
      <div className="relative">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white overflow-hidden"
          style={{
            backgroundColor: color.bg,
            transition: "box-shadow 80ms linear",
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

/** Big screenshare viewer — shown above the participant grid when someone shares. */
const ScreenShareViewer = ({ peer, onMaximize }: { peer: GroupPeer; onMaximize: () => void }) => {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && peer.screenStream) {
      ref.current.srcObject = peer.screenStream;
      ref.current.play().catch(() => {});
    }
  }, [peer.screenStream]);
  return (
    <div className="group mx-4 mt-3 rounded-xl overflow-hidden bg-black border relative" style={{ borderColor: "var(--app-border)" }}>
      {/* muted: screen audio is routed through the per-peer GainNode (see
          GroupCallContext ontrack) so the right-click "User Volume" + the
          fullscreen viewer's volume slider both control it. */}
      <video ref={ref} muted playsInline className="w-full max-h-[50vh] object-contain bg-black" />
      <button
        type="button"
        onClick={onMaximize}
        className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
        title="Fullscreen"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
      <div className="px-3 py-2 text-xs" style={{ color: "var(--app-text-secondary)" }}>
        {peer.displayName} is sharing their screen
      </div>
    </div>
  );
};

interface Props {
  conversationId: string;
}

const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

const GroupCallPanel = ({ conversationId }: Props) => {
  const { user } = useAuth();
  const {
    activeCall, peers, selfAudioLevel, leaveCall,
    toggleMute, toggleDeafen, toggleVideo, toggleScreenShare,
    localVideoStream, localScreenStream, ping,
    getUserVolume, setUserVolume, isUserMuted, setUserMuted,
  } = useGroupCall();
  const volumeApi = { getUserVolume, setUserVolume, isUserMuted, setUserMuted };
  const [elapsed, setElapsed] = useState(0);
  const [selfAvatar, setSelfAvatar] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullscreenView, setFullscreenView] = useState<{ stream: MediaStream; name: string; type: "screen" | "cam"; isLocal?: boolean; peerId?: string } | null>(null);
  const [volumeMenu, setVolumeMenu] = useState<{ userId: string; name: string; x: number; y: number } | null>(null);

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
  const sharingPeer = peers.find(p => p.isScreenSharing && p.screenStream);

  const handleShareClick = async () => {
    if (activeCall.isScreenSharing) {
      await toggleScreenShare();
      return;
    }
    if (isElectron) {
      setPickerOpen(true);
    } else {
      await toggleScreenShare();
    }
  };

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

      {sharingPeer && (
        <ScreenShareViewer
          peer={sharingPeer}
          onMaximize={() => sharingPeer.screenStream && setFullscreenView({ stream: sharingPeer.screenStream, name: sharingPeer.displayName, type: "screen", peerId: sharingPeer.userId })}
        />
      )}
      {activeCall.isScreenSharing && localScreenStream && (
        <div className="group mx-4 mt-3 rounded-xl overflow-hidden bg-black border relative" style={{ borderColor: "var(--app-border)" }}>
          <video
            ref={(el) => { if (el && localScreenStream) { el.srcObject = localScreenStream; el.play().catch(() => {}); } }}
            playsInline muted className="w-full max-h-[50vh] object-contain bg-black"
          />
          <button
            type="button"
            onClick={() => setFullscreenView({ stream: localScreenStream, name: displayName, type: "screen", isLocal: true })}
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
            title="Fullscreen"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <div className="px-3 py-2 text-xs" style={{ color: "var(--app-text-secondary)" }}>You're sharing your screen</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-6 px-6 py-6">
        <PeerTile
          userId={user!.id}
          displayName={displayName}
          avatarUrl={selfAvatar}
          audioLevel={selfAudioLevel}
          isMuted={activeCall.isMuted}
          isLocal
          videoStream={activeCall.isVideoOn ? localVideoStream : null}
        />
        {peers.map((p) => (
          <PeerTile
            key={p.userId}
            userId={p.userId}
            displayName={p.displayName}
            avatarUrl={p.avatarUrl}
            audioLevel={p.audioLevel}
            isMuted={p.isMuted}
            videoStream={p.isVideoOn ? p.videoStream : null}
            onMaximize={p.isVideoOn && p.videoStream ? () => setFullscreenView({ stream: p.videoStream!, name: p.displayName, type: "cam" }) : undefined}
            onContextMenu={(e) => { e.preventDefault(); setVolumeMenu({ userId: p.userId, name: p.displayName, x: e.clientX, y: e.clientY }); }}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-3 px-6 pb-5 flex-wrap">
        <button
          onClick={toggleMute}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ${
            activeCall.isMuted ? "bg-white/15 ring-2 ring-[#ed4245]/50" : "bg-white/10 hover:bg-white/20"
          }`}
          title={activeCall.isMuted ? "Unmute" : "Mute"}
        >
          <img src={activeCall.isMuted ? micMuteIcon : micIcon} alt="Mic" className="h-5 w-5"
            style={{ filter: activeCall.isMuted ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)" : "brightness(0) invert(1)" }} />
        </button>

        <button
          onClick={toggleDeafen}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ${
            activeCall.isDeafened ? "bg-white/15 ring-2 ring-[#ed4245]/50" : "bg-white/10 hover:bg-white/20"
          }`}
          title={activeCall.isDeafened ? "Undeafen" : "Deafen"}
        >
          <img src={activeCall.isDeafened ? headphoneDeafenIcon : headphoneIcon} alt="Deafen" className="h-5 w-5"
            style={{ filter: activeCall.isDeafened ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)" : "brightness(0) invert(1)" }} />
        </button>

        <button
          onClick={() => toggleVideo()}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ${
            activeCall.isVideoOn ? "bg-[#3ba55c] hover:bg-[#2d8b4e]" : "bg-white/10 hover:bg-white/20"
          }`}
          title={activeCall.isVideoOn ? "Turn off camera" : "Turn on camera"}
        >
          <img src={videoIcon} alt="Video" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </button>

        <button
          onClick={handleShareClick}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ${
            activeCall.isScreenSharing ? "bg-[#3ba55c] hover:bg-[#2d8b4e]" : "bg-white/10 hover:bg-white/20"
          }`}
          title={activeCall.isScreenSharing ? "Stop sharing screen" : "Share screen"}
        >
          <img src={screenshareIcon} alt="Share" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
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

      {pickerOpen && (
        <ScreenSharePicker
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={async (_type, options) => {
            setPickerOpen(false);
            await toggleScreenShare(options.sourceId);
          }}
        />
      )}

      {fullscreenView && (
        <FullscreenScreenShareViewer
          stream={fullscreenView.stream}
          sharerName={fullscreenView.name}
          type={fullscreenView.type}
          isLocal={fullscreenView.isLocal}
          audioPeerId={fullscreenView.type === "screen" && !fullscreenView.isLocal ? fullscreenView.peerId : undefined}
          volumeApi={volumeApi}
          onClose={() => setFullscreenView(null)}
        />
      )}
    </div>
  );
};

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
