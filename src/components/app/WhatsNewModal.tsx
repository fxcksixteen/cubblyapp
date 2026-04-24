import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CHANGELOG, CURRENT_VERSION, getChangelogEntry } from "@/lib/changelog";
import { useAuth } from "@/contexts/AuthContext";

/**
 * "What's New" / changelog modal.
 *
 * Two modes:
 *  1. Auto mode (default, mounted at app root) — shows the latest version
 *     ONCE per user (tracked via localStorage flag keyed by version).
 *  2. Viewer mode (`forceVersion` prop) — used by the Update Logs settings
 *     tab to re-open any past patch's modal without touching the seen-flag.
 *
 * Animations: smooth scale + fade in, smooth scale + fade out (250ms).
 */

interface WhatsNewModalProps {
  /** When provided, opens immediately for THIS version and never writes the seen flag. */
  forceVersion?: string;
  /** Called when modal is dismissed (used in viewer mode). */
  onClose?: () => void;
}

const storageKey = (version: string) => `cubbly-whats-new-seen:${version}`;

const WhatsNewModal = ({ forceVersion, onClose }: WhatsNewModalProps) => {
  // Which version are we showing?
  const version = forceVersion ?? CURRENT_VERSION;
  const entry = getChangelogEntry(version) ?? CHANGELOG[0];

  // Only auto-show to authenticated users. Viewer mode (forceVersion) bypasses this.
  const { user, loading: authLoading } = useAuth();

  // `mounted` controls render presence. `visible` controls the animation state.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Decide whether to open
  useEffect(() => {
    if (forceVersion) {
      setMounted(true);
      // next frame → trigger entrance animation
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return;
    }
    // Auto mode: require a logged-in user
    if (authLoading || !user) return;
    try {
      // Per-user seen flag so each registered user sees it exactly once
      const key = `${storageKey(version)}:${user.id}`;
      if (!localStorage.getItem(key)) {
        const t = setTimeout(() => {
          setMounted(true);
          requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
        }, 800);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [forceVersion, version, user, authLoading]);

  const handleClose = () => {
    if (!forceVersion && user) {
      try { localStorage.setItem(`${storageKey(version)}:${user.id}`, new Date().toISOString()); } catch {}
    }
    setVisible(false);
    // Wait for exit animation, then unmount
    setTimeout(() => {
      setMounted(false);
      onClose?.();
    }, 250);
  };

  if (!mounted) return null;

  // Portal to <body> so we escape any transformed/overflow ancestors
  // (e.g. the SettingsModal panel uses transform: scale, which would
  // otherwise cause this fixed-positioned overlay to be clipped to the
  // settings frame instead of filling the viewport).
  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 transition-all duration-250 ease-out"
      style={{
        backgroundColor: visible ? "rgba(15, 10, 6, 0.65)" : "rgba(15, 10, 6, 0)",
        backdropFilter: visible ? "blur(20px) saturate(140%)" : "blur(0px)",
        WebkitBackdropFilter: visible ? "blur(20px) saturate(140%)" : "blur(0px)",
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-[480px] max-w-full max-h-[88vh] overflow-y-auto rounded-2xl shadow-2xl transition-all ease-out"
        style={{
          background:
            "linear-gradient(160deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015))",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow:
            "0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)",
          transform: visible ? "scale(1) translateY(0)" : "scale(0.92) translateY(16px)",
          opacity: visible ? 1 : 0,
          transitionDuration: "250ms",
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
            Update Log v{entry.version}
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

        {/* Hero image */}
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
              src={entry.hero}
              alt="Cubbly mascot"
              className="h-full w-full object-cover"
              draggable={false}
            />
          </div>
        </div>

        <div className="px-6 pb-6 pt-5">
          <SectionDivider label="WHAT'S NEW" color="#3ba55c" />
          <ul className="mt-4 space-y-2.5">
            {entry.newFeatures.map((item, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: "#3ba55c" }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7">
            <SectionDivider label="BUG FIXES & QOL" color="#5865f2" />
          </div>
          <ul className="mt-4 space-y-2.5">
            {entry.bugFixes.map((item, i) => (
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
    <span className="text-[11px] font-bold tracking-[0.2em] px-2" style={{ color }}>
      {label}
    </span>
    <div className="h-px flex-1" style={{ backgroundColor: color, opacity: 0.55 }} />
  </div>
);

export default WhatsNewModal;
