import { useState } from "react";
import { useActivity } from "@/contexts/ActivityContext";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Gamepad2, Info } from "lucide-react";
import { toast } from "sonner";

interface ActivityPrivacySettingsProps {
  cardStyle: React.CSSProperties;
}

const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

const ActivityPrivacySettings = ({ cardStyle }: ActivityPrivacySettingsProps) => {
  const { shareActivity, setShareActivity, myGames, addMyGame, removeMyGame } = useActivity();
  const [adding, setAdding] = useState(false);

  const handleAddGame = async () => {
    if (!isElectron) {
      toast.error("Adding custom games is only available in the desktop app.");
      return;
    }
    const api = (window as any).electronAPI;
    if (!api?.pickGameExe) return;
    setAdding(true);
    try {
      const picked = await api.pickGameExe();
      if (!picked) {
        setAdding(false);
        return;
      }
      const displayName = window.prompt(
        "What should we call this game?",
        picked.displayName
      );
      if (!displayName?.trim()) {
        setAdding(false);
        return;
      }
      await addMyGame(picked.processName, displayName.trim());
      toast.success(`Added ${displayName} to your games`);
    } catch (e: any) {
      toast.error("Failed to add game");
    }
    setAdding(false);
  };

  return (
    <div className="space-y-5">
      {/* Share toggle */}
      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>
              Share activity status
            </h2>
            <p className="mt-1.5 text-sm" style={{ color: "var(--app-text-secondary)" }}>
              When this is on, your friends and group members can see what game you're currently
              playing. Cubbly checks every 15 seconds. Turn it off and your activity disappears
              everywhere instantly.
            </p>
          </div>
          <Switch checked={shareActivity} onCheckedChange={setShareActivity} />
        </div>
      </div>

      {/* Detection info */}
      {!isElectron && (
        <div
          className="flex items-start gap-3 rounded-[18px] border p-4"
          style={{ ...cardStyle, borderColor: "rgba(250, 166, 26, 0.4)" }}
        >
          <Info className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#faa61a" }} />
          <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Game detection only runs in the Cubbly desktop app. On the web you can still see
            other users' activity, but yours won't be broadcast.
          </p>
        </div>
      )}

      {/* My games */}
      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>
              Your games
            </h2>
            <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
              Cubbly already detects popular games like Valorant, League, Fortnite, Minecraft and
              more. Add anything else here.
            </p>
          </div>
          <button
            onClick={handleAddGame}
            disabled={adding || !isElectron}
            className="flex items-center gap-2 rounded-full bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            {adding ? "Picking..." : "Add a game"}
          </button>
        </div>

        {myGames.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-2xl py-10 text-center"
            style={{ backgroundColor: "var(--app-bg-tertiary)" }}
          >
            <Gamepad2 className="h-8 w-8 opacity-40" style={{ color: "var(--app-text-secondary)" }} />
            <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
              No custom games yet
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {myGames.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ backgroundColor: "var(--app-bg-tertiary)" }}
              >
                <Gamepad2 className="h-4 w-4 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                    {g.display_name}
                  </p>
                  <p className="truncate text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
                    {g.process_name}.exe
                  </p>
                </div>
                <button
                  onClick={() => removeMyGame(g.id)}
                  className="rounded-md p-1.5 text-[#ed4245] transition-colors hover:bg-[#ed4245]/10"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPrivacySettings;
