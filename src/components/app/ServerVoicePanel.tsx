import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, MicOff, Headphones } from "lucide-react";
import { useGroupCall, GroupPeer } from "@/contexts/GroupCallContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getProfileColor } from "@/lib/profileColors";
import ScreenSharePicker from "./ScreenSharePicker";
import FullscreenScreenShareViewer from "./FullscreenScreenShareViewer";
import UserVolumeMenu from "./UserVolumeMenu";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneIcon from "@/assets/icons/headphone.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";
import callEndIcon from "@/assets/icons/call-end.svg";
import videoIcon from "@/assets/icons/video-camera.svg";
import screenshareIcon from "@/assets/icons/screenshare.svg";

/**
 * Server-voice-channel UI. Deliberately distinct from GroupCallPanel (which
 * is shaped like a DM group call): instead of a tight rounded card with a
 * "Group Call · 12:34" pill, this is a full-bleed channel surface with
 * Discord-style rectangular member tiles and a single bottom action bar.
 */

const SPEAKING_THRESHOLD = 6;
const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

interface MemberTileProps {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  audioLevel: number;
  isMuted: boolean;
  isDeafened?: boolean;
  isLocal?: boolean;
  videoStream?: MediaStream | null;
  onMaximize?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const MemberTile = ({
  userId, displayName, avatarUrl, audioLevel, isMuted, isDeafened,
  isLocal, videoStream, onMaximize, onContextMenu,
}: MemberTileProps) => {
  const color = getProfileColor(userId);
  const speaking = audioLevel > SPEAKING_THRESHOLD && !isMuted;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current && videoStream) {
      videoRef.current.srcObject = videoStream;
      videoRef.current.play().catch(() => {});
    }
  }, [videoStream]);

  return (
    <div
      onContextMenu={onContextMenu}
      className="group relative overflow-hidden rounded-lg flex flex-col items-center justify-center transition-shadow"
      style={{
        backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
        aspectRatio: "16 / 10",
        boxShadow: speaking
          ? "inset 0 0 0 2px #3ba55c"
          : "inset 0 0 0 1px var(--app-border, rgba(255,255,255,0.04))",
      }}
    >
      {videoStream ? (
        <video
          ref={videoRef}
          muted={isLocal}
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-20 w-20 rounded-full object-cover"
              style={{ boxShadow: speaking ? "0 0 0 3px #3ba55c" : "none" }}
            />
          ) : (
            <div
              className="h-20 w-20 rounded-full flex items-center justify-center text-2xl font-bold text-white"
              style={{
                backgroundColor: color.bg,
                boxShadow: speaking ? "0 0 0 3px #3ba55c" : "none",
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Name bottom-left, Discord style */}
      <div
        className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center gap-1.5 rounded px-1.5 py-0.5"
        style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      >
        <span className="truncate text-[12px] font-semibold text-white">{displayName}</span>
        {isMuted && <MicOff className="h-3 w-3 shrink-0" style={{ color: "#ed4245" }} />}
        {isDeafened && <Headphones className="h-3 w-3 shrink-0" style={{ color: "#ed4245" }} />}
      </div>

      {videoStream && onMaximize && (
        <button
          type="button"
          onClick={onMaximize}
          className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
          title="Fullscreen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

interface Props {
  conversationId: string;
}

const ServerVoicePanel = ({ conversationId }: Props) => {
  const { user } = useAuth();
  const {
    activeCall, peers, selfAudioLevel, leaveCall,
    toggleMute, toggleDeafen, toggleVideo, toggleScreenShare,
    localVideoStream, localScreenStream,
    getUserVolume, setUserVolume, isUserMuted, setUserMuted,
  } = useGroupCall();
  const volumeApi = { getUserVolume, setUserVolume, isUserMuted, setUserMuted };
  const [selfAvatar, setSelfAvatar] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullscreenView, setFullscreenView] = useState<{
    stream: MediaStream; name: string; type: "screen" | "cam"; isLocal?: boolean; peerId?: string;
  } | null>(null);
  const [volumeMenu, setVolumeMenu] = useState<{ userId: string; name: string; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("avatar_url").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => setSelfAvatar(data?.avatar_url || null));
  }, [user]);

  const inThisChannel = !!activeCall && activeCall.conversationId === conversationId;
  const sharingPeer = useMemo(
    () => (inThisChannel ? peers.find((p) => p.isScreenSharing && p.screenStream) : undefined),
    [peers, inThisChannel],
  );

  if (!inThisChannel || !activeCall) return null;

  const displayName = user?.user_metadata?.display_name || "You";

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

  const totalMembers = peers.length + 1;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Scrolling content area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        {/* Active screen share — large prominent tile at top */}
        {sharingPeer && sharingPeer.screenStream && (
          <div
            className="group relative mb-6 overflow-hidden rounded-xl bg-black"
            style={{ border: "1px solid var(--app-border)" }}
          >
            <video
              ref={(el) => {
                if (el && sharingPeer.screenStream) {
                  el.srcObject = sharingPeer.screenStream;
                  el.play().catch(() => {});
                }
              }}
              playsInline
              className="w-full max-h-[55vh] object-contain bg-black"
            />
            <button
              type="button"
              onClick={() =>
                sharingPeer.screenStream &&
                setFullscreenView({
                  stream: sharingPeer.screenStream,
                  name: sharingPeer.displayName,
                  type: "screen",
                  peerId: sharingPeer.userId,
                })
              }
              className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
              title="Fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <div
              className="absolute bottom-3 left-3 rounded px-2 py-1 text-xs font-medium"
              style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "white" }}
            >
              {sharingPeer.displayName} is sharing
            </div>
          </div>
        )}

        {activeCall.isScreenSharing && localScreenStream && (
          <div
            className="group relative mb-6 overflow-hidden rounded-xl bg-black"
            style={{ border: "1px solid var(--app-border)" }}
          >
            <video
              ref={(el) => {
                if (el && localScreenStream) {
                  el.srcObject = localScreenStream;
                  el.play().catch(() => {});
                }
              }}
              playsInline
              muted
              className="w-full max-h-[55vh] object-contain bg-black"
            />
            <button
              type="button"
              onClick={() =>
                setFullscreenView({ stream: localScreenStream, name: displayName, type: "screen", isLocal: true })
              }
              className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80 transition-opacity"
              title="Fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <div
              className="absolute bottom-3 left-3 rounded px-2 py-1 text-xs font-medium"
              style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "white" }}
            >
              You're sharing your screen
            </div>
          </div>
        )}

        {/* Connected count */}
        <div
          className="mb-3 text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "var(--app-text-secondary)" }}
        >
          Connected — {totalMembers}
        </div>

        {/* Member tile grid — rectangular, Discord-style */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
        >
          <MemberTile
            userId={user!.id}
            displayName={displayName}
            avatarUrl={selfAvatar}
            audioLevel={selfAudioLevel}
            isMuted={activeCall.isMuted}
            isDeafened={activeCall.isDeafened}
            isLocal
            videoStream={activeCall.isVideoOn ? localVideoStream : null}
          />
          {peers.map((p) => (
            <MemberTile
              key={p.userId}
              userId={p.userId}
              displayName={p.displayName}
              avatarUrl={p.avatarUrl}
              audioLevel={p.audioLevel}
              isMuted={p.isMuted}
              videoStream={p.videoStream || null}
              onMaximize={
                p.videoStream
                  ? () => setFullscreenView({ stream: p.videoStream!, name: p.displayName, type: "cam" })
                  : undefined
              }
              onContextMenu={(e) => {
                e.preventDefault();
                setVolumeMenu({ userId: p.userId, name: p.displayName, x: e.clientX, y: e.clientY });
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom action bar — full-width, fixed, distinct from DM-group panel */}
      <div
        className="flex items-center justify-center gap-3 px-6 py-3 border-t"
        style={{ borderColor: "var(--app-border)", backgroundColor: "var(--app-bg-secondary)" }}
      >
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
            style={{
              filter: activeCall.isMuted
                ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)"
                : "brightness(0) invert(1)",
            }}
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
            style={{
              filter: activeCall.isDeafened
                ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)"
                : "brightness(0) invert(1)",
            }}
          />
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
          title="Disconnect"
        >
          <img src={callEndIcon} alt="Leave" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          <span className="text-sm font-semibold">Disconnect</span>
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

      {volumeMenu && (
        <UserVolumeMenu
          userId={volumeMenu.userId}
          displayName={volumeMenu.name}
          x={volumeMenu.x}
          y={volumeMenu.y}
          volumeApi={volumeApi}
          onClose={() => setVolumeMenu(null)}
        />
      )}
      {fullscreenView && (
        <FullscreenScreenShareViewer
          stream={fullscreenView.stream}
          sharerName={fullscreenView.name}
          type={fullscreenView.type}
          isLocal={fullscreenView.isLocal}
          peerUserId={fullscreenView.isLocal ? undefined : fullscreenView.peerId}
          onClose={() => setFullscreenView(null)}
        />
      )}
    </div>
  );
};

export default ServerVoicePanel;
