import { useEffect, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface UpdateStatusPayload {
  type: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

const UpdateModal = () => {
  const [info, setInfo] = useState<null | { version: string }>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<null | number>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onUpdateDownloaded) return;

    const offDownloaded = api.onUpdateDownloaded?.((payload: { version: string }) => {
      setInfo({ version: payload?.version || "new version" });
      setDownloading(false);
      setProgress(null);
    });

    const offProgress = api.onUpdateProgress?.((p: number) => {
      setDownloading(true);
      setProgress(Math.round(p));
    });

    const offAvailable = api.onUpdateAvailable?.((payload: { version?: string }) => {
      setDownloading(true);
      setProgress(0);
      if (payload?.version) {
        toast.success(`Update found: v${payload.version}. Downloading now.`);
      }
    });

    const offStatus = api.onUpdateStatus?.((payload: UpdateStatusPayload) => {
      switch (payload?.type) {
        case "checking":
          toast.info("Checking for updates...");
          break;
        case "not-available":
          toast.success(`You're already on the latest version${payload?.version ? ` (v${payload.version})` : ""}.`);
          setDownloading(false);
          setProgress(null);
          break;
        case "downloaded":
          setInfo({ version: payload?.version || "new version" });
          setDownloading(false);
          setProgress(null);
          break;
        case "error":
          toast.error(payload?.message || "Update check failed.");
          setDownloading(false);
          setProgress(null);
          break;
        default:
          break;
      }
    });

    return () => {
      offDownloaded?.();
      offProgress?.();
      offAvailable?.();
      offStatus?.();
    };
  }, []);

  const handleRestart = () => {
    setInstalling(true);
    (window as any).electronAPI?.installUpdate?.();
  };

  if (!info) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in"
      style={{
        backgroundColor: "rgba(15, 10, 6, 0.55)",
        backdropFilter: "blur(20px) saturate(140%)",
        WebkitBackdropFilter: "blur(20px) saturate(140%)",
      }}
    >
      <div
        className="relative w-[420px] max-w-[90vw] rounded-2xl p-7 text-center shadow-2xl animate-scale-in"
        style={{
          background:
            "linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="pointer-events-none absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ backgroundColor: "hsl(32, 80%, 55%)" }}
        />

        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, hsl(32, 80%, 55%), hsl(20, 75%, 50%))",
            boxShadow: "0 8px 24px hsla(32, 80%, 50%, 0.4)",
          }}
        >
          <Sparkles className="h-7 w-7 text-white" />
        </div>

        <h2 className="mb-2 text-xl font-bold text-white">Cubbly is ready to update</h2>
        <p className="mb-6 text-sm leading-relaxed text-white/70">
          A new version{info.version ? ` (v${info.version})` : ""} has been downloaded. Restart Cubbly now to apply the update.
        </p>

        {downloading && progress !== null && (
          <div className="mb-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.1)" }}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${progress}%`,
                  background:
                    "linear-gradient(90deg, hsl(32, 80%, 55%), hsl(20, 75%, 50%))",
                }}
              />
            </div>
            <p className="mt-2 text-xs text-white/50">Downloading… {progress}%</p>
          </div>
        )}

        <button
          onClick={handleRestart}
          disabled={installing}
          className="group relative w-full overflow-hidden rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
          style={{
            background:
              "linear-gradient(135deg, hsl(32, 80%, 55%), hsl(20, 75%, 50%))",
            boxShadow: "0 6px 20px hsla(32, 80%, 50%, 0.35)",
          }}
        >
          <span className="relative flex items-center justify-center gap-2">
            {installing ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Restarting…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Restart & Update
              </>
            )}
          </span>
        </button>

        <p className="mt-3 text-[11px] text-white/40">Cubbly will close and reopen automatically.</p>
      </div>
    </div>
  );
};

export default UpdateModal;
