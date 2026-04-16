import { Switch } from "@/components/ui/switch";
import { useGamingMode } from "@/contexts/GamingModeContext";
import { Gamepad2, Zap, Phone, Info } from "lucide-react";

interface GamingModeSettingsProps {
  cardStyle: React.CSSProperties;
}

/**
 * Settings panel for Gaming Mode — the option that suppresses Cubbly when
 * the user is detected to be in a game so it never interferes with gameplay.
 */
const GamingModeSettings = ({ cardStyle }: GamingModeSettingsProps) => {
  const { enabled, setEnabled, affectCallsAndShare, setAffectCallsAndShare, isGaming, isSuppressing } = useGamingMode();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{ background: "linear-gradient(135deg, hsl(265 80% 60%), hsl(220 80% 55%))" }}
          >
            <Gamepad2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Gaming Mode</h2>
            <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
              Make sure Cubbly never gets in the way of your game.
            </p>
          </div>
        </div>
      </div>

      {/* Live status pill */}
      <div
        className="rounded-[20px] border px-4 py-3 flex items-center gap-3"
        style={{
          ...cardStyle,
          borderColor: isSuppressing ? "hsl(265 80% 60%)" : "var(--app-border)",
        }}
      >
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: isSuppressing ? "hsl(140 70% 50%)" : isGaming ? "hsl(40 90% 55%)" : "hsl(220 8% 50%)" }}
        />
        <p className="text-sm" style={{ color: "var(--app-text-primary)" }}>
          {isSuppressing
            ? "Active — suppressing Cubbly for performance."
            : isGaming
              ? "Game detected, but Gaming Mode is disabled."
              : "Idle — no game detected right now."}
        </p>
      </div>

      {/* Master toggle */}
      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <div className="flex items-start justify-between gap-6">
          <div className="flex gap-3">
            <Zap className="h-5 w-5 mt-0.5" style={{ color: "var(--app-text-secondary)" }} />
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--app-text-primary)" }}>
                Enable Gaming Mode
              </h3>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>
                When you're playing a game, Cubbly will throttle background work, mute notification sounds,
                pause OS notifications and minimize animations to stay out of your way.
              </p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {/* Calls & screenshare sub-toggle */}
      <div
        className="rounded-[24px] border p-5"
        style={{ ...cardStyle, opacity: enabled ? 1 : 0.55, transition: "opacity 0.2s" }}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex gap-3">
            <Phone className="h-5 w-5 mt-0.5" style={{ color: "var(--app-text-secondary)" }} />
            <div>
              <h3 className="text-base font-semibold" style={{ color: "var(--app-text-primary)" }}>
                Also suppress voice calls & screenshares
              </h3>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>
                Off by default. When OFF, Cubbly will <strong>never</strong> interrupt or throttle an active voice
                call or screen share — even if Gaming Mode is enabled. Turn this ON only if you want maximum
                performance over communication.
              </p>
            </div>
          </div>
          <Switch checked={affectCallsAndShare} onCheckedChange={setAffectCallsAndShare} disabled={!enabled} />
        </div>
      </div>

      {/* Info note */}
      <div
        className="rounded-[20px] border p-4 flex gap-3"
        style={{ ...cardStyle, borderStyle: "dashed" }}
      >
        <Info className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "var(--app-text-secondary)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>
          Detection uses the same engine as your Activity status. If a game isn't being detected, add its
          executable in <strong>Activity Privacy → My Games</strong>.
        </p>
      </div>
    </div>
  );
};

export default GamingModeSettings;
