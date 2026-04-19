import { forwardRef, useMemo, useState } from "react";
import { CHANGELOG } from "@/lib/changelog";
import WhatsNewModal from "@/components/app/WhatsNewModal";
import { ArrowDownToLine, ChevronRight, RefreshCw } from "lucide-react";

interface UpdateLogsSettingsProps {
  cardStyle: React.CSSProperties;
}

const UpdateLogsSettings = forwardRef<HTMLDivElement, UpdateLogsSettingsProps>(
  ({ cardStyle }, ref) => {
    const [openVersion, setOpenVersion] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const isElectron = !!(window as any).electronAPI?.isElectron;

    const latestVersion = useMemo(() => CHANGELOG[0]?.version ?? null, []);

    const handleCheckForUpdates = () => {
      if (!isElectron) return;
      setChecking(true);
      (window as any).electronAPI?.checkForUpdates?.();
      window.setTimeout(() => setChecking(false), 2500);
    };

    return (
      <div ref={ref} className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Update Logs</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Every patch we've shipped, with full notes. Currently on v{latestVersion}.
          </p>
        </div>

        <div className="rounded-[24px] border p-5" style={cardStyle}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                Check for a new version
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                You can force a GitHub update check anytime — Cubbly will install the latest patch silently in the background.
              </p>
            </div>
            {isElectron && (
              <button
                onClick={handleCheckForUpdates}
                disabled={checking}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60"
                style={{
                  backgroundColor: "var(--app-bg-secondary)",
                  borderColor: "var(--app-border)",
                  color: "var(--app-text-primary)",
                }}
              >
                {checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                Check for Updates
              </button>
            )}
          </div>
        </div>

        <div className="rounded-[24px] border overflow-hidden" style={cardStyle}>
          {CHANGELOG.map((entry, i) => (
            <button
              key={entry.version}
              onClick={() => setOpenVersion(entry.version)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-white/5"
              style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-border)" }}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl text-xs font-bold text-white shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(32 80% 55%), hsl(20 75% 50%))" }}
              >
                v{entry.version}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                  {entry.title || `Cubbly v${entry.version}`}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>
                  {new Date(entry.date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  {" · "}
                  {entry.newFeatures.length} new · {entry.bugFixes.length} fixes
                </p>
              </div>
              <ChevronRight className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
            </button>
          ))}
        </div>

        {openVersion && (
          <WhatsNewModal forceVersion={openVersion} onClose={() => setOpenVersion(null)} />
        )}
      </div>
    );
  },
);

UpdateLogsSettings.displayName = "UpdateLogsSettings";

export default UpdateLogsSettings;
