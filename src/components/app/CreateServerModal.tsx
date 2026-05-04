import { useState } from "react";
import { useServers } from "@/contexts/ServersContext";
import { X, Plus, Users } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (serverId: string) => void;
}

const CreateServerModal = ({ open, onClose, onCreated }: Props) => {
  const { createServer, joinByCode, lookupInvite } = useServers();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<{ name: string; icon_url: string | null; member_count: number } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const onCreate = async () => {
    if (!name.trim()) return toast.error("Pick a name");
    setBusy(true);
    try {
      const id = await createServer(name.trim(), iconUrl.trim() || null);
      if (id) { onCreated?.(id); onClose(); reset(); toast.success("Server created"); }
    } catch (e: any) {
      toast.error(e?.message?.includes("LIMIT") ? "You've reached the 10 server limit" : (e?.message || "Failed"));
    } finally { setBusy(false); }
  };

  const onLookup = async () => {
    if (!code.trim()) return;
    const res = await lookupInvite(code.trim());
    if (!res) { setPreview(null); return toast.error("Invite not found"); }
    setPreview({ name: res.name, icon_url: res.icon_url, member_count: res.member_count });
  };

  const onJoin = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const id = await joinByCode(code.trim());
      if (id) { onCreated?.(id); onClose(); reset(); toast.success("Joined!"); }
    } catch (e: any) {
      toast.error(e?.message || "Failed to join");
    } finally { setBusy(false); }
  };

  const reset = () => { setName(""); setIconUrl(""); setCode(""); setPreview(null); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl overflow-hidden"
        style={{ backgroundColor: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--app-border)" }}>
          <h2 className="text-base font-semibold" style={{ color: "var(--app-text-primary)" }}>
            {tab === "create" ? "Create your server" : "Join a server"}
          </h2>
          <button onClick={onClose}><X className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} /></button>
        </div>

        <div className="flex border-b" style={{ borderColor: "var(--app-border)" }}>
          {(["create", "join"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 py-2 text-sm font-medium transition-colors"
              style={{
                color: tab === t ? "var(--app-text-primary)" : "var(--app-text-secondary)",
                borderBottom: tab === t ? "2px solid hsl(var(--primary))" : "2px solid transparent",
              }}
            >
              {t === "create" ? "Create" : "Join with code"}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-3">
          {tab === "create" ? (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Server name"
                maxLength={50}
                className="w-full rounded-md px-3 py-2 outline-none"
                style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
              />
              <input
                value={iconUrl}
                onChange={(e) => setIconUrl(e.target.value)}
                placeholder="Icon URL (optional)"
                className="w-full rounded-md px-3 py-2 outline-none text-sm"
                style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
              />
              <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                We'll set up a <strong>#general</strong> text channel and a <strong>General</strong> voice channel for you.
              </p>
              <button
                onClick={onCreate}
                disabled={busy || !name.trim()}
                className="w-full rounded-md py-2 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
              >
                <Plus className="h-4 w-4" /> Create server
              </button>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); }}
                  placeholder="Invite code (e.g. ABC123XY)"
                  maxLength={16}
                  className="flex-1 rounded-md px-3 py-2 outline-none uppercase tracking-wider"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                />
                <button
                  onClick={onLookup}
                  className="rounded-md px-3 text-sm font-medium"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-secondary)", border: "1px solid var(--app-border)" }}
                >
                  Look up
                </button>
              </div>

              {preview && (
                <div className="flex items-center gap-3 rounded-md p-3" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
                  {preview.icon_url ? (
                    <img src={preview.icon_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-full flex items-center justify-center text-base font-bold" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
                      {preview.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{preview.name}</div>
                    <div className="text-xs flex items-center gap-1" style={{ color: "var(--app-text-secondary)" }}>
                      <Users className="h-3 w-3" /> {preview.member_count} member{preview.member_count === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={onJoin}
                disabled={busy || !code.trim()}
                className="w-full rounded-md py-2 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
              >
                {busy ? "Joining…" : "Join server"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateServerModal;
