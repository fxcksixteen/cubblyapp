import { useEffect, useRef, useState } from "react";
import { ChevronDown, Volume2, MessageSquare, Sparkles, Maximize2 } from "lucide-react";
import { useVoice } from "@/contexts/VoiceContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCallParticipants } from "@/hooks/useCallParticipants";
import { useConversations } from "@/hooks/useConversations";
import { useNavigate } from "react-router-dom";
import { defaultProfileColor, getProfileColor } from "@/lib/profileColors";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import callEndIcon from "@/assets/icons/call-end.svg";
import videoIcon from "@/assets/icons/video-camera.svg";
import screenshareIcon from "@/assets/icons/screenshare.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";

interface Props {
  conversationId: string;
  recipientName: string;
  recipientAvatar?: string;
  recipientUserId?: string;
}

const SPEAKING_THRESHOLD = 10;

/**
 * iOS PWA / mobile fullscreen call view.
 *
 * Discord-style layout:
 *   - Top bar: minimize chevron, conversation name, output speaker icon
 *   - Center: large rounded "voice tile" per participant — avatar centered,
 *     name pill at bottom, animated GREEN border when that user is speaking
 *     (matches Discord's voice-channel speaking indicator)
 *   - Bottom controls: camera, mic, chat, screenshare, end call
 *
 * Minimized mode shows the same compact pill that floats above the bottom
 * nav so the user can keep navigating the rest of the app.
 */
