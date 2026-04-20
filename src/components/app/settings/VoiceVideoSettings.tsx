import { useState, useRef, useEffect } from "react";
import { useVoice, SERVER_REGIONS } from "@/contexts/VoiceContext";
import { useGroupCall } from "@/contexts/GroupCallContext";

// iOS only allows ONE active mic/camera capture at a time. If the user opens
// Voice & Video settings while in a call and we acquire a second getUserMedia
// stream for the mic/camera test, iOS revokes the call's track and the user
// goes silent/blind for everyone. Detect iOS-class browsers and disable the
// live previews there — and also block them whenever there's an active call.
const isIOSLike = (() => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iPadOS = navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(ua) || iPadOS;
})();
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Mic, Globe, Monitor, MousePointer2, Zap, Film, MicOff, Video, VideoOff, Camera } from "lucide-react";

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
  const { activeCall } = useGroupCall();
  const inCall = !!activeCall;
  const captureLocked = inCall || isIOSLike;
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
          captureLocked={captureLocked}
          captureLockReason={inCall ? "in-call" : isIOSLike ? "ios" : null}
        />
      ) : (
        <VideoTab
          settings={settings}
          updateSettings={updateSettings}
          availableDevices={availableDevices}
          screenShareSettings={screenShareSettings}
          updateScreenShareSettings={updateScreenShareSettings}
          cardStyle={cardStyle}
          captureLocked={captureLocked}
          captureLockReason={inCall ? "in-call" : isIOSLike ? "ios" : null}
        />
      )}
    </div>
  );
};

