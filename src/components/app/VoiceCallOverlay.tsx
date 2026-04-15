import { useState, useEffect } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useVoice } from "@/contexts/VoiceContext";

const formatDuration = (ms: number) => {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const VoiceCallOverlay = () => {
  const { activeCall, incomingCall, acceptCall, endCall, toggleMute, toggleDeafen, audioLevel } = useVoice();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!activeCall?.startedAt) { setElapsed(0); return; }
    const interval = setInterval(() => {
      setElapsed(Date.now() - (activeCall.startedAt || 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.startedAt]);

  // Incoming call banner
  if (incomingCall && !activeCall) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 rounded-2xl border px-6 py-4 shadow-2xl animate-in slide-in-from-top-4"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5865f2] text-lg font-bold text-white animate-pulse">
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
          <Phone className="h-4 w-4" />
        </button>
        <button
          onClick={endCall}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ed4245] text-white hover:bg-[#c73b3e] transition-colors"
          title="Decline"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (!activeCall) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-2xl border px-5 py-3 shadow-2xl"
      style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}>
      {/* Avatar with audio level ring */}
      <div className="relative">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5865f2] text-sm font-bold text-white transition-shadow"
          style={{
            boxShadow: activeCall.state === "connected" && audioLevel > 5
              ? `0 0 0 ${2 + audioLevel * 0.06}px rgba(59, 165, 92, ${0.3 + audioLevel * 0.007})`
              : "none",
          }}
        >
          {activeCall.peerName.charAt(0).toUpperCase()}
        </div>
        {activeCall.state === "connected" && (
          <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 bg-[#3ba55c]"
            style={{ borderColor: "var(--app-bg-secondary)" }} />
        )}
      </div>

      <div className="min-w-[100px]">
        <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
          {activeCall.peerName}
        </p>
        <p className="text-[11px]" style={{ color: activeCall.state === "connected" ? "#3ba55c" : "var(--app-text-secondary)" }}>
          {activeCall.state === "calling" ? "Calling..." : activeCall.state === "ringing" ? "Ringing..." : formatDuration(elapsed)}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={toggleMute}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            activeCall.isMuted ? "bg-[#ed4245]/20 text-[#ed4245]" : "bg-white/10 hover:bg-white/20"
          }`}
          style={activeCall.isMuted ? {} : { color: "var(--app-text-primary)" }}
          title={activeCall.isMuted ? "Unmute" : "Mute"}
        >
          {activeCall.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>

        <button
          onClick={toggleDeafen}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            activeCall.isDeafened ? "bg-[#ed4245]/20 text-[#ed4245]" : "bg-white/10 hover:bg-white/20"
          }`}
          style={activeCall.isDeafened ? {} : { color: "var(--app-text-primary)" }}
          title={activeCall.isDeafened ? "Undeafen" : "Deafen"}
        >
          {activeCall.isDeafened ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

        <button
          onClick={endCall}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#ed4245] text-white hover:bg-[#c73b3e] transition-colors"
          title="End Call"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default VoiceCallOverlay;
