import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGroupCall } from "@/contexts/GroupCallContext";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ScreenSharePicker, { ScreenShareType } from "./ScreenSharePicker";
import callEndIcon from "@/assets/icons/call-end.svg";
import videoIcon from "@/assets/icons/video-camera.svg";
import screenshareIcon from "@/assets/icons/screenshare.svg";

const formatPing = (ping: number) => (ping > 0 ? `${ping} ms` : "—");

const PingBars = ({ ping }: { ping: number }) => {
  const bars = ping === 0 ? 0 : ping < 60 ? 4 : ping < 120 ? 3 : ping < 200 ? 2 : 1;
  const color = ping === 0 ? "#949ba4" : ping < 120 ? "#3ba55c" : ping < 200 ? "#faa61a" : "#ed4245";
  return (
    <div className="flex items-end gap-[2px] h-[14px]">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm transition-colors"
          style={{ height: `${4 + i * 2.5}px`, backgroundColor: i <= bars ? color : "rgba(148,155,164,0.3)" }}
        />
      ))}
    </div>
  );
};

/**
 * Shown above the user panel when the user is connected to a SERVER voice
 * channel (group call). Mirrors SidebarVoiceCard so DM and server calls feel
 * identical from the sidebar.
 */
const SidebarGroupCallCard = () => {
  const { activeCall, leaveCall, ping, toggleVideo } = useGroupCall();
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const [serverInfo, setServerInfo] = useState<{ server_id: string; server_name: string; channel_id: string } | null>(null);

  // Resolve which server/channel owns this group call so the card can deep-link back.
  useEffect(() => {
    if (!activeCall) { setServerInfo(null); return; }
    let cancelled = false;
    (async () => {
      const { data: ch } = await supabase
        .from("server_channels")
        .select("id, server_id, servers(name)")
        .eq("conversation_id", activeCall.conversationId)
        .maybeSingle();
      if (cancelled || !ch) return;
      setServerInfo({
        server_id: (ch as any).server_id,
        server_name: (ch as any).servers?.name || "Server",
        channel_id: (ch as any).id,
      });
    })();
    return () => { cancelled = true; };
  }, [activeCall?.conversationId]);

  useEffect(() => {
    if (!activeCall?.joinedAt) { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(Date.now() - activeCall.joinedAt), 1000);
    return () => clearInterval(t);
  }, [activeCall?.joinedAt]);

  if (!activeCall) return null;
  // Only show for SERVER calls — DM/group calls already render via SidebarVoiceCard's path.
  // If we couldn't resolve a server channel, this is a non-server group call; bail.
  if (!serverInfo) return null;

  const stateLabel = "Voice Connected";
  const locationLabel = `${serverInfo.server_name} › #${activeCall.conversationName || "voice"}`;
  const onOpenCall = () => navigate(`/@me/server/${serverInfo.server_id}/${serverInfo.channel_id}`);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mx-2 mb-1.5 rounded-lg p-2.5 animate-fade-in" style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={onOpenCall} className="flex items-center gap-1.5 group min-w-0 flex-1 text-left">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: "#3ba55c", opacity: 0.6 }} />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: "#3ba55c" }} />
          </span>
          <span className="truncate text-[11px] font-bold uppercase tracking-wide group-hover:underline" style={{ color: "#3ba55c" }}>
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
            <TooltipContent side="top" className="text-xs">Ping: {formatPing(ping)}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <button onClick={onOpenCall} className="block w-full text-left mb-2 group">
        <p className="truncate text-[13px] font-semibold text-white leading-tight group-hover:underline">
          # {locationLabel}
        </p>
        <p className="text-[11px] leading-tight mt-0.5" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
          {formatTime(elapsed)}
        </p>
      </button>

      <div className="flex items-center gap-1">
        <button
          onClick={() => toggleVideo()}
          className="flex-1 flex items-center justify-center rounded-md py-1.5 transition-colors"
          style={{ backgroundColor: activeCall.isVideoOn ? "rgba(59,165,92,0.2)" : "rgba(255,255,255,0.06)" }}
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
        <button
          onClick={leaveCall}
          className="flex-1 flex items-center justify-center rounded-md py-1.5 transition-colors"
          style={{ backgroundColor: "#ed4245" }}
          aria-label="Disconnect"
        >
          <img src={callEndIcon} alt="" className="h-[16px] w-[16px]" style={{ filter: "invert(100%)" }} />
        </button>
      </div>
    </div>
  );
};

export default SidebarGroupCallCard;
