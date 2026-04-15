import { useState, useRef, useEffect } from "react";
import { useVoice, SERVER_REGIONS } from "@/contexts/VoiceContext";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Mic, Globe, Monitor, MousePointer2, Zap, Film, MicOff } from "lucide-react";

interface Props {
  panelStyle: Record<string, string>;
  cardStyle: Record<string, string>;
}

const VoiceVideoSettings = ({ panelStyle, cardStyle }: Props) => {
  const {
    settings, updateSettings,
    screenShareSettings, updateScreenShareSettings,
    availableDevices, audioLevel, refreshDevices, detectedRegion,
  } = useVoice();
  const [activeTab, setActiveTab] = useState<"voice" | "video">("voice");

  const activeRegion = settings.serverRegion === "auto"
    ? SERVER_REGIONS.find(r => r.id === detectedRegion) || SERVER_REGIONS[0]
    : SERVER_REGIONS.find(r => r.id === settings.serverRegion) || SERVER_REGIONS[0];

  const tabStyle = (isActive: boolean) => ({
    backgroundColor: isActive ? "var(--app-active)" : "transparent",
    color: isActive ? "var(--app-text-primary)" : "var(--app-text-secondary)",
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Voice & Video</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Configure your audio devices, video, and screen sharing settings.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl p-1" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
        <button
          onClick={() => setActiveTab("voice")}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
          style={tabStyle(activeTab === "voice")}
        >
          <Mic className="h-4 w-4" />
          Voice
        </button>
        <button
          onClick={() => setActiveTab("video")}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all"
          style={tabStyle(activeTab === "video")}
        >
          <Monitor className="h-4 w-4" />
          Video
        </button>
      </div>

      {activeTab === "voice" ? (
        <VoiceTab
          settings={settings}
          updateSettings={updateSettings}
          availableDevices={availableDevices}
          audioLevel={audioLevel}
          detectedRegion={detectedRegion}
          activeRegion={activeRegion}
          cardStyle={cardStyle}
        />
      ) : (
        <VideoTab
          screenShareSettings={screenShareSettings}
          updateScreenShareSettings={updateScreenShareSettings}
          cardStyle={cardStyle}
        />
      )}
    </div>
  );
};

/* ─── Voice Tab ─── */
function VoiceTab({ settings, updateSettings, availableDevices, audioLevel, detectedRegion, activeRegion, cardStyle }: any) {
  const [micTesting, setMicTesting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const toggleMicTest = async () => {
    if (micTesting) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
      streamRef.current = null;
      audioCtxRef.current = null;
      setMicTesting(false);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: settings.inputDeviceId !== "default"
          ? { deviceId: { exact: settings.inputDeviceId } }
          : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Create playback so user hears themselves
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = (settings.outputVolume ?? 100) / 100;
      source.connect(gain);
      gain.connect(ctx.destination);

      setMicTesting(true);
    } catch (err) {
      console.error("Mic test failed:", err);
    }
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Server Region */}
      <div className="rounded-[24px] border p-5 space-y-4" style={cardStyle}>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
            Server Region
          </p>
        </div>
        <select
          value={settings.serverRegion}
          onChange={(e) => updateSettings({ serverRegion: e.target.value })}
          className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none cursor-pointer"
          style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
        >
          {SERVER_REGIONS.map((r: any) => (
            <option key={r.id} value={r.id}>
              {r.label} — {r.description}
            </option>
          ))}
        </select>
        {settings.serverRegion === "auto" && (
          <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
            Detected best region: <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{activeRegion.label}</span> ({activeRegion.description})
          </p>
        )}
      </div>

      {/* Input Device */}
      <div className="rounded-[24px] border p-5 space-y-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Input Device
        </p>
        <select
          value={settings.inputDeviceId}
          onChange={(e) => updateSettings({ inputDeviceId: e.target.value })}
          className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none cursor-pointer"
          style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
        >
          <option value="default">Default</option>
          {availableDevices.inputs.map((d: MediaDeviceInfo) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
            </option>
          ))}
        </select>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Input Volume</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--app-input)", color: "var(--app-text-secondary)" }}>
              {settings.inputVolume}%
            </span>
          </div>
          <Slider value={[settings.inputVolume]} onValueChange={([v]) => updateSettings({ inputVolume: v })} min={0} max={200} step={1} className="w-full" />
        </div>

        {/* Live mic level with test button */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
              <span className="text-xs font-medium" style={{ color: "var(--app-text-secondary)" }}>Mic Test</span>
            </div>
            <button
              onClick={toggleMicTest}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                micTesting
                  ? "bg-[#ed4245] text-white hover:bg-[#c03537]"
                  : "bg-[#5865f2] text-white hover:bg-[#4752c4]"
              }`}
            >
              {micTesting ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
              {micTesting ? "Stop Test" : "Start Test"}
            </button>
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--app-input)" }}>
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{
                width: `${Math.min(audioLevel, 100)}%`,
                backgroundColor: audioLevel > 80 ? "#ed4245" : audioLevel > 40 ? "#faa61a" : "#3ba55c",
              }}
            />
          </div>
          {micTesting && (
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
              🎧 You should hear yourself through your output device
            </p>
          )}
        </div>
      </div>

      {/* Output Device */}
      <div className="rounded-[24px] border p-5 space-y-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Output Device
        </p>
        <select
          value={settings.outputDeviceId}
          onChange={(e) => updateSettings({ outputDeviceId: e.target.value })}
          className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none cursor-pointer"
          style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
        >
          <option value="default">Default</option>
          {availableDevices.outputs.map((d: MediaDeviceInfo) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Speaker (${d.deviceId.slice(0, 8)})`}
            </option>
          ))}
        </select>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Output Volume</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--app-input)", color: "var(--app-text-secondary)" }}>
              {settings.outputVolume}%
            </span>
          </div>
          <Slider value={[settings.outputVolume]} onValueChange={([v]) => updateSettings({ outputVolume: v })} min={0} max={200} step={1} className="w-full" />
        </div>
      </div>

      {/* Voice Processing */}
      <div className="rounded-[24px] border p-5 space-y-4" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Voice Processing
        </p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Echo Cancellation</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>Reduces echo from your speakers</p>
          </div>
          <Switch checked={settings.echoCancellation} onCheckedChange={(v) => updateSettings({ echoCancellation: v })} />
        </div>

        <div className="h-px" style={{ backgroundColor: "var(--app-border)" }} />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Noise Suppression</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>Filters background noise from your microphone</p>
          </div>
          <Switch checked={settings.noiseSuppression} onCheckedChange={(v) => updateSettings({ noiseSuppression: v })} />
        </div>

        <div className="h-px" style={{ backgroundColor: "var(--app-border)" }} />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Automatic Gain Control</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>Automatically adjusts your microphone volume</p>
          </div>
          <Switch checked={settings.autoGainControl} onCheckedChange={(v) => updateSettings({ autoGainControl: v })} />
        </div>
      </div>

      {/* Input Sensitivity */}
      <div className="rounded-[24px] border p-5 space-y-4" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Input Sensitivity
        </p>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Automatically determine input sensitivity</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>
              {settings.autoSensitivity ? "Cubbly will automatically pick up your voice" : "Manually set the threshold for voice detection"}
            </p>
          </div>
          <Switch checked={settings.autoSensitivity} onCheckedChange={(v) => updateSettings({ autoSensitivity: v })} />
        </div>

        {!settings.autoSensitivity && (
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: "var(--app-text-secondary)" }}>Sensitivity Threshold</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--app-input)", color: "var(--app-text-secondary)" }}>
                {settings.sensitivityThreshold}%
              </span>
            </div>
            <div className="relative">
              <Slider
                value={[settings.sensitivityThreshold]}
                onValueChange={([v]) => updateSettings({ sensitivityThreshold: v })}
                min={0} max={100} step={1} className="w-full"
              />
              <div className="mt-2 h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--app-input)" }}>
                <div
                  className="h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${Math.min(audioLevel, 100)}%`,
                    backgroundColor: audioLevel > settings.sensitivityThreshold ? "#3ba55c" : "#ed4245",
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>Sensitive</span>
                <span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>Not Sensitive</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Audio Quality Info */}
      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Audio Quality
        </p>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--app-text-secondary)" }}>
          Cubbly uses Opus codec at up to 510 kbps with 48 kHz stereo audio for the highest possible voice quality.
          Connections are secured with TURN relay servers for reliable connectivity behind strict NATs and firewalls.
        </p>
      </div>
    </div>
  );
}

