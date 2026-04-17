import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActivity } from "@/contexts/ActivityContext";
import { Gamepad2, FileText, FolderOpen, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

interface AddGameModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OpenWindow {
  title: string;
  processName: string;
}

const isElectron = typeof window !== "undefined" && (window as any).electronAPI?.isElectron;

/**
 * "Add Game" modal — two paths:
 *   1. "Currently Running" → list visible windows (friendlier) and processes,
 *      so the user can one-click add what they're already running.
 *   2. "Manual Entry"      → open a file picker for the .exe (existing flow).
 *
 * The modal works in any environment but the Currently Running tab requires
 * Electron — web users will only see Manual Entry.
 */
const AddGameModal = ({ isOpen, onClose }: AddGameModalProps) => {
  const { addMyGame } = useActivity();
  const [tab, setTab] = useState<"running" | "manual">(isElectron ? "running" : "manual");
  const [windows, setWindows] = useState<OpenWindow[]>([]);
  const [processes, setProcesses] = useState<string[]>([]);
  const [subTab, setSubTab] = useState<"windows" | "processes">("windows");
  const [loadingList, setLoadingList] = useState(false);
  const [search, setSearch] = useState("");
  const [pickedItem, setPickedItem] = useState<{ processName: string; suggestedName: string } | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [manualProcess, setManualProcess] = useState("");
  const [manualName, setManualName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchRunning = async () => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    setLoadingList(true);
    try {
      const [w, p] = await Promise.all([
        api.getOpenWindows?.() ?? Promise.resolve([]),
        api.getRunningProcesses?.() ?? Promise.resolve([]),
      ]);
      setWindows(Array.isArray(w) ? w : []);
      setProcesses(Array.isArray(p) ? p : []);
    } catch {
      setWindows([]);
      setProcesses([]);
    }
    setLoadingList(false);
  };

  useEffect(() => {
    if (isOpen && tab === "running") fetchRunning();
    if (!isOpen) {
      setPickedItem(null);
      setDisplayNameDraft("");
      setSearch("");
      setManualProcess("");
      setManualName("");
    }
  }, [isOpen, tab]);

  const prettify = (raw: string) =>
    raw
      .replace(/\.exe$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();

  const stripWindowSuffix = (title: string) =>
    title
      // Common "Title - App" patterns
      .replace(/\s+[-—–]\s+(Google Chrome|Mozilla Firefox|Microsoft Edge|Opera|Brave|Vivaldi).*$/i, "")
      .trim();

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (subTab === "windows") {
      const list = windows.map((w) => ({
        processName: w.processName,
        suggestedName: stripWindowSuffix(w.title) || prettify(w.processName),
        subtitle: w.processName,
      }));
      return q ? list.filter((it) => it.suggestedName.toLowerCase().includes(q) || it.processName.includes(q)) : list;
    }
    const list = processes.map((p) => ({
      processName: p,
      suggestedName: prettify(p),
      subtitle: `${p}.exe`,
    }));
    return q ? list.filter((it) => it.processName.includes(q)) : list;
  })();

  const handlePickItem = (processName: string, suggestedName: string) => {
    setPickedItem({ processName, suggestedName });
    setDisplayNameDraft(suggestedName);
  };

  const handleConfirmRunning = async () => {
    if (!pickedItem || !displayNameDraft.trim()) return;
    setSubmitting(true);
    try {
      await addMyGame(pickedItem.processName, displayNameDraft.trim());
      toast.success(`Added ${displayNameDraft.trim()} to your games`);
      onClose();
    } catch {
      toast.error("Failed to add game");
    }
    setSubmitting(false);
  };

  const handlePickExe = async () => {
    if (!isElectron) {
      toast.error("File picker is only available in the desktop app.");
      return;
    }
    const api = (window as any).electronAPI;
    const picked = await api.pickGameExe?.();
    if (!picked) return;
    setManualProcess(picked.processName);
    setManualName(picked.displayName);
  };

  const handleConfirmManual = async () => {
    const proc = manualProcess.trim().toLowerCase().replace(/\.exe$/, "");
    const name = manualName.trim();
    if (!proc || !name) {
      toast.error("Please fill in both the process name and display name.");
      return;
    }
    setSubmitting(true);
    try {
      await addMyGame(proc, name);
      toast.success(`Added ${name} to your games`);
      onClose();
    } catch {
      toast.error("Failed to add game");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg p-0 gap-0 overflow-hidden border"
        style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b" style={{ borderColor: "var(--app-border)" }}>
          <DialogTitle className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>
            Add a game
          </DialogTitle>
          <p className="text-xs mt-1" style={{ color: "var(--app-text-secondary)" }}>
            Pick something you're already running — or add an .exe yourself.
          </p>
        </DialogHeader>

        {/* Top tabs */}
        <div className="flex gap-1 px-4 pt-3" role="tablist">
          {isElectron && (
            <button
              role="tab"
              onClick={() => setTab("running")}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
              style={{
                backgroundColor: tab === "running" ? "var(--app-active)" : "transparent",
                color: tab === "running" ? "var(--app-text-primary)" : "var(--app-text-secondary)",
              }}
            >
              Currently Running
            </button>
          )}
          <button
            role="tab"
            onClick={() => setTab("manual")}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            style={{
              backgroundColor: tab === "manual" ? "var(--app-active)" : "transparent",
              color: tab === "manual" ? "var(--app-text-primary)" : "var(--app-text-secondary)",
            }}
          >
            Manual Entry
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pb-5 pt-3" style={{ minHeight: 360 }}>
          {tab === "running" && isElectron && (
            <div className="flex flex-col gap-3">
              {/* Sub-tabs */}
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
                  <button
                    onClick={() => setSubTab("windows")}
                    className="rounded-md px-3 py-1 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: subTab === "windows" ? "var(--app-bg-secondary)" : "transparent",
                      color: subTab === "windows" ? "var(--app-text-primary)" : "var(--app-text-secondary)",
                    }}
                  >
                    Windows
                  </button>
                  <button
                    onClick={() => setSubTab("processes")}
                    className="rounded-md px-3 py-1 text-xs font-semibold transition-colors"
                    style={{
                      backgroundColor: subTab === "processes" ? "var(--app-bg-secondary)" : "transparent",
                      color: subTab === "processes" ? "var(--app-text-primary)" : "var(--app-text-secondary)",
                    }}
                  >
                    Processes
                  </button>
                </div>
                <button
                  onClick={fetchRunning}
                  className="ml-auto flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--app-hover)]"
                  style={{ color: "var(--app-text-secondary)" }}
                  title="Refresh"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingList ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" style={{ color: "var(--app-text-secondary)" }} />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={subTab === "windows" ? "Search by window title…" : "Search processes…"}
                  className="pl-9 h-9 text-sm border-0"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)" }}
                />
              </div>

              {/* List */}
              <div
                className="rounded-xl border max-h-56 overflow-y-auto"
                style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" }}
              >
                {loadingList ? (
                  <div className="flex items-center justify-center py-10 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                    Scanning…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-xs" style={{ color: "var(--app-text-secondary)" }}>
                    <Gamepad2 className="h-6 w-6 opacity-40" />
                    Nothing matches.
                  </div>
                ) : (
                  filtered.map((it) => {
                    const active = pickedItem?.processName === it.processName;
                    return (
                      <button
                        key={`${subTab}-${it.processName}-${it.suggestedName}`}
                        onClick={() => handlePickItem(it.processName, it.suggestedName)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors border-b last:border-0"
                        style={{
                          borderColor: "var(--app-border)",
                          backgroundColor: active ? "var(--app-active)" : "transparent",
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = "var(--app-hover)"; }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        <Gamepad2 className="h-4 w-4 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                            {it.suggestedName}
                          </p>
                          <p className="truncate text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
                            {it.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Confirm row */}
              {pickedItem && (
                <div className="flex flex-col gap-2 rounded-xl p-3 border" style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" }}>
                  <Label className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                    Display name (what others will see)
                  </Label>
                  <Input
                    value={displayNameDraft}
                    onChange={(e) => setDisplayNameDraft(e.target.value)}
                    maxLength={50}
                    className="h-9 text-sm border-0"
                    style={{ backgroundColor: "var(--app-bg-secondary)", color: "var(--app-text-primary)" }}
                  />
                  <Button
                    onClick={handleConfirmRunning}
                    disabled={!displayNameDraft.trim() || submitting}
                    className="bg-[#5865f2] hover:bg-[#4752c4] text-white"
                  >
                    {submitting ? "Adding…" : `Add "${displayNameDraft.trim() || pickedItem.suggestedName}"`}
                  </Button>
                </div>
              )}
            </div>
          )}

          {tab === "manual" && (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl p-4 border flex items-start gap-3" style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" }}>
                <FileText className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--app-text-secondary)" }} />
                <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                  Cubbly matches the lowercase process name (without <code>.exe</code>) against your running processes.
                  {isElectron ? " Pick an .exe to fill this in automatically." : " Web users can type the name manually."}
                </p>
              </div>

              {isElectron && (
                <Button
                  onClick={handlePickExe}
                  variant="outline"
                  className="justify-start gap-2"
                  style={{
                    backgroundColor: "var(--app-bg-tertiary)",
                    borderColor: "var(--app-border)",
                    color: "var(--app-text-primary)",
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse for .exe…
                </Button>
              )}

              <div>
                <Label className="text-xs" style={{ color: "var(--app-text-secondary)" }}>Process name</Label>
                <Input
                  value={manualProcess}
                  onChange={(e) => setManualProcess(e.target.value)}
                  placeholder="e.g. valorant"
                  className="mt-1 h-9 text-sm border-0"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)" }}
                />
              </div>
              <div>
                <Label className="text-xs" style={{ color: "var(--app-text-secondary)" }}>Display name</Label>
                <Input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="e.g. VALORANT"
                  maxLength={50}
                  className="mt-1 h-9 text-sm border-0"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)" }}
                />
              </div>

              <Button
                onClick={handleConfirmManual}
                disabled={!manualProcess.trim() || !manualName.trim() || submitting}
                className="bg-[#5865f2] hover:bg-[#4752c4] text-white"
              >
                {submitting ? "Adding…" : "Add Game"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddGameModal;
