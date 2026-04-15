import { useState, useEffect } from "react";
import { Minus, Square, X, Copy } from "lucide-react";

const TitleBar = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const api = (window as any).electronAPI;

  useEffect(() => {
    if (!api) return;
    api.isMaximized().then(setIsMaximized);
    api.onMaximizeChange((maximized: boolean) => setIsMaximized(maximized));
  }, [api]);

  if (!api) return null;

  return (
    <div
      className="flex h-8 items-center justify-between select-none shrink-0"
      style={{
        backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
        WebkitAppRegion: "drag" as any,
      }}
    >
      {/* App title */}
      <div className="flex items-center gap-2 pl-3">
        <span className="text-[11px] font-bold tracking-wide" style={{ color: "var(--app-text-secondary)" }}>
          Cubbly
        </span>
      </div>

      {/* Window controls */}
      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" as any }}>
        <button
          onClick={() => api.minimize()}
          className="flex h-full w-11 items-center justify-center transition-colors hover:bg-white/10"
          title="Minimize"
        >
          <Minus className="h-3.5 w-3.5" style={{ color: "var(--app-text-secondary)" }} />
        </button>
        <button
          onClick={() => api.maximize()}
          className="flex h-full w-11 items-center justify-center transition-colors hover:bg-white/10"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <Copy className="h-3 w-3" style={{ color: "var(--app-text-secondary)", transform: "scaleX(-1)" }} />
          ) : (
            <Square className="h-3 w-3" style={{ color: "var(--app-text-secondary)" }} />
          )}
        </button>
        <button
          onClick={() => api.close()}
          className="flex h-full w-11 items-center justify-center transition-colors hover:bg-[#ed4245]"
          title="Close"
        >
          <X className="h-3.5 w-3.5" style={{ color: "var(--app-text-secondary)" }} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