/* ─── Video Tab (Screen Sharing Settings) ─── */
function VideoTab({ screenShareSettings, updateScreenShareSettings, cardStyle }: any) {
  return (
    <div className="space-y-6">
      {/* Screen Share Resolution */}
      <div className="rounded-[24px] border p-5 space-y-4" style={cardStyle}>
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
            Screen Share Quality
          </p>
        </div>

        <div>
          <p className="text-sm font-medium mb-2" style={{ color: "var(--app-text-primary)" }}>Resolution</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "auto", label: "Auto", desc: "Best for your connection" },
              { id: "720p", label: "720p", desc: "1280×720" },
              { id: "1080p", label: "1080p", desc: "1920×1080" },
              { id: "1440p", label: "1440p", desc: "2560×1440" },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => updateScreenShareSettings({ resolution: opt.id })}
                className="rounded-xl border p-3 text-left transition-all"
                style={{
                  backgroundColor: screenShareSettings.resolution === opt.id ? "var(--app-active)" : "var(--app-input)",
                  borderColor: screenShareSettings.resolution === opt.id ? "#5865f2" : "var(--app-border)",
                }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{opt.label}</p>
                <p className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px" style={{ backgroundColor: "var(--app-border)" }} />

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Frame Rate</span>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--app-input)", color: "var(--app-text-secondary)" }}>
              {screenShareSettings.frameRate} FPS
            </span>
          </div>
          <div className="flex gap-2">
            {[15, 30, 60].map(fps => (
              <button
                key={fps}
                onClick={() => updateScreenShareSettings({ frameRate: fps })}
                className="flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all"
                style={{
                  backgroundColor: screenShareSettings.frameRate === fps ? "var(--app-active)" : "var(--app-input)",
                  borderColor: screenShareSettings.frameRate === fps ? "#5865f2" : "var(--app-border)",
                  color: "var(--app-text-primary)",
                }}
              >
                {fps} FPS
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
            Higher frame rates use more bandwidth. 60 FPS is recommended for gaming or fast content.
          </p>
        </div>
      </div>

      {/* Optimize For */}
      <div className="rounded-[24px] border p-5 space-y-4" style={cardStyle}>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
            Optimization
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => updateScreenShareSettings({ optimizeFor: "clarity" })}
            className="rounded-xl border p-4 text-left transition-all"
            style={{
              backgroundColor: screenShareSettings.optimizeFor === "clarity" ? "var(--app-active)" : "var(--app-input)",
              borderColor: screenShareSettings.optimizeFor === "clarity" ? "#5865f2" : "var(--app-border)",
            }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Clarity</p>
            <p className="text-[11px] mt-1 leading-4" style={{ color: "var(--app-text-secondary)" }}>
              Best for text, code, and documents. Prioritizes sharpness over smoothness.
            </p>
          </button>
          <button
            onClick={() => updateScreenShareSettings({ optimizeFor: "motion" })}
            className="rounded-xl border p-4 text-left transition-all"
            style={{
              backgroundColor: screenShareSettings.optimizeFor === "motion" ? "var(--app-active)" : "var(--app-input)",
              borderColor: screenShareSettings.optimizeFor === "motion" ? "#5865f2" : "var(--app-border)",
            }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Motion</p>
            <p className="text-[11px] mt-1 leading-4" style={{ color: "var(--app-text-secondary)" }}>
              Best for gaming, video, and animations. Prioritizes smooth motion over sharpness.
            </p>
          </button>
        </div>
      </div>

      {/* Toggle Settings */}
      <div className="rounded-[24px] border p-5 space-y-4" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Screen Share Options
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: "var(--app-input)" }}>
              <Mic className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Share Audio</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>Include system audio when sharing your screen or tab</p>
            </div>
          </div>
          <Switch checked={screenShareSettings.audioShare} onCheckedChange={(v) => updateScreenShareSettings({ audioShare: v })} />
        </div>

        <div className="h-px" style={{ backgroundColor: "var(--app-border)" }} />

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: "var(--app-input)" }}>
              <MousePointer2 className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Show Cursor</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>Display your mouse cursor in the shared screen</p>
            </div>
          </div>
          <Switch checked={screenShareSettings.showCursor} onCheckedChange={(v) => updateScreenShareSettings({ showCursor: v })} />
        </div>
      </div>

      {/* Info */}
      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Screen Sharing
        </p>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--app-text-secondary)" }}>
          Cubbly supports sharing your entire screen, a specific window, or an individual browser tab — all with full audio support.
          Video is encoded with VP9 or H.264 at up to 8 Mbps for crystal-clear screen sharing.
        </p>
      </div>
    </div>
  );
}

export default VoiceVideoSettings;
