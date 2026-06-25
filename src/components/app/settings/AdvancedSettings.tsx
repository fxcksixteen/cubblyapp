import { useEffect, useState } from "react";
import { toast } from "sonner";

const electronAPI = (typeof window !== "undefined" ? (window as any).electronAPI : null) || null;
const isElectron = !!electronAPI?.isElectron;

interface Props {
  cardStyle: React.CSSProperties;
}

/**
 * Advanced app settings — desktop-only toggles. Hidden entirely outside
 * Electron so web users don't see dead controls.
 */
const AdvancedSettings = ({ cardStyle }: Props) => {
  const [openAtLogin, setOpenAtLogin] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [hwAccel, setHwAccel] = useState(true);
  const [hwLoaded, setHwLoaded] = useState(false);
  const [hwDirty, setHwDirty] = useState(false);

  useEffect(() => {
    if (!isElectron) return;
    if (electronAPI?.getAutoLaunch) {
      electronAPI.getAutoLaunch().then((v: boolean) => {
        setOpenAtLogin(!!v);
        setLoaded(true);
      });
    }
    if (electronAPI?.getHardwareAcceleration) {
      electronAPI.getHardwareAcceleration().then((v: boolean) => {
        setHwAccel(!!v);
        setHwLoaded(true);
      });
    }
  }, []);

  const toggleAutoLaunch = async () => {
    if (!isElectron || !electronAPI?.setAutoLaunch) return;
    const next = !openAtLogin;
    setOpenAtLogin(next);
    try { await electronAPI.setAutoLaunch(next); } catch { /* ignore */ }
  };

  const toggleHwAccel = async () => {
    if (!isElectron || !electronAPI?.setHardwareAcceleration) return;
    const next = !hwAccel;
    setHwAccel(next);
    setHwDirty(true);
    try { await electronAPI.setHardwareAcceleration(next); } catch { /* ignore */ }
  };

  const handleRelaunch = async () => {
    try { await electronAPI?.relaunchApp?.(); } catch { toast.error("Couldn't relaunch — please restart Cubbly manually."); }
  };

  return (
    <div className="space-y-6">
      {!isElectron && (
        <div className="rounded-[22px] border p-5" style={cardStyle}>
          <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Advanced options are only available in the Cubbly desktop app.
          </p>
        </div>
      )}

      {isElectron && (
        <>
          <div className="rounded-[22px] border p-5" style={cardStyle}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>
                  Launch Cubbly on system startup
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                  Cubbly will start automatically when you log in to your computer. Recommended so friends can reach you instantly.
                </p>
              </div>
              <button
                onClick={toggleAutoLaunch}
                disabled={!loaded}
                role="switch"
                aria-checked={openAtLogin}
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
                style={{ backgroundColor: openAtLogin ? "var(--app-toggle-on, #3ba55c)" : "var(--app-toggle-off, #3f4147)" }}
              >
                <span
                  className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                  style={{ transform: openAtLogin ? "translateX(22px)" : "translateX(2px)" }}
                />
              </button>
            </div>
          </div>

          <div className="rounded-[22px] border p-5" style={cardStyle}>
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>
                  Hardware acceleration
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                  Uses your GPU for smoother rendering, video, and screensharing. Turn off only if you're seeing graphical glitches or driver crashes. Changes require a restart.
                </p>
              </div>
              <button
                onClick={toggleHwAccel}
                disabled={!hwLoaded}
                role="switch"
                aria-checked={hwAccel}
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50"
                style={{ backgroundColor: hwAccel ? "var(--app-toggle-on, #3ba55c)" : "var(--app-toggle-off, #3f4147)" }}
              >
                <span
                  className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                  style={{ transform: hwAccel ? "translateX(22px)" : "translateX(2px)" }}
                />
              </button>
            </div>
            {hwDirty && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: "rgba(88,101,242,0.12)" }}>
                <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                  Restart Cubbly for this change to take effect.
                </p>
                <button
                  onClick={handleRelaunch}
                  className="rounded-md px-3 py-1 text-xs font-bold text-white"
                  style={{ backgroundColor: "#5865f2" }}
                >
                  Restart now
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdvancedSettings;
