import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useVoice } from "@/contexts/VoiceContext";
import { Phone, PhoneOff } from "lucide-react";

/**
 * Floating pill that appears app-wide whenever the user is in an active call
 * but is currently NOT viewing the conversation that the call belongs to.
 *
 * Click → jump to the call's chat. The X button hangs up.
 *
 * Discord shows the same kind of pill on its sidebar; we use a floating bottom
 * variant so it works on every page (DM, Friends, Shop, You, etc.) and on
 * mobile (sits above the bottom nav).
 */
const GlobalCallIndicator = () => {
  const { activeCall, endCall } = useVoice();
  const navigate = useNavigate();
  const location = useLocation();
  const [elapsed, setElapsed] = useState(0);

  // Tick a duration counter while connected
  useEffect(() => {
    if (!activeCall?.startedAt) {
      setElapsed(0);
      return;
    }
    const i = setInterval(() => setElapsed(Date.now() - (activeCall.startedAt || 0)), 1000);
    return () => clearInterval(i);
  }, [activeCall?.startedAt]);

  if (!activeCall) return null;

  // Hide when the user is already on the call's chat — that screen has the full call panel
  const onCallsChat = location.pathname.includes(`/chat/${activeCall.conversationId}`);
  if (onCallsChat) return null;

  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed / 1000) % 60);
  const timeStr = activeCall.state === "connected"
    ? `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    : activeCall.state === "ringing" ? "Ringing…" : "Connecting…";

  const goToCall = () => {
    navigate(`/@me/chat/${activeCall.conversationId}`);
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[150] animate-fade-in pointer-events-auto"
      style={{
        // Sit above the mobile bottom nav (56px + safe area) on small screens; lower on desktop
        bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div
        className="flex items-center gap-2 rounded-full px-2.5 py-1.5 shadow-2xl"
        style={{
          backgroundColor: "rgba(20, 22, 26, 0.92)",
          backdropFilter: "blur(18px) saturate(140%)",
          WebkitBackdropFilter: "blur(18px) saturate(140%)",
          border: "1px solid rgba(59, 165, 92, 0.45)",
          boxShadow:
            "0 10px 36px rgba(0,0,0,0.55), 0 0 0 1px rgba(59,165,92,0.15)",
        }}
      >
        <button
          onClick={goToCall}
          className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:opacity-90 transition-opacity"
          title="Return to call"
        >
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: "#3ba55c" }}>
            <Phone className="h-3.5 w-3.5 text-white" />
            <span className="absolute -inset-0.5 rounded-full animate-ping" style={{ backgroundColor: "#3ba55c", opacity: 0.35 }} />
          </span>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[11px] font-semibold text-white truncate max-w-[140px]">{activeCall.peerName}</span>
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.65)" }}>
              {timeStr}
            </span>
          </div>
        </button>
        <button
          onClick={endCall}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-[#ed4245]"
          style={{ backgroundColor: "rgba(237, 66, 69, 0.85)" }}
          title="End call"
        >
          <PhoneOff className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
    </div>
  );
};

export default GlobalCallIndicator;
