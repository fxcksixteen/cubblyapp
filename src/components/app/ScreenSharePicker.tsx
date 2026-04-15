import { useState, useEffect } from "react";
import { Monitor, AppWindow, Globe, X, Volume2, VolumeX, Film, ArrowLeft, AlertCircle } from "lucide-react";
import { useVoice } from "@/contexts/VoiceContext";

export type ScreenShareType = "screen" | "window" | "tab";

interface ScreenSharePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: ScreenShareType, options: { audio: boolean; fps: number; quality: string; sourceId?: string }) => void;
}

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

const typeOptions: { type: ScreenShareType; icon: typeof Monitor; label: string; description: string }[] = [
  { type: "screen", icon: Monitor, label: "Entire Screen", description: "Share your full screen with everything visible" },
  { type: "window", icon: AppWindow, label: "Window", description: "Share a specific application window" },
  { type: "tab", icon: Globe, label: "Browser Tab", description: "Share a single browser tab with audio" },
];

const fpsOptions = [15, 30, 60];
const qualityOptions = [
  { id: "auto", label: "Auto" },
  { id: "480p", label: "480p" },
  { id: "720p", label: "720p" },
  { id: "1080p", label: "1080p" },
  { id: "1440p", label: "1440p" },
];

const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI;

const ScreenSharePicker = ({ isOpen, onClose, onSelect }: ScreenSharePickerProps) => {
  const { screenShareSettings } = useVoice();
  const [hoveredType, setHoveredType] = useState<ScreenShareType | null>(null);
  const [animating, setAnimating] = useState(false);
  const [shareAudio, setShareAudio] = useState(true);
  const [fps, setFps] = useState(30);
  const [quality, setQuality] = useState("auto");

  // Electron source picking state
  const [pickingType, setPickingType] = useState<ScreenShareType | null>(null);
  const [desktopSources, setDesktopSources] = useState<DesktopSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [hoveredSourceId, setHoveredSourceId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setShareAudio(screenShareSettings.audioShare);
      setFps(screenShareSettings.frameRate);
      setQuality(screenShareSettings.resolution);
      setPickingType(null);
      setDesktopSources([]);
    }
  }, [isOpen, screenShareSettings]);

  if (isOpen && !animating) {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
  }

  if (!isOpen) {
    if (animating) setAnimating(false);
    return null;
  }

  const handleTypeSelect = async (type: ScreenShareType) => {
    if (!isElectron) {
      // Browser: just pass type through, browser handles picker natively
      onSelect(type, { audio: shareAudio, fps, quality });
      return;
    }

    // Electron: fetch sources and show picker
    setLoadingSources(true);
    setPickingType(type);
    try {
      const allSources: DesktopSource[] = await (window as any).electronAPI.getDesktopSources();

      if (type === "screen") {
        const screens = allSources.filter(s => s.id.startsWith("screen:"));
        if (screens.length === 1) {
          // Only one monitor — share it directly
          onSelect(type, { audio: shareAudio, fps, quality, sourceId: screens[0].id });
          return;
        }
        setDesktopSources(screens);
      } else if (type === "window") {
        const windows = allSources.filter(s => s.id.startsWith("window:"));
        setDesktopSources(windows);
      } else if (type === "tab") {
        // Electron doesn't have browser tabs — show windows that look like browsers
        const browserKeywords = ["chrome", "firefox", "edge", "brave", "opera", "safari", "vivaldi", "arc", "browser"];
        const browserWindows = allSources.filter(s =>
          s.id.startsWith("window:") &&
          browserKeywords.some(kw => s.name.toLowerCase().includes(kw))
        );
        if (browserWindows.length === 0) {
          setDesktopSources([]);
        } else {
          setDesktopSources(browserWindows);
        }
      }
    } catch (e) {
      console.error("Failed to get desktop sources:", e);
      setDesktopSources([]);
    } finally {
      setLoadingSources(false);
    }
  };

  const handleSourceSelect = (source: DesktopSource) => {
    onSelect(pickingType || "screen", { audio: shareAudio, fps, quality, sourceId: source.id });
  };

  const renderSourcePicker = () => {
    const typeLabel = pickingType === "screen" ? "Screen" : pickingType === "window" ? "Window" : "Browser Tab";

    return (
      <>
        {/* Header with back button */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setPickingType(null); setDesktopSources([]); }}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              style={{ color: "var(--app-text-secondary)" }}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h2 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>Select {typeLabel}</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>
                {desktopSources.length} {desktopSources.length === 1 ? "source" : "sources"} available
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-white/5"
            style={{ borderColor: "var(--app-border)", color: "var(--app-text-secondary)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Source list */}
        <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
          {loadingSources && (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>Loading sources...</p>
            </div>
          )}

          {!loadingSources && desktopSources.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <AlertCircle className="h-10 w-10" style={{ color: "var(--app-text-secondary)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--app-text-secondary)" }}>
                {pickingType === "tab" ? "No browser detected" : `No ${typeLabel.toLowerCase()}s available`}
              </p>
              <p className="text-xs text-center" style={{ color: "var(--app-text-muted)" }}>
                {pickingType === "tab"
                  ? "Open a web browser first, then try again."
                  : "Make sure you have the application open."}
              </p>
            </div>
          )}

          {!loadingSources && desktopSources.map((source) => (
            <button
              key={source.id}
              onClick={() => handleSourceSelect(source)}
              onMouseEnter={() => setHoveredSourceId(source.id)}
              onMouseLeave={() => setHoveredSourceId(null)}
              className="flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-all duration-150"
              style={{
                backgroundColor: hoveredSourceId === source.id ? "var(--app-hover)" : "var(--app-bg-secondary)",
              }}
            >
              {/* Thumbnail */}
              <div className="w-24 h-14 shrink-0 rounded-lg overflow-hidden border" style={{ borderColor: "var(--app-border)" }}>
                {source.thumbnail ? (
                  <img src={source.thumbnail} alt={source.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
                    <Monitor className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {source.appIcon && (
                    <img src={source.appIcon} alt="" className="h-4 w-4 shrink-0" />
                  )}
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                    {source.name}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 transition-all duration-200"
      style={{
        backgroundColor: animating ? "rgba(0, 0, 0, 0.55)" : "rgba(0, 0, 0, 0)",
        backdropFilter: animating ? "blur(8px)" : "blur(0px)",
      }}
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200"
        style={{
          backgroundColor: "var(--app-bg-primary)",
          borderColor: "var(--app-border)",
          transform: animating ? "scale(1) translateY(0)" : "scale(0.95) translateY(8px)",
          opacity: animating ? 1 : 0,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {pickingType && isElectron ? renderSourcePicker() : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--app-border)" }}>
              <div>
                <h2 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>Share Your Screen</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>Choose what you'd like to share</p>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--app-border)", color: "var(--app-text-secondary)" }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Share type options */}
            <div className="p-4 space-y-2">
              {typeOptions.map((opt) => (
                <button
                  key={opt.type}
                  onClick={() => handleTypeSelect(opt.type)}
                  onMouseEnter={() => setHoveredType(opt.type)}
                  onMouseLeave={() => setHoveredType(null)}
                  className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-all duration-150"
                  style={{
                    backgroundColor: hoveredType === opt.type ? "var(--app-hover)" : "var(--app-bg-secondary)",
                  }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
                    style={{ backgroundColor: hoveredType === opt.type ? "rgba(88, 101, 242, 0.15)" : "var(--app-bg-tertiary)" }}
                  >
                    <opt.icon
                      className="h-5 w-5 transition-colors"
                      style={{ color: hoveredType === opt.type ? "#5865f2" : "var(--app-text-secondary)" }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{opt.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Settings section */}
            <div className="px-4 pb-4 space-y-3">
              <div className="h-px" style={{ backgroundColor: "var(--app-border)" }} />

              {/* Audio toggle */}
              <button
                onClick={() => setShareAudio(!shareAudio)}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 transition-colors"
                style={{ backgroundColor: "var(--app-bg-secondary)" }}
              >
                <div className="flex items-center gap-3">
                  {shareAudio ? (
                    <Volume2 className="h-4 w-4" style={{ color: "#3ba55c" }} />
                  ) : (
                    <VolumeX className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
                  )}
                  <span className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Share Audio</span>
                </div>
                <div
                  className="h-5 w-9 rounded-full p-0.5 transition-colors duration-200"
                  style={{ backgroundColor: shareAudio ? "#3ba55c" : "var(--app-bg-tertiary)" }}
                >
                  <div
                    className="h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                    style={{ transform: shareAudio ? "translateX(16px)" : "translateX(0)" }}
                  />
                </div>
              </button>

              {/* FPS selector */}
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--app-bg-secondary)" }}>
                <div className="flex items-center gap-2 mb-2.5">
                  <Film className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Frame Rate</span>
                </div>
                <div className="flex gap-2">
                  {fpsOptions.map((f) => (
                    <button
                      key={f}
                      onClick={() => setFps(f)}
                      className="flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: fps === f ? "rgba(88, 101, 242, 0.2)" : "var(--app-bg-tertiary)",
                        color: fps === f ? "#5865f2" : "var(--app-text-secondary)",
                        border: fps === f ? "1px solid rgba(88, 101, 242, 0.4)" : "1px solid transparent",
                      }}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>

              {/* Quality selector */}
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--app-bg-secondary)" }}>
                <div className="flex items-center gap-2 mb-2.5">
                  <Monitor className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Stream Quality</span>
                </div>
                <div className="flex gap-1.5">
                  {qualityOptions.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => setQuality(q.id)}
                      className="flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all"
                      style={{
                        backgroundColor: quality === q.id ? "rgba(88, 101, 242, 0.2)" : "var(--app-bg-tertiary)",
                        color: quality === q.id ? "#5865f2" : "var(--app-text-secondary)",
                        border: quality === q.id ? "1px solid rgba(88, 101, 242, 0.4)" : "1px solid transparent",
                      }}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-4">
              <p className="text-[11px] text-center" style={{ color: "var(--app-text-secondary)" }}>
                {isElectron ? "Select a source to start sharing" : "Your browser will ask you to confirm what to share"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScreenSharePicker;
