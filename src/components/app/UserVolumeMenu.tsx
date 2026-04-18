import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, RotateCcw } from "lucide-react";
import type { PeerGainApi } from "@/lib/peerGain";

/**
 * Discord-style right-click controls for a peer's avatar in any voice/call UI.
 *
 * Behaviours:
 *  - 0–200% per-user volume slider (default 100%, persisted forever in
 *    localStorage by user_id so it survives reloads, calls, and re-installs).
 *  - "Mute (you only)" — silences this peer for you locally without affecting
 *    anyone else in the call.
 *  - "Reset volume" — restores 100% / unmutes.
 *
 * Renders as a floating menu anchored at the click coords. Closes on outside
 * click, Escape, or scroll.
 *
 * `volumeApi` is passed in by the parent so the same menu component works
 * for both 1-on-1 (`useVoice()`) and group calls (`useGroupCall()`).
 */

export interface UserVolumeMenuProps {
  /** Peer's auth.uid — used as the persistence key. */
  userId: string;
  /** Display name shown in the menu header. */
  displayName: string;
  /** Anchor position (clientX/clientY of the contextmenu event). */
  x: number;
  y: number;
  onClose: () => void;
  /** Volume API from whichever call context is active (1-on-1 or group). */
  volumeApi: Pick<PeerGainApi, "getUserVolume" | "setUserVolume" | "isUserMuted" | "setUserMuted">;
}

const UserVolumeMenu = ({ userId, displayName, x, y, onClose, volumeApi }: UserVolumeMenuProps) => {
  const { getUserVolume, setUserVolume, isUserMuted, setUserMuted } = volumeApi;
  const [volumePct, setVolumePct] = useState<number>(() => Math.round(getUserVolume(userId) * 100));
  const [muted, setMuted] = useState<boolean>(() => isUserMuted(userId));
  const menuRef = useRef<HTMLDivElement>(null);

  // Outside-click + Esc + scroll closes the menu
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onScroll = () => onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  // Clamp menu to viewport so it doesn't render off-screen on right edge
  const W = 264, H = 200;
  const left = Math.min(x, window.innerWidth - W - 8);
  const top = Math.min(y, window.innerHeight - H - 8);

  const handleVolume = (next: number) => {
    setVolumePct(next);
    setUserVolume(userId, next / 100);
    if (muted && next > 0) {
      setMuted(false);
      setUserMuted(userId, false);
    }
  };

  const handleMuteToggle = () => {
    const next = !muted;
    setMuted(next);
    setUserMuted(userId, next);
  };

  const handleReset = () => {
    setVolumePct(100);
    setMuted(false);
    setUserVolume(userId, 1);
    setUserMuted(userId, false);
  };

  // Color gradient: green (0-100), orange (100-150), red-ish (150-200)
  const trackColor = volumePct <= 100 ? "#3ba55c" : volumePct <= 150 ? "#faa61a" : "#ed4245";

  return (
    <div
      ref={menuRef}
      className="fixed z-[300] w-[264px] rounded-xl border shadow-2xl animate-in fade-in-0 zoom-in-95"
      style={{
        left,
        top,
        backgroundColor: "var(--app-bg-secondary, #2b2d31)",
        borderColor: "var(--app-border, rgba(255,255,255,0.08))",
        color: "var(--app-text-primary, #f2f3f5)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 pt-3 pb-2">
        <p className="truncate text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
          {displayName}
        </p>
      </div>

      <div className="px-3 pb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[12px] font-semibold">User Volume</span>
          <span className="text-[12px] font-semibold tabular-nums" style={{ color: trackColor }}>
            {volumePct}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={200}
          step={1}
          value={volumePct}
          onChange={(e) => handleVolume(parseInt(e.target.value, 10))}
          className="w-full"
          style={{ accentColor: trackColor }}
        />
        <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--app-text-secondary, #949ba4)" }}>
          <span>0%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </div>

      <div className="h-px mx-2" style={{ backgroundColor: "var(--app-border, rgba(255,255,255,0.06))" }} />

      <div className="p-1">
        <button
          onClick={handleMuteToggle}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-white/5 text-left"
        >
          {muted ? (
            <VolumeX className="h-4 w-4" style={{ color: "#ed4245" }} />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
          <span>{muted ? "Unmute (you only)" : "Mute (you only)"}</span>
        </button>
        <button
          onClick={handleReset}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors hover:bg-white/5 text-left"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Reset to 100%</span>
        </button>
      </div>
    </div>
  );
};

export default UserVolumeMenu;
