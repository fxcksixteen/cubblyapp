import { Switch } from "@/components/ui/switch";
import { useGamingMode } from "@/contexts/GamingModeContext";
import { Info } from "lucide-react";

interface GamingModeSettingsProps {
  cardStyle: React.CSSProperties;
}

/**
 * Gaming Mode — suppresses Cubbly while the user is in a game so it doesn't
 * interfere with gameplay. UI styled to match the rest of the settings tabs.
 */
const GamingModeSettings = ({ cardStyle }: GamingModeSettingsProps) => {
  const { enabled, setEnabled, affectCallsAndShare, setAffectCallsAndShare, isGaming, isSuppressing } =
    useGamingMode();

  const statusLabel = isSuppressing
    ? "Active — suppressing Cubbly for performance."
    : isGaming
      ? "Game detected, but Gaming Mode is disabled."
      : "Idle — no game detected right now.";
  const statusDot = isSuppressing
    ? "hsl(140 70% 50%)"
    : isGaming
      ? "hsl(40 90% 55%)"
      : "hsl(220 8% 50%)";

  return (
    <div className="space-y-5">
      {/* Live status */}
      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <div className="flex items-center gap-3">
          <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusDot }} />
          <p className="text-sm" style={{ color: "var(--app-text-primary)" }}>
            {statusLabel}
          </p>
        </div>
      </div>

      {/* Master toggle */}
      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>
              Enable Gaming Mode
            </h2>
            <p className="mt-1.5 text-sm" style={{ color: "var(--app-text-secondary)" }}>
              When you're playing a game, Cubbly will throttle background work, mute notification
              sounds, pause OS notifications and minimize animations to stay out of your way.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {/* Calls & screenshare exception */}
      <div
        className="rounded-[24px] border p-5"
        style={{ ...cardStyle, opacity: enabled ? 1 : 0.55, transition: "opacity 0.2s" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>
              Also suppress voice calls & screenshares
            </h2>
            <p className="mt-1.5 text-sm" style={{ color: "var(--app-text-secondary)" }}>
              Off by default. When OFF, Cubbly will <strong>never</strong> interrupt or throttle an
              active voice call or screen share — even with Gaming Mode on. Turn this ON only if you
              want maximum performance over communication.
            </p>
          </div>
          <Switch
            checked={affectCallsAndShare}
            onCheckedChange={setAffectCallsAndShare}
            disabled={!enabled}
          />
        </div>
      </div>

      {/* Info note */}
      <div
        className="flex items-start gap-3 rounded-[18px] border p-4"
        style={{ ...cardStyle, borderColor: "rgba(250, 166, 26, 0.4)" }}
      >
        <Info className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#faa61a" }} />
        <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Detection uses the same engine as your Activity status. If a game isn't being detected,
          add its executable in <strong>Activity Privacy → Your games</strong>.
        </p>
      </div>
    </div>
  );
};

export default GamingModeSettings;
