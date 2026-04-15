import { useState, useEffect, useRef } from "react";
import { Maximize2, Minimize2, Monitor } from "lucide-react";
import { useVoice, CallEvent } from "@/contexts/VoiceContext";
import { useAuth } from "@/contexts/AuthContext";
import { defaultProfileColor, getProfileColor } from "@/lib/profileColors";
import ScreenSharePicker, { ScreenShareType } from "./ScreenSharePicker";
import micIcon from "@/assets/icons/microphone.svg";
import micMuteIcon from "@/assets/icons/microphone-mute.svg";
import headphoneIcon from "@/assets/icons/headphone.svg";
import headphoneDeafenIcon from "@/assets/icons/headphone-deafen.svg";
import callIcon from "@/assets/icons/call.svg";
import callEndIcon from "@/assets/icons/call-end.svg";
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

/** Discord-style call panel that renders inside the chat area */
export const CallPanel = ({ conversationId, recipientName, recipientUserId }: {
  conversationId: string;
  recipientName: string;
  recipientUserId?: string;
}) => {
  const { user } = useAuth();
  const {
    activeCall, endCall, toggleMute, toggleDeafen,
    audioLevel, remoteAudioLevel,
    isScreenSharing, startScreenShare, stopScreenShare,
    screenStream, remoteScreenStream,
  } = useVoice();
  const [elapsed, setElapsed] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showScreenSharePicker, setShowScreenSharePicker] = useState(false);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenVideoRef = useRef<HTMLVideoElement>(null);

  const isThisCall = activeCall?.conversationId === conversationId;

  useEffect(() => {
    if (!isThisCall || !activeCall?.startedAt) { setElapsed(0); return; }
    const interval = setInterval(() => {
      setElapsed(Date.now() - (activeCall.startedAt || 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isThisCall, activeCall?.startedAt]);

  useEffect(() => {
    if (screenVideoRef.current && screenStream) {
      screenVideoRef.current.srcObject = screenStream;
    }
  }, [screenStream]);

  useEffect(() => {
    if (remoteScreenVideoRef.current && remoteScreenStream) {
      remoteScreenVideoRef.current.srcObject = remoteScreenStream;
    }
  }, [remoteScreenStream]);

  if (!isThisCall || !activeCall) return null;

  const callerColor = defaultProfileColor;
  const recipientColor = recipientUserId ? getProfileColor(recipientUserId) : { bg: "#5865f2" };
  const displayName = user?.user_metadata?.display_name || "You";
  const isWaiting = activeCall.state === "calling" || activeCall.state === "ringing";
  const isRinging = activeCall.state === "ringing";
  const hasScreenShare = isScreenSharing || !!remoteScreenStream;

  return (
    <div className="mx-4 mt-4 rounded-2xl overflow-hidden border" style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" }}>
      {/* Call header */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: activeCall.state === "connected" ? "#3ba55c" : "#faa61a" }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: activeCall.state === "connected" ? "#3ba55c" : "var(--app-text-secondary)" }}>
            {activeCall.state === "calling" ? "Calling..." : activeCall.state === "ringing" ? "Ringing..." : formatDuration(elapsed)}
          </span>
        </div>
        {hasScreenShare && (
          <div className="flex items-center gap-1.5">
            <Monitor className="h-3.5 w-3.5" style={{ color: "#3ba55c" }} />
            <span className="text-[11px] font-semibold" style={{ color: "#3ba55c" }}>
              {isScreenSharing ? "You're sharing" : "Screen shared"}
            </span>
          </div>
        )}
      </div>

      {/* Screen share view */}
      {hasScreenShare && (
        <div className="relative bg-black">
          {isScreenSharing && screenStream && (
            <video ref={screenVideoRef} autoPlay muted playsInline className="w-full max-h-[400px] object-contain" />
          )}
          {!isScreenSharing && remoteScreenStream && (
            <video ref={remoteScreenVideoRef} autoPlay playsInline className="w-full max-h-[400px] object-contain" />
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={() => {
                const el = (isScreenSharing ? screenVideoRef : remoteScreenVideoRef).current;
                if (el) {
                  if (!document.fullscreenElement) {
                    el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
                  } else {
                    document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
                  }
                }
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Participants area */}
      <div className={`flex items-center justify-center gap-12 px-6 ${hasScreenShare ? "py-4" : "py-8"}`}>
        {/* Current user */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div
              className={`flex items-center justify-center rounded-full font-bold text-white transition-all duration-150 ${hasScreenShare ? "h-12 w-12 text-lg" : "h-[72px] w-[72px] text-2xl"}`}
              style={{
                backgroundColor: callerColor.bg,
                boxShadow: activeCall.state === "connected" && !activeCall.isMuted && audioLevel > 5
                  ? `0 0 0 ${4 + audioLevel * 0.12}px rgba(59, 165, 92, ${0.5 + audioLevel * 0.005}), 0 0 ${10 + audioLevel * 0.4}px rgba(59, 165, 92, ${0.2 + audioLevel * 0.004})`
                  : "0 0 0 0px transparent",
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
            {activeCall.isMuted && (
              <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#ed4245] border-2" style={{ borderColor: "var(--app-bg-tertiary)" }}>
                <img src={micMuteIcon} alt="Muted" className="h-2.5 w-2.5" style={{ filter: "brightness(0) invert(1)" }} />
              </div>
            )}
          </div>
          <span className="text-xs font-semibold" style={{ color: "var(--app-text-primary)" }}>{displayName}</span>
        </div>

        {/* Recipient */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div
              className={`flex items-center justify-center rounded-full font-bold text-white transition-all duration-300 ${hasScreenShare ? "h-12 w-12 text-lg" : "h-[72px] w-[72px] text-2xl"} ${isWaiting ? "opacity-40" : ""}`}
              style={{
                backgroundColor: recipientColor.bg,
                filter: isWaiting ? "grayscale(0.3)" : "none",
                boxShadow: !isWaiting && activeCall.state === "connected" && remoteAudioLevel > 5
                  ? `0 0 0 ${4 + remoteAudioLevel * 0.12}px rgba(59, 165, 92, ${0.5 + remoteAudioLevel * 0.005}), 0 0 ${10 + remoteAudioLevel * 0.4}px rgba(59, 165, 92, ${0.2 + remoteAudioLevel * 0.004})`
                  : "0 0 0 0px transparent",
              }}
            >
              {recipientName.charAt(0).toUpperCase()}
            </div>
            {isRinging && (
              <>
                <div className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: recipientColor.bg, opacity: 0.2 }} />
                <div className="absolute -inset-1 rounded-full animate-pulse border-2 border-[#faa61a]/40" />
              </>
            )}
            {isWaiting && !isRinging && (
              <div className="absolute -inset-1 rounded-full border-2 border-dashed border-[#949ba4]/30 animate-spin" style={{ animationDuration: "8s" }} />
            )}
          </div>
          <span className={`text-xs font-semibold transition-opacity duration-300 ${isWaiting ? "opacity-50" : ""}`} style={{ color: "var(--app-text-primary)" }}>
            {recipientName}
          </span>
          {isWaiting && (
            <span className="text-[10px] font-medium" style={{ color: "var(--app-text-secondary)" }}>
              {isRinging ? "Ringing..." : "Not in call"}
            </span>
          )}
        </div>
      </div>

      {/* Controls bar */}
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
            alt={activeCall.isMuted ? "Unmute" : "Mute"}
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
            alt={activeCall.isDeafened ? "Undeafen" : "Deafen"}
            className="h-5 w-5"
            style={{ filter: activeCall.isDeafened ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)" : "brightness(0) invert(1)" }}
          />
        </button>

        <button
          onClick={() => {
            if (isScreenSharing) {
              stopScreenShare();
            } else {
              setShowScreenSharePicker(true);
            }
          }}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-150 ${
            isScreenSharing ? "bg-[#3ba55c] hover:bg-[#2d8b4e]" : "bg-white/10 hover:bg-white/20"
          }`}
          style={{ color: isScreenSharing ? "white" : "var(--app-text-primary)" }}
          title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
        >
          <img
            src={screenshareIcon}
            alt={isScreenSharing ? "Stop Sharing" : "Share Screen"}
            className="h-5 w-5"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </button>

        <button
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          title="Video (coming soon)"
        >
          <img src={videoIcon} alt="Video" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </button>

        <div className="w-px h-6 mx-1" style={{ backgroundColor: "var(--app-border)" }} />

        <button
          onClick={endCall}
          className="flex h-10 px-5 items-center justify-center gap-2 rounded-full bg-[#ed4245] text-white hover:bg-[#c73b3e] hover:scale-105 hover:shadow-lg hover:shadow-[#ed4245]/30 active:scale-95 transition-all duration-150"
          title="Disconnect"
        >
          <img src={callEndIcon} alt="End Call" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </button>
      </div>

      <ScreenSharePicker
        isOpen={showScreenSharePicker}
        onClose={() => setShowScreenSharePicker(false)}
        onSelect={(type: ScreenShareType, options) => {
          setShowScreenSharePicker(false);
          startScreenShare(type, options);
        }}
      />
    </div>
  );
};

/** Pill-shaped call event shown in chat history */
export const CallEventMessage = ({ state, startedAt, endedAt }: {
  state: "ongoing" | "ended" | "missed";
  startedAt: string;
  endedAt?: string;
  onJoin?: () => void;
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (state !== "ongoing") return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Date.now() - start);
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [state, startedAt]);

  const startTime = new Date(startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const getDurationDisplay = () => {
    if (state === "ongoing") return formatDuration(elapsed);
    if (endedAt) {
      const dur = new Date(endedAt).getTime() - new Date(startedAt).getTime();
      return formatDuration(dur);
    }
    return "0:00";
  };

  return (
    <div className="my-3 flex justify-center">
      <div
        className="flex items-center gap-3 rounded-full border px-4 py-2"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}
      >
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
          state === "ongoing" ? "bg-[#3ba55c]/20" : state === "missed" ? "bg-[#ed4245]/20" : "bg-white/10"
        }`}>
          <img
            src={callIcon}
            alt="Call"
            className="h-4 w-4"
            style={{
              filter: state === "ongoing"
                ? "brightness(0) saturate(100%) invert(58%) sepia(52%) saturate(541%) hue-rotate(93deg) brightness(95%) contrast(91%)"
                : state === "missed"
                ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)"
                : "brightness(0) invert(0.6)"
            }}
          />
        </div>

        <div className="flex flex-col">
          <span className="text-sm font-semibold" style={{
            color: state === "ongoing" ? "#3ba55c" : state === "missed" ? "#ed4245" : "var(--app-text-primary)"
          }}>
            {state === "ongoing" ? "Ongoing Call" : state === "missed" ? "Missed Call" : "Call Ended"}
          </span>
          <span className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
            {startTime} • {getDurationDisplay()}
          </span>
        </div>
      </div>
    </div>
  );
};

/** Incoming call notification overlay */
const VoiceCallOverlay = () => {
  const { incomingCall, activeCall, acceptCall, endCall } = useVoice();

  if (incomingCall && !activeCall) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 rounded-2xl border px-6 py-4 shadow-2xl animate-fade-in"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white animate-pulse"
          style={{ backgroundColor: getProfileColor(incomingCall.callerId).bg }}
        >
          {incomingCall.callerName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
            {incomingCall.callerName}
          </p>
          <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>Incoming voice call...</p>
        </div>
        <button
          onClick={acceptCall}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#3ba55c] text-white hover:bg-[#2d8b4e] transition-colors"
          title="Accept"
        >
          <img src={callIcon} alt="Accept" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </button>
        <button
          onClick={endCall}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ed4245] text-white hover:bg-[#c73b3e] transition-colors"
          title="Decline"
        >
          <img src={callEndIcon} alt="Decline" className="h-5 w-5" style={{ filter: "brightness(0) invert(1)" }} />
        </button>
      </div>
    );
  }

  return null;
};

export default VoiceCallOverlay;