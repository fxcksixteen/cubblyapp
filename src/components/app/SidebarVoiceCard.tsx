import { useEffect, useMemo, useState } from "react";
import { useVoice } from "@/contexts/VoiceContext";
import { Conversation } from "@/hooks/useConversations";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import callEndIcon from "@/assets/icons/call-end.svg";
import videoIcon from "@/assets/icons/video-camera.svg";
import screenshareIcon from "@/assets/icons/screenshare.svg";

/**
 * Discord-style "Voice Connected" card shown above the user panel in the DM
 * sidebar whenever the user is in (or joining) a voice call.
 *
 * Renders nothing when there's no active call.
 */

const formatPing = (ping: number) => (ping > 0 ? `${ping} ms` : "—");

/** WiFi-style 4-bar signal indicator, colored by ping quality. */
const PingBars = ({ ping }: { ping: number }) => {
  // 4 bars filled by quality buckets
  const bars =
    ping === 0 ? 0 :
    ping < 60 ? 4 :
    ping < 120 ? 3 :
    ping < 200 ? 2 : 1;
  const color =
    ping === 0 ? "#949ba4" :
    ping < 120 ? "#3ba55c" :
    ping < 200 ? "#faa61a" : "#ed4245";

  return (
    <div className="flex items-end gap-[2px] h-[14px]">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm transition-colors"
          style={{
            height: `${4 + i * 2.5}px`,
            backgroundColor: i <= bars ? color : "rgba(148,155,164,0.3)",
          }}
        />
      ))}
    </div>
  );
};

interface Props {
  conversations: Conversation[];
  /** Open the chat view that owns this call (so user can see the full call panel). */
  onOpenCall: (conversationId: string) => void;
}

const SidebarVoiceCard = ({ conversations, onOpenCall }: Props) => {
  const {
    activeCall, endCall, ping,
    isScreenSharing, startScreenShare, stopScreenShare,
    toggleVideo,
  } = useVoice();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeCall?.startedAt) { setElapsed(0); return; }
    const interval = setInterval(() => setElapsed(Date.now() - (activeCall.startedAt || 0)), 1000);
    return () => clearInterval(interval);
  }, [activeCall?.startedAt]);

  const conv = useMemo(
    () => conversations.find((c) => c.id === activeCall?.conversationId),
    [conversations, activeCall?.conversationId],
  );

  if (!activeCall) return null;

  const isConnected = activeCall.state === "connected";
  const stateLabel =
    activeCall.state === "connected" ? "Voice Connected" :
    activeCall.state === "calling" ? "Calling..." :
    activeCall.state === "ringing" ? "Ringing..." :
    "Connecting...";

  // Resolve location label: DM = friend's display name, group = name or members
  const locationLabel = conv
    ? (conv.is_group
        ? (conv.name || conv.members.map((m) => m.display_name).slice(0, 3).join(", ") || "Group")
        : conv.participant.display_name)
    : activeCall.peerName;

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="mx-2 mb-1.5 rounded-lg p-2.5 animate-fade-in"
      style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={() => activeCall && onOpenCall(activeCall.conversationId)}
          className="flex items-center gap-1.5 group min-w-0 flex-1 text-left"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            {isConnected && (
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{ backgroundColor: "#3ba55c", opacity: 0.6 }}
              />
            )}
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: isConnected ? "#3ba55c" : "#faa61a" }}
            />
          </span>
          <span
            className="truncate text-[11px] font-bold uppercase tracking-wide group-hover:underline"
            style={{ color: isConnected ? "#3ba55c" : "#faa61a" }}
          >
            {stateLabel}
          </span>
        </button>
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="ml-2 rounded p-0.5 cursor-help" aria-label="Network ping">
                <PingBars ping={ping} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Ping: {formatPing(ping)}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <button
        onClick={() => activeCall && onOpenCall(activeCall.conversationId)}
        className="block w-full text-left mb-2 group"
      >
        <p className="truncate text-[13px] font-semibold text-white leading-tight group-hover:underline">
          {locationLabel}
        </p>
        {isConnected && (
          <p className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
            {formatTime(elapsed)}
          </p>
        )}
      </button>

      <div className="flex items-center gap-1">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => toggleVideo()}
                className="flex-1 flex items-center justify-center rounded-md py-1.5 transition-colors"
                style={{ backgroundColor: activeCall.isVideoOn ? "rgba(59,165,92,0.2)" : "rgba(255,255,255,0.06)" }}
                onMouseEnter={(e) => { if (!activeCall.isVideoOn) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={(e) => { if (!activeCall.isVideoOn) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; }}
                aria-label={activeCall.isVideoOn ? "Turn off camera" : "Turn on camera"}
              >
                <img
                  src={videoIcon}
                  alt=""
                  className="h-[16px] w-[16px]"
                  style={{
                    filter: activeCall.isVideoOn
                      ? "invert(60%) sepia(56%) saturate(412%) hue-rotate(82deg) brightness(91%) contrast(89%)"
                      : "invert(70%)",
                  }}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {activeCall.isVideoOn ? "Stop Video" : "Start Video"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => isScreenSharing ? stopScreenShare() : startScreenShare()}
                className="flex-1 flex items-center justify-center rounded-md py-1.5 transition-colors"
                style={{ backgroundColor: isScreenSharing ? "rgba(59,165,92,0.2)" : "rgba(255,255,255,0.06)" }}
                onMouseEnter={(e) => { if (!isScreenSharing) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={(e) => { if (!isScreenSharing) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; }}
                aria-label={isScreenSharing ? "Stop screen share" : "Share your screen"}
              >
                <img
                  src={screenshareIcon}
                  alt=""
                  className="h-[16px] w-[16px]"
                  style={{
                    filter: isScreenSharing
                      ? "invert(60%) sepia(56%) saturate(412%) hue-rotate(82deg) brightness(91%) contrast(89%)"
                      : "invert(70%)",
                  }}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {isScreenSharing ? "Stop Sharing" : "Share Screen"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={endCall}
                className="flex-1 flex items-center justify-center rounded-md py-1.5 transition-colors"
                style={{ backgroundColor: "#ed4245" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#c73b3e")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ed4245")}
                aria-label="Disconnect"
              >
                <img
                  src={callEndIcon}
                  alt=""
                  className="h-[16px] w-[16px]"
                  style={{ filter: "invert(100%)" }}
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Disconnect
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default SidebarVoiceCard;
