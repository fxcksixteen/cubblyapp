import { useEffect, useState } from "react";

const electronAPI = (typeof window !== "undefined" ? (window as any).electronAPI : null) || null;
const isElectron = !!electronAPI?.isElectron;

interface Props {
  cardStyle: React.CSSProperties;
}

/**
 * Advanced app settings — currently just the desktop-only "Launch Cubbly on
 * system startup" toggle. Hidden entirely outside Electron so web users don't
 * see a dead control.
 */
const AdvancedSettings = ({ cardStyle }: Props) => {
  const [openAtLogin, setOpenAtLogin] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isElectron || !electronAPI?.getAutoLaunch) return;
    electronAPI.getAutoLaunch().then((v: boolean) => {
      setOpenAtLogin(!!v);
      setLoaded(true);
    });
  }, []);

  const toggleAutoLaunch = async () => {
    if (!isElectron || !electronAPI?.setAutoLaunch) return;
    const next = !openAtLogin;
    setOpenAtLogin(next);
    try { await electronAPI.setAutoLaunch(next); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Advanced</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          System integration and power-user settings.
        </p>
      </div>

      {!isElectron && (
        <div className="rounded-[22px] border p-5" style={cardStyle}>
          <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Advanced options are only available in the Cubbly desktop app.
          </p>
        </div>
      )}

      {isElectron && (
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
              style={{ backgroundColor: openAtLogin ? "#3ba55c" : "var(--app-border)" }}
            >
              <span
                className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform"
                style={{ transform: openAtLogin ? "translateX(22px)" : "translateX(2px)" }}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedSettings;