/* ─── Voice Tab ─── */
function VoiceTab({ settings, updateSettings, availableDevices, audioLevel, detectedRegion, activeRegion, cardStyle, captureLocked, captureLockReason }: any) {
  const [micTesting, setMicTesting] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef<number>(0);
  const [testLevel, setTestLevel] = useState(0);

  const toggleMicTest = async () => {
    if (micTesting) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
      cancelAnimationFrame(animRef.current);
      // Remove mic test audio element
      document.querySelectorAll("audio").forEach((el: any) => {
        if (el.__cubblyMicTest) { el.pause(); el.srcObject = null; el.remove(); }
      });
      streamRef.current = null;
      audioCtxRef.current = null;
      analyserRef.current = null;
      setMicTesting(false);
      setTestLevel(0);
      return;
    }

    if (captureLocked) {
      // On iOS only one capture can be active. Refuse to open a second mic
      // stream — it would silently steal the call's mic track.
      console.warn("[MicTest] blocked:", captureLockReason);
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: settings.inputDeviceId !== "default" ? { exact: settings.inputDeviceId } : undefined,
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          sampleRate: 48000,
          sampleSize: 24,
          channelCount: 2,
        } as MediaTrackConstraints,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Create audio context for level monitoring
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Play mic audio back through speakers so user can hear themselves
      const audioEl = document.createElement("audio");
      audioEl.srcObject = stream;
      audioEl.autoplay = true;
      (audioEl as any).__cubblyMicTest = true;
      // Set output device if specified
      if (settings.outputDeviceId !== "default" && (audioEl as any).setSinkId) {
        (audioEl as any).setSinkId(settings.outputDeviceId).catch(console.error);
      }
      document.body.appendChild(audioEl);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length;
        setTestLevel(avg / 255 * 100);
        animRef.current = requestAnimationFrame(tick);
      };
      tick();

      setMicTesting(true);
    } catch (err) {
      console.error("Mic test failed:", err);
    }
  };

  // Apply constraints in real-time when settings change during mic test
  useEffect(() => {
    if (!streamRef.current || !micTesting) return;
    const tracks = streamRef.current.getAudioTracks();
    tracks.forEach(track => {
      track.applyConstraints({
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      }).catch(e => console.warn("Failed to apply mic test constraints:", e));
    });
  }, [settings.echoCancellation, settings.noiseSuppression, settings.autoGainControl, micTesting]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      audioCtxRef.current?.close();
      cancelAnimationFrame(animRef.current);
      document.querySelectorAll("audio").forEach((el: any) => {
        if (el.__cubblyMicTest) { el.pause(); el.srcObject = null; el.remove(); }
      });
    };
  }, []);

  const displayLevel = micTesting ? testLevel : audioLevel;

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
        <Select value={settings.serverRegion} onValueChange={(v) => updateSettings({ serverRegion: v })}>
          <SelectTrigger
            className="w-full rounded-xl border text-sm"
            style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            className="rounded-xl border shadow-xl"
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}
          >
            {SERVER_REGIONS.map((r: any) => (
              <SelectItem
                key={r.id}
                value={r.id}
                className="rounded-lg text-sm cursor-pointer"
                style={{ color: "var(--app-text-primary)" }}
              >
                {r.label} — {r.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={settings.inputDeviceId} onValueChange={(v) => updateSettings({ inputDeviceId: v })}>
          <SelectTrigger
            className="w-full rounded-xl border text-sm"
            style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            className="rounded-xl border shadow-xl z-[9999]"
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}
          >
            <SelectItem value="default" className="rounded-lg text-sm cursor-pointer" style={{ color: "var(--app-text-primary)" }}>
              Default
            </SelectItem>
            {availableDevices.inputs
              .filter((d: MediaDeviceInfo) => d.deviceId !== "default" && d.deviceId !== "communications")
              .map((d: MediaDeviceInfo) => (
              <SelectItem
                key={d.deviceId}
                value={d.deviceId}
                className="rounded-lg text-sm cursor-pointer"
                style={{ color: "var(--app-text-primary)" }}
              >
                {(d.label || `Microphone (${d.deviceId.slice(0, 8)})`).replace(/^Default\s*-\s*/, "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
              disabled={!micTesting && captureLocked}
              title={
                !micTesting && captureLockReason === "in-call"
                  ? "Stop the call before testing your mic"
                  : !micTesting && captureLockReason === "ios"
                  ? "Mic test isn't supported in the iOS PWA"
                  : undefined
              }
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
                width: `${Math.min(displayLevel, 100)}%`,
                backgroundColor: displayLevel > 80 ? "#ed4245" : displayLevel > 40 ? "#faa61a" : "#3ba55c",
              }}
            />
          </div>
          {micTesting && (
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
              Speak now — the level bar shows your mic input
            </p>
          )}
        </div>
      </div>

      {/* Output Device */}
      <div className="rounded-[24px] border p-5 space-y-5" style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Output Device
        </p>
        <Select value={settings.outputDeviceId} onValueChange={(v) => updateSettings({ outputDeviceId: v })}>
          <SelectTrigger
            className="w-full rounded-xl border text-sm"
            style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            className="rounded-xl border shadow-xl z-[9999]"
            style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}
          >
            <SelectItem value="default" className="rounded-lg text-sm cursor-pointer" style={{ color: "var(--app-text-primary)" }}>
              Default
            </SelectItem>
            {availableDevices.outputs
              .filter((d: MediaDeviceInfo) => d.deviceId !== "default" && d.deviceId !== "communications")
              .map((d: MediaDeviceInfo) => (
              <SelectItem
                key={d.deviceId}
                value={d.deviceId}
                className="rounded-lg text-sm cursor-pointer"
                style={{ color: "var(--app-text-primary)" }}
              >
                {(d.label || `Speaker (${d.deviceId.slice(0, 8)})`).replace(/^Default\s*-\s*/, "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
                    width: `${Math.min(displayLevel, 100)}%`,
                    backgroundColor: displayLevel > settings.sensitivityThreshold ? "#3ba55c" : "#ed4245",
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

/* ─── Camera Section (used inside Video Tab) ─── */
function CameraSection({ settings, updateSettings, availableDevices, cardStyle, captureLocked, captureLockReason }: any) {
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTest = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setTesting(false);
  };

  const startTest = async () => {
    if (captureLocked) {
      setError(
        captureLockReason === "in-call"
          ? "Stop the call before previewing your camera."
          : "Camera preview isn't supported in the iOS PWA."
      );
      return;
    }
    setError(null);
    try {
      const resMap: Record<string, { width: number; height: number }> = {
        "480p": { width: 854, height: 480 },
        "720p": { width: 1280, height: 720 },
        "1080p": { width: 1920, height: 1080 },
      };
      const res = resMap[settings.videoResolution] || resMap["720p"];
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: settings.videoDeviceId !== "default" ? { exact: settings.videoDeviceId } : undefined,
          width: { ideal: res.width },
          height: { ideal: res.height },
          frameRate: { ideal: settings.videoFrameRate, max: settings.videoFrameRate },
        },
        audio: false,
      });
      streamRef.current = stream;
      setTesting(true);
      // Wait for the <video> to mount, then attach + play
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e: any) {
      setError(e?.message || "Could not access camera");
    }
  };

  useEffect(() => () => stopTest(), []);

  // Restart test when device/resolution/fps changes mid-test
  useEffect(() => {
    if (!testing) return;
    stopTest();
    startTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.videoDeviceId, settings.videoResolution, settings.videoFrameRate]);

  return (
    <div className="rounded-[24px] border p-5 space-y-5" style={cardStyle}>
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
          Camera
        </p>
      </div>

      {/* Camera device picker */}
      <Select value={settings.videoDeviceId} onValueChange={(v) => updateSettings({ videoDeviceId: v })}>
        <SelectTrigger
          className="w-full rounded-xl border text-sm"
          style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          className="rounded-xl border shadow-xl z-[9999]"
          style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}
        >
          <SelectItem value="default" className="rounded-lg text-sm cursor-pointer" style={{ color: "var(--app-text-primary)" }}>
            Default
          </SelectItem>
          {(availableDevices.cameras || [])
            .filter((d: MediaDeviceInfo) => d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications")
            .map((d: MediaDeviceInfo) => (
            <SelectItem
              key={d.deviceId}
              value={d.deviceId}
              className="rounded-lg text-sm cursor-pointer"
              style={{ color: "var(--app-text-primary)" }}
            >
              {d.label || `Camera (${d.deviceId.slice(0, 8)})`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Resolution */}
      <div>
        <p className="text-sm font-medium mb-2" style={{ color: "var(--app-text-primary)" }}>Resolution</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: "480p", label: "480p", desc: "854×480" },
            { id: "720p", label: "720p", desc: "1280×720" },
            { id: "1080p", label: "1080p", desc: "1920×1080" },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => updateSettings({ videoResolution: opt.id })}
              className="rounded-xl border p-3 text-left transition-all"
              style={{
                backgroundColor: settings.videoResolution === opt.id ? "var(--app-active)" : "var(--app-input)",
                borderColor: settings.videoResolution === opt.id ? "#5865f2" : "var(--app-border)",
              }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{opt.label}</p>
              <p className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Frame rate */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Frame Rate</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--app-input)", color: "var(--app-text-secondary)" }}>
            {settings.videoFrameRate} FPS
          </span>
        </div>
        <div className="flex gap-2">
          {[15, 30, 60].map((fps) => (
            <button
              key={fps}
              onClick={() => updateSettings({ videoFrameRate: fps })}
              className="flex-1 rounded-xl border py-2.5 text-sm font-semibold transition-all"
              style={{
                backgroundColor: settings.videoFrameRate === fps ? "var(--app-active)" : "var(--app-input)",
                borderColor: settings.videoFrameRate === fps ? "#5865f2" : "var(--app-border)",
                color: "var(--app-text-primary)",
              }}
            >
              {fps} FPS
            </button>
          ))}
        </div>
      </div>

      {/* Mirror self-view */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Mirror My Video</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>
            Flip your own preview horizontally so it feels like a mirror. Doesn't affect what others see.
          </p>
        </div>
        <Switch checked={settings.mirrorSelfView} onCheckedChange={(v) => updateSettings({ mirrorSelfView: v })} />
      </div>

      {/* Test preview */}
      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--app-border)", backgroundColor: "#000" }}>
        <div className="aspect-video w-full flex items-center justify-center">
          {testing ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-cover"
              style={{ transform: settings.mirrorSelfView ? "scaleX(-1)" : "none" }}
            />
          ) : (
            <div className="flex flex-col items-center gap-2 opacity-50">
              <Camera className="h-8 w-8 text-white" />
              <span className="text-xs text-white">Camera preview off</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-[#ed4245]">{error}</p>
      )}

      <button
        onClick={() => (testing ? stopTest() : startTest())}
        className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
          testing ? "bg-[#ed4245] text-white hover:bg-[#c03537]" : "bg-[#5865f2] text-white hover:bg-[#4752c4]"
        }`}
      >
        {testing ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
        {testing ? "Stop Camera Test" : "Test Camera"}
      </button>
    </div>
  );
}

/* ─── Video Tab (Camera + Screen Sharing Settings) ─── */
function VideoTab({ settings, updateSettings, availableDevices, screenShareSettings, updateScreenShareSettings, cardStyle, captureLocked, captureLockReason }: any) {
  return (
    <div className="space-y-6">
      <CameraSection
        settings={settings}
        updateSettings={updateSettings}
        availableDevices={availableDevices}
        cardStyle={cardStyle}
        captureLocked={captureLocked}
        captureLockReason={captureLockReason}
      />
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

        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => updateScreenShareSettings({ optimizeFor: "ultra" })}
            className="rounded-xl border p-4 text-left transition-all relative"
            style={{
              backgroundColor: screenShareSettings.optimizeFor === "ultra" ? "var(--app-active)" : "var(--app-input)",
              borderColor: screenShareSettings.optimizeFor === "ultra" ? "#5865f2" : "var(--app-border)",
            }}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Ultra</p>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                style={{ background: "linear-gradient(135deg, hsl(265 80% 60%), hsl(220 80% 55%))" }}
              >
                Rec.
              </span>
            </div>
            <p className="text-[11px] mt-1 leading-4" style={{ color: "var(--app-text-secondary)" }}>
              Best of both worlds — sharp <em>and</em> smooth. Recommended for everything.
            </p>
          </button>
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