const MobileCallOverlay = ({ conversationId, recipientName, recipientAvatar, recipientUserId }: Props) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { conversations } = useConversations();
  const {
    activeCall, endCall,
    toggleMute, toggleDeafen, toggleVideo,
    audioLevel, remoteAudioLevel,
    isScreenSharing, startScreenShare, stopScreenShare,
    localVideoStream, remoteVideoStream,
    currentCallEventId, peerInstantState,
  } = useVoice();
  const { getPeerState } = useCallParticipants(activeCall?.conversationId === conversationId ? currentCallEventId : null);
  const dbPeerState = getPeerState();
  const peerState = {
    ...dbPeerState,
    ...(peerInstantState.is_muted !== undefined ? { is_muted: peerInstantState.is_muted } : {}),
    ...(peerInstantState.is_deafened !== undefined ? { is_deafened: peerInstantState.is_deafened } : {}),
    ...(peerInstantState.is_video_on !== undefined ? { is_video_on: peerInstantState.is_video_on } : {}),
  };

  const [minimized, setMinimized] = useState(false);
  const localCamRef = useRef<HTMLVideoElement>(null);
  const remoteCamRef = useRef<HTMLVideoElement>(null);

  const isThisCall = activeCall?.conversationId === conversationId;

  // Wire camera streams
  useEffect(() => {
    const el = localCamRef.current;
    if (!el) return;
    el.srcObject = localVideoStream || null;
    if (localVideoStream) el.play().catch(() => {});
  }, [localVideoStream]);
  useEffect(() => {
    const el = remoteCamRef.current;
    if (!el) return;
    el.srcObject = remoteVideoStream || null;
    if (remoteVideoStream) el.play().catch(() => {});
  }, [remoteVideoStream]);

  if (!isThisCall || !activeCall) return null;

  const conv = conversations.find(c => c.id === conversationId);
  const convTitle = conv?.is_group ? (conv.name || "Group call") : recipientName;
  const ringTimedOut = !!activeCall.ringTimedOut;
  const peerLeft = !!activeCall.peerLeftAt;
  const showNotInCall = ringTimedOut || peerLeft;
  const isWaiting = activeCall.state === "calling" || activeCall.state === "ringing" || peerLeft;
  const isRinging = (activeCall.state === "ringing") && !ringTimedOut && !peerLeft;
  const stateLabel = activeCall.state === "connected" && !peerLeft
    ? "In call"
    : showNotInCall ? "Not in call" : isRinging ? "Ringing…" : "Calling…";

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 rounded-full px-4 py-2.5 shadow-2xl active:scale-95 transition-transform animate-fade-in"
        style={{
          bottom: `calc(56px + env(safe-area-inset-bottom, 0px) + 12px)`,
          backgroundColor: activeCall.state === "connected" && !peerLeft ? "#3ba55c" : showNotInCall ? "#4f545c" : "#faa61a",
          color: "white",
        }}
      >
        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
        <span className="text-sm font-semibold">
          {activeCall.state === "connected" && !peerLeft ? "In call with " : showNotInCall ? "Waiting for " : "Calling "}{recipientName}
        </span>
        <Maximize2 className="h-4 w-4 ml-1" />
      </button>
    );
  }

  const callerColor = defaultProfileColor;
  const recipientColor = recipientUserId ? getProfileColor(recipientUserId) : { bg: "#5865f2" };
  const myDisplayName = user?.user_metadata?.display_name || "You";
  const myAvatar = (user?.user_metadata?.avatar_url as string | undefined) || undefined;

  const goToChat = () => {
    setMinimized(true);
    navigate(`/@me/chat/${conversationId}`);
  };

  // Tile renderer (Discord-style: avatar centered on a rounded card,
  // animated green ring while speaking, name pill at bottom)
  const Tile = ({
    name, avatar, color, speakingLevel, isMuted, isDeafened, isVideoOn, videoStream, videoRef, mirrored, faded,
  }: {
    name: string;
    avatar?: string;
    color: string;
    speakingLevel: number;
    isMuted?: boolean;
    isDeafened?: boolean;
    isVideoOn?: boolean;
    videoStream?: MediaStream | null;
    videoRef?: React.RefObject<HTMLVideoElement>;
    mirrored?: boolean;
    faded?: boolean;
  }) => {
    const speaking = !faded && speakingLevel > SPEAKING_THRESHOLD && !isMuted;
    return (
      <div
        className="relative w-full aspect-square rounded-[28px] overflow-hidden flex items-center justify-center"
        style={{
          backgroundColor: "#36393f",
          transition: "box-shadow 80ms linear",
          boxShadow: speaking
            ? "inset 0 0 0 4px rgba(59, 165, 92, 0.95), 0 0 24px rgba(59, 165, 92, 0.55)"
            : "inset 0 0 0 1px rgba(255,255,255,0.04)",
          opacity: faded ? 0.55 : 1,
        }}
      >
        {isVideoOn && videoStream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
          />
        ) : (
          <div
            className="flex h-[120px] w-[120px] items-center justify-center rounded-full text-3xl font-bold text-white overflow-hidden"
            style={{ backgroundColor: color }}
          >
            {avatar
              ? <img src={avatar} alt={name} className="h-full w-full object-cover" />
              : name.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Name pill */}
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full px-3 py-1"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
        >
          {isDeafened ? (
            <img src={headphoneDeafenIcon} alt="Deafened" className="h-3 w-3" style={{ filter: "brightness(0) saturate(100%) invert(40%) sepia(89%) saturate(2900%) hue-rotate(338deg) brightness(95%) contrast(95%)" }} />
          ) : isMuted ? (
            <img src={micMuteIcon} alt="Muted" className="h-3 w-3" style={{ filter: "brightness(0) saturate(100%) invert(40%) sepia(89%) saturate(2900%) hue-rotate(338deg) brightness(95%) contrast(95%)" }} />
          ) : null}
          <span className="text-[12px] font-semibold text-white truncate max-w-[150px]">{name}</span>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col mobile-chrome animate-fade-in"
      style={{
        backgroundColor: "#000",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-3 shrink-0">
        <button
          onClick={() => setMinimized(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10 touch-manipulation"
          aria-label="Minimize"
        >
          <ChevronDown className="h-6 w-6 text-white" />
        </button>
        <button
          onClick={goToChat}
          className="flex items-center gap-1 text-white font-semibold text-[15px] active:opacity-70"
        >
          <span className="truncate max-w-[55vw]">{convTitle}</span>
          <span className="text-white/40 text-base leading-none">›</span>
        </button>
        <button
          onClick={toggleDeafen}
          className="flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10 touch-manipulation"
          aria-label={activeCall.isDeafened ? "Undeafen" : "Deafen"}
        >
          <Volume2
            className="h-6 w-6"
            style={{ color: activeCall.isDeafened ? "#ed4245" : "white" }}
          />
        </button>
      </div>

      {/* State sub-label (Calling… / Ringing… / Not in call / In call) */}
      <div className="text-center text-[12px] uppercase tracking-[0.18em] font-semibold pb-1" style={{ color: activeCall.state === "connected" && !peerLeft ? "#3ba55c" : showNotInCall ? "#949ba4" : "#faa61a" }}>
        {stateLabel}
      </div>

      {/* Tiles area */}
      <div className="flex-1 flex items-center justify-center px-5">
        <div className="w-full max-w-[380px] flex flex-col gap-4">
          {/* Peer tile (large, primary) */}
          <Tile
            name={recipientName}
            avatar={recipientAvatar}
            color={recipientColor.bg}
            speakingLevel={remoteAudioLevel}
            isMuted={peerState?.is_muted}
            isDeafened={peerState?.is_deafened}
            isVideoOn={peerState?.is_video_on}
            videoStream={remoteVideoStream}
            videoRef={remoteCamRef}
            faded={isWaiting}
          />
          {/* Self tile only renders when video is on, or when in a group (not implemented here for 1-on-1 we keep it minimal) */}
          {activeCall.isVideoOn && localVideoStream && (
            <Tile
              name={myDisplayName}
              avatar={myAvatar}
              color={callerColor.bg}
              speakingLevel={audioLevel}
              isMuted={activeCall.isMuted}
              isDeafened={activeCall.isDeafened}
              isVideoOn={true}
              videoStream={localVideoStream}
              videoRef={localCamRef}
              mirrored
            />
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="px-3 pb-3 pt-2 shrink-0">
        <div
          className="flex items-center justify-between rounded-[28px] px-3 py-3"
          style={{ backgroundColor: "#1e1f22" }}
        >
          {/* Camera */}
          <button
            onClick={() => { toggleVideo(); }}
            className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95 touch-manipulation"
            style={{ backgroundColor: activeCall.isVideoOn ? "#3ba55c" : "#2b2d31" }}
            aria-label={activeCall.isVideoOn ? "Turn camera off" : "Turn camera on"}
          >
            <img src={videoIcon} alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </button>

          {/* Mic */}
          <button
            onClick={toggleMute}
            className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95 touch-manipulation"
            style={{ backgroundColor: activeCall.isMuted ? "#ed4245" : "#2b2d31" }}
            aria-label={activeCall.isMuted ? "Unmute" : "Mute"}
          >
            <img src={activeCall.isMuted ? micMuteIcon : micIcon} alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </button>

          {/* Chat */}
          <button
            onClick={goToChat}
            className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95 touch-manipulation"
            style={{ backgroundColor: "#2b2d31" }}
            aria-label="Open chat"
          >
            <MessageSquare className="h-5 w-5 text-white" />
          </button>

          {/* Screen share (mobile browsers mostly can't share — this hands off
              to startScreenShare which will prompt or no-op gracefully) */}
          <button
            onClick={() => { isScreenSharing ? stopScreenShare() : startScreenShare(); }}
            className="flex h-12 w-12 items-center justify-center rounded-full active:scale-95 touch-manipulation"
            style={{ backgroundColor: isScreenSharing ? "#3ba55c" : "#2b2d31" }}
            aria-label={isScreenSharing ? "Stop sharing" : "Share screen"}
          >
            <img src={screenshareIcon} alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </button>

          {/* End call */}
          <button
            onClick={endCall}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ed4245] active:bg-[#c73b3e] touch-manipulation"
            aria-label="End call"
          >
            <img src={callEndIcon} alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileCallOverlay;
