import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVoice, CallDiagnostics } from "@/contexts/VoiceContext";
import { Activity, Globe, Shield, Wifi, ArrowDownToLine, ArrowUpToLine } from "lucide-react";

/**
 * v0.3.19: Live network diagnostics for the call the user is currently in.
 * Opens from a small grey button under the network bars in SidebarVoiceCard.
 * Polls every 1s.
 */

const REGION_LABEL: Record<string, string> = {
  "auto": "Automatic",
  "us-east": "US East (N. Virginia)",
  "us-west": "US West (Oregon)",
  "eu-west": "EU West (Ireland)",
  "eu-central": "EU Central (Frankfurt)",
  "asia-east": "Asia East (Tokyo)",
  "asia-south": "Asia South (Singapore)",
  "south-america": "South America (São Paulo)",
  "australia": "Australia (Sydney)",
};

const fmtBytes = (n?: number) => {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

const fmtCodec = (mime?: string) => mime?.replace("audio/", "").toUpperCase() || "—";

const qualityColor = (rtt: number | null) => {
  if (rtt == null) return "#949ba4";
  if (rtt < 60) return "#3ba55c";
  if (rtt < 120) return "#3ba55c";
  if (rtt < 200) return "#faa61a";
  return "#ed4245";
};

const Row = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
    <span className="text-[12px]" style={{ color: "var(--app-text-secondary, #949ba4)" }}>{label}</span>
    <span className={`text-[12px] text-white text-right ${mono ? "font-mono" : ""}`}>{value}</span>
  </div>
);

interface Props {
  open: boolean;
  onClose: () => void;
}

const SparklineRtt = ({ history }: { history: number[] }) => {
  if (history.length < 2) return <div className="h-12 flex items-center justify-center text-[11px] text-white/40">Collecting…</div>;
  const w = 320, h = 48, pad = 4;
  const max = Math.max(60, ...history);
  const min = Math.min(0, ...history);
  const range = max - min || 1;
  const step = (w - pad * 2) / (history.length - 1);
  const pts = history.map((v, i) => `${pad + i * step},${h - pad - ((v - min) / range) * (h - pad * 2)}`).join(" ");
  const last = history[history.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="block">
      <polyline fill="none" stroke={qualityColor(last)} strokeWidth="1.5" points={pts} />
      <polyline
        fill={qualityColor(last)}
        fillOpacity="0.12"
        stroke="none"
        points={`${pad},${h - pad} ${pts} ${w - pad},${h - pad}`}
      />
    </svg>
  );
};

