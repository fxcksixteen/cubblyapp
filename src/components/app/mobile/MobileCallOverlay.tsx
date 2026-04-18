import { useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { CallPanel } from "../VoiceCallOverlay";
import { useVoice } from "@/contexts/VoiceContext";

interface Props {
  conversationId: string;
  recipientName: string;
  recipientAvatar?: string;
  recipientUserId?: string;
}

/** Wraps CallPanel as a fullscreen overlay on mobile, with a minimize-to-pill option. */
const MobileCallOverlay = (props: Props) => {
  const { activeCall, endCall } = useVoice();
  const [minimized, setMinimized] = useState(false);

  const isThisCall = activeCall?.conversationId === props.conversationId;
  if (!isThisCall || !activeCall) return null;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-4 py-2.5 shadow-2xl active:scale-95 transition-transform animate-fade-in"
        style={{
          backgroundColor: activeCall.state === "connected" ? "#3ba55c" : "#faa61a",
          color: "white",
          paddingBottom: `calc(0.625rem + env(safe-area-inset-bottom, 0px))`,
          marginBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
        <span className="text-sm font-semibold">
          {activeCall.state === "connected" ? "In call with " : "Calling "}{props.recipientName}
        </span>
        <Maximize2 className="h-4 w-4 ml-1" />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col mobile-chrome animate-fade-in"
      style={{
        backgroundColor: "var(--app-bg-tertiary)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      {/* Top bar with minimize/close */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          onClick={() => setMinimized(true)}
          className="flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10 touch-manipulation"
          aria-label="Minimize"
        >
          <Minimize2 className="h-5 w-5 text-white" />
        </button>
        <span className="text-sm font-semibold uppercase tracking-wider text-white/70">Voice Call</span>
        <button
          onClick={endCall}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ed4245] active:bg-[#c73b3e] touch-manipulation"
          aria-label="End call"
        >
          <X className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* CallPanel content fills the rest. Padding-bottom (not margin) so the
          end-call controls inside CallPanel never get clipped behind the iPhone
          home-indicator safe area. */}
      <div
        className="flex-1 overflow-y-auto -mx-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <CallPanel {...props} />
      </div>
    </div>
  );
};

export default MobileCallOverlay;
