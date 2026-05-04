import { useEffect, useState } from "react";
import { Mic, Headphones, Video, Monitor, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";

interface DevicesSettingsProps {
  cardStyle: React.CSSProperties;
}

interface MediaDevice {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

const DevicesSettings = ({ cardStyle }: DevicesSettingsProps) => {
  const [mics, setMics] = useState<MediaDevice[]>([]);
  const [speakers, setSpeakers] = useState<MediaDevice[]>([]);
  const [cameras, setCameras] = useState<MediaDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<"granted" | "denied" | "prompt" | "unknown">("unknown");

  const refresh = async () => {
    setLoading(true);
    try {
      // Trigger permission so labels populate
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach((t) => t.stop());
        setPermission("granted");
      } catch {
        setPermission("denied");
      }
      const list = await navigator.mediaDevices.enumerateDevices();
      const norm = (d: MediaDeviceInfo): MediaDevice => ({
        deviceId: d.deviceId,
        label: d.label || `${d.kind} (${d.deviceId.slice(0, 6)})`,
        kind: d.kind,
      });
      setMics(list.filter((d) => d.kind === "audioinput").map(norm));
      setSpeakers(list.filter((d) => d.kind === "audiooutput").map(norm));
      setCameras(list.filter((d) => d.kind === "videoinput").map(norm));
    } catch (e: any) {
      toast.error(e?.message || "Could not list devices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Section = ({
    icon: Icon,
    title,
    devices,
    empty,
  }: {
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    title: string;
    devices: MediaDevice[];
    empty: string;
  }) => (
    <div className="rounded-[24px] border p-5" style={cardStyle}>
      <div className="flex items-center gap-2.5 mb-3">
        <Icon className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />
        <h3 className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-primary)" }}>{title}</h3>
        <span className="ml-auto text-xs" style={{ color: "var(--app-text-secondary)" }}>{devices.length} found</span>
      </div>
      {devices.length === 0 ? (
        <p className="text-sm py-3" style={{ color: "var(--app-text-secondary)" }}>{empty}</p>
      ) : (
        <div className="space-y-1">
          {devices.map((d) => (
            <div
              key={d.deviceId}
              className="flex items-center justify-between gap-2 rounded-xl px-3 py-2"
              style={{ backgroundColor: "var(--app-bg-tertiary)" }}
            >
              <p className="truncate text-sm" style={{ color: "var(--app-text-primary)" }}>{d.label}</p>
              {d.deviceId === "default" && (
                <span className="shrink-0 rounded-full bg-[#5865f2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Default</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Devices</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Microphones, speakers, and cameras detected on this {isElectron ? "computer" : "browser"}.
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-full bg-[#5865f2] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#4752c4]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {permission === "denied" && (
        <div
          className="flex items-start gap-3 rounded-[18px] border p-4"
          style={{ ...cardStyle, borderColor: "rgba(237, 66, 69, 0.4)" }}
        >
          <Mic className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#ed4245" }} />
          <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Cubbly doesn't have microphone permission, so device labels may be hidden. Grant access in your browser/OS settings, then refresh.
          </p>
        </div>
      )}

      <Section icon={Mic} title="Microphones" devices={mics} empty="No input devices detected." />
      <Section icon={Headphones} title="Speakers / Headphones" devices={speakers} empty={isElectron ? "No output devices detected." : "Output device switching is browser-dependent — your system default will be used."} />
      <Section icon={Video} title="Cameras" devices={cameras} empty="No cameras detected." />

      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <div className="flex items-center gap-2.5 mb-3">
          <Monitor className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />
          <h3 className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-primary)" }}>Platform</h3>
        </div>
        <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
          {isElectron ? (
            <>Running in the Cubbly desktop app — full game detection, audio routing, and screen sharing are available.</>
          ) : (
            <><Smartphone className="inline h-4 w-4 mr-1 -mt-0.5" />
            Running in a browser. For game presence and loopback audio, install the Cubbly desktop app.</>
          )}
        </p>
      </div>
    </div>
  );
};

export default DevicesSettings;