const CallDiagnosticsModal = ({ open, onClose }: Props) => {
  const { getCallDiagnostics, activeCall, ping } = useVoice();
  const [diag, setDiag] = useState<CallDiagnostics | null>(null);
  const [rttHistory, setRttHistory] = useState<number[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!open) {
      setDiag(null);
      setRttHistory([]);
      return;
    }
    const tick = async () => {
      const d = await getCallDiagnostics();
      setDiag(d);
      if (d?.currentRttMs != null) {
        setRttHistory((prev) => [...prev.slice(-59), d.currentRttMs!]);
      } else if (ping > 0) {
        setRttHistory((prev) => [...prev.slice(-59), ping]);
      }
    };
    void tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [open, getCallDiagnostics, ping]);

  const liveRtt = diag?.currentRttMs ?? (ping > 0 ? ping : null);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="max-w-md p-0 gap-0 border-0 overflow-hidden"
        style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/5">
          <DialogTitle className="text-white text-base flex items-center gap-2">
            <Activity className="h-4 w-4" style={{ color: qualityColor(liveRtt) }} />
            Call Diagnostics
            <span className="ml-auto flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 rounded-full animate-ping" style={{ backgroundColor: qualityColor(liveRtt), opacity: 0.6 }} />
                <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: qualityColor(liveRtt) }} />
              </span>
              <span className="text-[10px] uppercase tracking-wide font-bold" style={{ color: qualityColor(liveRtt) }}>Live</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Live RTT graph */}
          <div className="rounded-md p-3" style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] uppercase tracking-wide font-bold" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
                Round-Trip Time
              </span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: qualityColor(liveRtt) }}>
                {liveRtt != null ? `${liveRtt}` : "—"}
                <span className="text-xs ml-1 font-normal opacity-60">ms</span>
              </span>
            </div>
            <SparklineRtt history={rttHistory} />
          </div>

          {/* Server / region */}
          <section>
            <h3 className="text-[11px] uppercase tracking-wide font-bold mb-1.5 flex items-center gap-1.5"
                style={{ color: "var(--app-text-secondary, #949ba4)" }}>
              <Globe className="h-3 w-3" /> Server
            </h3>
            <div className="rounded-md px-3" style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
              <Row label="Region" value={REGION_LABEL[diag?.serverRegion || "auto"] || diag?.serverRegion || "—"} />
              <Row
                label="Transport"
                value={
                  diag?.isRelay
                    ? <span style={{ color: "#faa61a" }}>Relayed (TURN)</span>
                    : <span style={{ color: "#3ba55c" }}>Peer-to-peer</span>
                }
              />
              {diag?.isRelay && diag.turnServerHost && (
                <Row label="TURN host" value={diag.turnServerHost} mono />
              )}
              {diag?.relayProtocol && (
                <Row label="Relay protocol" value={diag.relayProtocol.toUpperCase()} mono />
              )}
            </div>
          </section>

          {/* ICE pair */}
          <section>
            <h3 className="text-[11px] uppercase tracking-wide font-bold mb-1.5 flex items-center gap-1.5"
                style={{ color: "var(--app-text-secondary, #949ba4)" }}>
              <Shield className="h-3 w-3" /> Connection
            </h3>
            <div className="rounded-md px-3" style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
              <Row label="State" value={
                <span style={{ color: diag?.connectionState === "connected" ? "#3ba55c" : "#faa61a" }}>
                  {diag?.connectionState || "—"}
                </span>
              } />
              <Row label="ICE state" value={diag?.iceConnectionState || "—"} mono />
              <Row label="Local" value={`${diag?.localCandidateType || "—"} · ${diag?.localProtocol?.toUpperCase() || "—"}`} mono />
              <Row label="Local addr" value={diag?.localAddress || "—"} mono />
              <Row label="Remote" value={`${diag?.remoteCandidateType || "—"} · ${diag?.remoteProtocol?.toUpperCase() || "—"}`} mono />
              <Row label="Remote addr" value={diag?.remoteAddress || "—"} mono />
            </div>
          </section>

          {/* Audio */}
          <section>
            <h3 className="text-[11px] uppercase tracking-wide font-bold mb-1.5 flex items-center gap-1.5"
                style={{ color: "var(--app-text-secondary, #949ba4)" }}>
              <Wifi className="h-3 w-3" /> Audio
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md px-3 py-2" style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold mb-1" style={{ color: "#3ba55c" }}>
                  <ArrowDownToLine className="h-3 w-3" /> Inbound
                </div>
                <Row label="Codec" value={fmtCodec(diag?.inboundCodec)} mono />
                <Row label="Jitter" value={diag?.inboundJitterMs != null ? `${diag.inboundJitterMs} ms` : "—"} />
                <Row label="Lost" value={diag?.inboundPacketsLost ?? "—"} />
                <Row label="Received" value={fmtBytes(diag?.inboundBytesReceived)} />
              </div>
              <div className="rounded-md px-3 py-2" style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}>
                <div className="flex items-center gap-1 text-[10px] uppercase font-bold mb-1" style={{ color: "#5865f2" }}>
                  <ArrowUpToLine className="h-3 w-3" /> Outbound
                </div>
                <Row label="Codec" value={fmtCodec(diag?.outboundCodec)} mono />
                <Row label="Packets" value={diag?.outboundPacketsSent ?? "—"} />
                <Row label="Sent" value={fmtBytes(diag?.outboundBytesSent)} />
              </div>
            </div>
          </section>

          {!activeCall && (
            <div className="text-center text-[12px] py-4" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
              You're not in a call right now.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CallDiagnosticsModal;
