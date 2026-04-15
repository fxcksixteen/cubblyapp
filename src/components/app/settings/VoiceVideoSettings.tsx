import { useVoice } from "@/contexts/VoiceContext";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Mic, Volume2 } from "lucide-react";

interface Props {
  panelStyle: Record<string, string>;
  cardStyle: Record<string, string>;
}

const VoiceVideoSettings = ({ panelStyle, cardStyle }: Props) => {
  const { settings, updateSettings, availableDevices, audioLevel, refreshDevices } = useVoice();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Voice & Video</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Configure your audio devices, volume, and voice processing.
        </p>
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
          {availableDevices.inputs.map((d) => (
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
          <Slider
            value={[settings.inputVolume]}
            onValueChange={([v]) => updateSettings({ inputVolume: v })}
            min={0}
            max={200}
            step={1}
            className="w-full"
          />
        </div>

        {/* Live mic level */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Mic className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--app-text-secondary)" }}>Mic Test</span>
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
          {availableDevices.outputs.map((d) => (
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
          <Slider
            value={[settings.outputVolume]}
            onValueChange={([v]) => updateSettings({ outputVolume: v })}
            min={0}
            max={200}
            step={1}
            className="w-full"
          />
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
          <Switch
            checked={settings.echoCancellation}
            onCheckedChange={(v) => updateSettings({ echoCancellation: v })}
          />
        </div>

        <div className="h-px" style={{ backgroundColor: "var(--app-border)" }} />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Noise Suppression</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>Filters background noise from your microphone</p>
          </div>
          <Switch
            checked={settings.noiseSuppression}
            onCheckedChange={(v) => updateSettings({ noiseSuppression: v })}
          />
        </div>

        <div className="h-px" style={{ backgroundColor: "var(--app-border)" }} />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>Automatic Gain Control</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>Automatically adjusts your microphone volume</p>
          </div>
          <Switch
            checked={settings.autoGainControl}
            onCheckedChange={(v) => updateSettings({ autoGainControl: v })}
          />
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
              {settings.autoSensitivity
                ? "Cubbly will automatically pick up your voice"
                : "Manually set the threshold for voice detection"}
            </p>
          </div>
          <Switch
            checked={settings.autoSensitivity}
            onCheckedChange={(v) => updateSettings({ autoSensitivity: v })}
          />
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
                min={0}
                max={100}
                step={1}
                className="w-full"
              />
              {/* Live level indicator on the slider track */}
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
          This exceeds the quality of most voice chat applications.
        </p>
      </div>
    </div>
  );
};

export default VoiceVideoSettings;
