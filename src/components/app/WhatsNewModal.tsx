import { useEffect, useState } from "react";
import { X } from "lucide-react";
import bearImage from "@/assets/whats-new-bear.png";

/**
 * Reusable "What's New" / changelog modal.
 *
 * Shows ONCE per user per version (tracked in localStorage so we don't need a
 * new DB table). To ship a new changelog, just bump CURRENT_VERSION + edit
 * NEW_FEATURES / BUG_FIXES below — every user will see it once on next load.
 */

const CURRENT_VERSION = "0.2.0";
const STORAGE_KEY = `cubbly-whats-new-seen:${CURRENT_VERSION}`;

const NEW_FEATURES: string[] = [
  "Auto-updater — desktop app now updates itself in the background",
  "Activity status — Cubbly auto-detects games you're playing (or add your own .exe)",
  "Video calling — toggle your webcam mid-call with picture-in-picture tiles",
  "Voice & Video settings — camera picker, resolution, FPS, mirror toggle, live test",
  "Full mobile rework — swipe gestures, bottom nav, and fullscreen call screen",
  "Auto-launch on startup — Cubbly opens automatically when you sign in to your PC",
  "Type-to-focus — start typing anywhere and it lands in the message box",
  "Global in-call indicator — see your active call no matter where you are in the app",
  "Friends tab badge — pending requests now show a red dot on the Friends tab too",
];

const BUG_FIXES: string[] = [
  "Fixed camera test preview staying black after clicking Test Camera",
  "Fixed right-click → View Profile in DM list opening the chat instead of the profile",
  "Fixed Voice & Video settings crashing on machines with default-only camera entries",
  "Active Now sidebar now actually lists friends with live activities",
  "Various performance improvements and small visual polish across the app",
];

const WhatsNewModal = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Tiny delay so we don't fight the loading splash
        const t = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const handleClose = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {}
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center animate-fade-in p-4"
      style={{
        backgroundColor: "rgba(15, 10, 6, 0.65)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[480px] max-w-full max-h-[88vh] overflow-y-auto rounded-2xl shadow-2xl animate-scale-in"
        style={{
          background:
            "linear-gradient(160deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015))",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow:
            "0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* Title pill in top-right */}
        <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
          <span
            className="rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Update Log v{CURRENT_VERSION}
          </span>
          <button
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
            style={{
              backgroundColor: "rgba(0,0,0,0.45)",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Hero image — rectangular, smooth-edged frame */}
        <div className="p-4 pb-0">
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{
              aspectRatio: "16 / 9",
              backgroundColor: "#a37a5e",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
            }}
          >
            <img
              src={bearImage}
              alt="Cubbly mascot with a wrench"
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        </div>

        <div className="px-6 pb-6 pt-5">
          {/* WHAT'S NEW divider */}
          <SectionDivider label="WHAT'S NEW" color="#3ba55c" />

          <ul className="mt-4 space-y-2.5">
            {NEW_FEATURES.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "#3ba55c" }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* BUG FIXES & QOL divider */}
          <div className="mt-7">
            <SectionDivider label="BUG FIXES & QOL" color="#5865f2" />
          </div>

          <ul className="mt-4 space-y-2.5">
            {BUG_FIXES.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "#5865f2" }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <button
            onClick={handleClose}
            className="mt-7 w-full rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: "linear-gradient(135deg, hsl(32, 80%, 55%), hsl(20, 75%, 50%))",
              boxShadow: "0 6px 20px hsla(32, 80%, 50%, 0.35)",
            }}
          >
            Got it — let's go!
          </button>
        </div>
      </div>
    </div>
  );
};

const SectionDivider = ({ label, color }: { label: string; color: string }) => (
  <div className="flex items-center gap-3">
    <div className="h-px flex-1" style={{ backgroundColor: color, opacity: 0.55 }} />
    <span
      className="text-[11px] font-bold tracking-[0.2em] px-2"
      style={{ color }}
    >
      {label}
    </span>
    <div className="h-px flex-1" style={{ backgroundColor: color, opacity: 0.55 }} />
  </div>
);

export default WhatsNewModal;
