import { CSSProperties, useEffect, useState } from "react";
import { Keyboard, RotateCcw } from "lucide-react";
import { useLocalSetting } from "@/hooks/useLocalSetting";
import { toast } from "sonner";

interface Props {
  cardStyle: CSSProperties;
}

interface Keybind {
  id: string;
  label: string;
  description: string;
  defaultKey: string;
}

const KEYBINDS: Keybind[] = [
  { id: "pushToTalk", label: "Push to Talk", description: "Hold to transmit voice while in a call.", defaultKey: "Space" },
  { id: "toggleMute", label: "Toggle Mute", description: "Mute / unmute your microphone.", defaultKey: "Ctrl+Shift+M" },
  { id: "toggleDeafen", label: "Toggle Deafen", description: "Deafen / undeafen all incoming audio.", defaultKey: "Ctrl+Shift+D" },
  { id: "toggleVideo", label: "Toggle Camera", description: "Turn your webcam on or off in calls.", defaultKey: "Ctrl+Shift+V" },
  { id: "toggleScreenShare", label: "Toggle Screen Share", description: "Start or stop sharing your screen.", defaultKey: "Ctrl+Shift+S" },
  { id: "disconnect", label: "Disconnect Call", description: "Leave the current voice or video call.", defaultKey: "Ctrl+Shift+H" },
  { id: "navigateUp", label: "Navigate Channel Up", description: "Jump to the previous channel/DM.", defaultKey: "Alt+ArrowUp" },
  { id: "navigateDown", label: "Navigate Channel Down", description: "Jump to the next channel/DM.", defaultKey: "Alt+ArrowDown" },
  { id: "markAsRead", label: "Mark as Read", description: "Mark the focused channel/DM as read.", defaultKey: "Escape" },
  { id: "openSearch", label: "Quick Switcher", description: "Open the channel/user search.", defaultKey: "Ctrl+K" },
  { id: "openSettings", label: "Open Settings", description: "Open this settings panel.", defaultKey: "Ctrl+," },
  { id: "toggleEmoji", label: "Open Emoji Picker", description: "Toggle the emoji picker in the message box.", defaultKey: "Ctrl+E" },
];

const formatEvent = (e: KeyboardEvent): string => {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  let key = e.key;
  if (key === " ") key = "Space";
  if (!["Control", "Shift", "Alt", "Meta"].includes(key)) {
    parts.push(key.length === 1 ? key.toUpperCase() : key);
  }
  return parts.join("+");
};

export default function KeybindsSettings({ cardStyle }: Props) {
  const [bindings, setBindings] = useLocalSetting<Record<string, string>>(
    "cubbly:keybinds",
    KEYBINDS.reduce((acc, k) => ({ ...acc, [k.id]: k.defaultKey }), {} as Record<string, string>),
  );
  const [recording, setRecording] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      // Need an actual key (not just modifier)
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const formatted = formatEvent(e);
      const conflict = Object.entries(bindings).find(([id, v]) => id !== recording && v === formatted);
      if (conflict) {
        toast.error(`Already bound to ${KEYBINDS.find((k) => k.id === conflict[0])?.label}`);
        return;
      }
      setBindings({ ...bindings, [recording]: formatted });
      setRecording(null);
      toast.success("Keybind updated");
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording, bindings, setBindings]);

  const resetOne = (id: string) => {
    const def = KEYBINDS.find((k) => k.id === id)?.defaultKey;
    if (!def) return;
    setBindings({ ...bindings, [id]: def });
  };

  const resetAll = () => {
    setBindings(KEYBINDS.reduce((acc, k) => ({ ...acc, [k.id]: k.defaultKey }), {} as Record<string, string>));
    toast.success("All keybinds reset to defaults");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Keybinds</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>Customise shortcuts. Click a binding to record a new key combo. Esc to cancel.</p>
        </div>
        <button
          onClick={resetAll}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold border hover:bg-white/5"
          style={{ borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset All
        </button>
      </div>

      <div className="rounded-[24px] border overflow-hidden" style={cardStyle}>
        {KEYBINDS.map((kb, idx) => {
          const isRecording = recording === kb.id;
          const value = bindings[kb.id] || kb.defaultKey;
          return (
            <div
              key={kb.id}
              className="flex items-center justify-between gap-4 px-5 py-3.5"
              style={{ borderTop: idx === 0 ? "none" : "1px solid var(--app-border)" }}
            >
              <div className="min-w-0 flex items-center gap-3">
                <Keyboard className="h-4 w-4 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{kb.label}</p>
                  <p className="text-xs truncate" style={{ color: "var(--app-text-secondary)" }}>{kb.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setRecording(isRecording ? null : kb.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-mono font-semibold border min-w-[110px]"
                  style={{
                    borderColor: isRecording ? "#5865f2" : "var(--app-border)",
                    backgroundColor: isRecording ? "rgba(88,101,242,0.15)" : "var(--app-bg-tertiary)",
                    color: "var(--app-text-primary)",
                  }}
                >
                  {isRecording ? "Press keys…" : value}
                </button>
                {value !== kb.defaultKey && (
                  <button
                    onClick={() => resetOne(kb.id)}
                    className="text-[11px] font-semibold hover:underline"
                    style={{ color: "var(--app-text-secondary)" }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
