import { useState } from "react";
import { Monitor, AppWindow, Globe, X } from "lucide-react";

export type ScreenShareType = "screen" | "window" | "tab";

interface ScreenSharePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: ScreenShareType) => void;
}

const options: { type: ScreenShareType; icon: typeof Monitor; label: string; description: string }[] = [
  { type: "screen", icon: Monitor, label: "Entire Screen", description: "Share your full screen with everything visible" },
  { type: "window", icon: AppWindow, label: "Window", description: "Share a specific application window" },
  { type: "tab", icon: Globe, label: "Browser Tab", description: "Share a single browser tab with audio" },
];

const ScreenSharePicker = ({ isOpen, onClose, onSelect }: ScreenSharePickerProps) => {
  const [hoveredType, setHoveredType] = useState<ScreenShareType | null>(null);
  const [animating, setAnimating] = useState(false);

  // Animate in
  if (isOpen && !animating) {
    requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
  }

  if (!isOpen) {
    if (animating) setAnimating(false);
    return null;
  }

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
        className="w-full max-w-[420px] rounded-2xl border shadow-2xl overflow-hidden transition-all duration-200"
        style={{
          backgroundColor: "var(--app-bg-primary)",
          borderColor: "var(--app-border)",
          transform: animating ? "scale(1) translateY(0)" : "scale(0.95) translateY(8px)",
          opacity: animating ? 1 : 0,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
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

        {/* Options */}
        <div className="p-4 space-y-2">
          {options.map((opt) => (
            <button
              key={opt.type}
              onClick={() => onSelect(opt.type)}
              onMouseEnter={() => setHoveredType(opt.type)}
              onMouseLeave={() => setHoveredType(null)}
              className="flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left transition-all duration-150"
              style={{
                backgroundColor: hoveredType === opt.type ? "var(--app-hover)" : "var(--app-bg-secondary)",
                borderColor: hoveredType === opt.type ? "var(--app-border)" : "transparent",
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

        {/* Footer hint */}
        <div className="px-5 pb-4">
          <p className="text-[11px] text-center" style={{ color: "var(--app-text-secondary)" }}>
            Your browser will ask you to confirm what to share
          </p>
        </div>
      </div>
    </div>
  );
};

export default ScreenSharePicker;
