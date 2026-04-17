import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ensureNotificationPermission, getNotificationPermission } from "@/lib/notifications";
import { Bell, X } from "lucide-react";

const STORAGE_KEY = "cubbly:mobile-notif-prompt:v1";
const SHOW_AFTER_MS = 12_000; // give users a moment to settle

const isStandalone = () => {
  if (typeof window === "undefined") return false;
  // iOS Safari
  if ((window.navigator as any).standalone === true) return true;
  // Modern browsers
  try { return window.matchMedia("(display-mode: standalone)").matches; } catch { return false; }
};

/**
 * Mobile-only nudge that asks for OS notification permission once.
 * - Only shown to authenticated users on mobile.
 * - Skipped if permission is already granted or denied.
 * - Skipped if dismissed previously (per device, via localStorage).
 * - Slightly delayed so it doesn't pop up the second the app loads.
 */
const MobileNotificationPrompt = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || !isMobile) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    try {
      if (localStorage.getItem(STORAGE_KEY)) return; // already handled
    } catch { /* ignore */ }

    const perm = getNotificationPermission();
    if (perm !== "default") {
      // Already decided — don't bug them.
      try { localStorage.setItem(STORAGE_KEY, "decided"); } catch { /* ignore */ }
      return;
    }

    timer = setTimeout(() => {
      if (!cancelled) setVisible(true);
    }, SHOW_AFTER_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, isMobile]);

  const dismiss = (mark: "enabled" | "dismissed") => {
    setVisible(false);
    try { localStorage.setItem(STORAGE_KEY, mark); } catch { /* ignore */ }
  };

  const handleEnable = async () => {
    const ok = await ensureNotificationPermission();
    dismiss(ok ? "enabled" : "dismissed");
  };

  if (!visible) return null;

  return (
    <div
      className="fixed left-3 right-3 z-[60] rounded-2xl border p-4 shadow-2xl animate-fade-in"
      style={{
        bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
        backgroundColor: "var(--app-bg-secondary)",
        borderColor: "var(--app-border)",
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "linear-gradient(135deg, hsl(32, 80%, 55%), hsl(20, 75%, 50%))" }}
        >
          <Bell className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>
            Stay in the loop?
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
            {isStandalone()
              ? "Get notified when friends message you, even when Cubbly's closed."
              : "For best results, add Cubbly to your home screen first — then turn on notifications."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleEnable}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "linear-gradient(135deg, hsl(32, 80%, 55%), hsl(20, 75%, 50%))" }}
            >
              Turn on notifications
            </button>
            <button
              onClick={() => dismiss("dismissed")}
              className="rounded-full px-3 py-1.5 text-xs font-medium"
              style={{ color: "var(--app-text-secondary)" }}
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={() => dismiss("dismissed")}
          className="-mr-1 -mt-1 p-1 rounded-md transition-colors hover:bg-[var(--app-hover)]"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
        </button>
      </div>
    </div>
  );
};

export default MobileNotificationPrompt;
