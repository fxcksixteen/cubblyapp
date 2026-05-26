import { useState } from "react";
import { createPortal } from "react-dom";
import { useServers } from "@/contexts/ServersContext";
import { supabase } from "@/integrations/supabase/client";
import { X, ArrowLeft, Home, Link2, Download, Users } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (serverId: string) => void;
}

type Mode = "picker" | "create" | "join" | "import";

const CreateServerModal = ({ open, onClose, onCreated }: Props) => {
  const { createServer, createServerFromTemplate, joinByCode, lookupInvite } = useServers();
  const [mode, setMode] = useState<Mode>("picker");
  const [name, setName] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<{ name: string; icon_url: string | null; member_count: number } | null>(null);
  const [templateInput, setTemplateInput] = useState("");
  const [templatePreview, setTemplatePreview] = useState<{
    name: string;
    description: string | null;
    usage_count: number;
    channels: Array<{ name: string; kind: "text" | "voice"; category: string | null }>;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName(""); setIconUrl(""); setCode(""); setPreview(null);
    setTemplateInput(""); setTemplatePreview(null);
  };
  const close = () => { reset(); setMode("picker"); onClose(); };

  const onCreate = async () => {
    if (!name.trim()) return toast.error("Pick a name");
    setBusy(true);
    try {
      const id = await createServer(name.trim(), iconUrl.trim() || null);
      if (id) { onCreated?.(id); close(); toast.success("Server created"); }
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
      if (id) { onCreated?.(id); close(); toast.success("Joined!"); }
    } catch (e: any) {
      toast.error(e?.message || "Failed to join");
    } finally { setBusy(false); }
  };

  const onLookupTemplate = async () => {
    if (!templateInput.trim()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("discord-template", {
        body: { input: templateInput.trim() },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const d = data as any;
      setTemplatePreview({
        name: d.name,
        description: d.description,
        usage_count: d.usage_count,
        channels: d.channels,
      });
      if (!name.trim()) setName(d.name);
    } catch (e: any) {
      setTemplatePreview(null);
      toast.error(e?.message || "Couldn't fetch that template");
    } finally { setBusy(false); }
  };

  const onImport = async () => {
    if (!templatePreview) return;
    const finalName = name.trim() || templatePreview.name;
    setBusy(true);
    try {
      const id = await createServerFromTemplate(finalName, iconUrl.trim() || null, templatePreview.channels);
      if (id) { onCreated?.(id); close(); toast.success("Server created from template"); }
    } catch (e: any) {
      toast.error(e?.message?.includes("LIMIT") ? "You've reached the 10 server limit" : (e?.message || "Failed"));
    } finally { setBusy(false); }
  };

  const headerTitle =
    mode === "picker" ? "Add a Server"
    : mode === "create" ? "Create a Server"
    : mode === "join" ? "Join a Server"
    : "Import Discord Template";
  const headerSubtitle =
    mode === "picker" ? "Create a new server or join an existing one."
    : mode === "create" ? "Give your new server a name and icon."
    : mode === "join" ? "Enter an invite code to join."
    : "Paste a discord.new link or template code.";

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div
        className="w-full max-w-md rounded-xl overflow-hidden"
        style={{ backgroundColor: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex items-start gap-2 min-w-0">
            {mode !== "picker" && (
              <button
                onClick={() => setMode("picker")}
                className="mt-0.5 p-1 rounded-md hover:opacity-70"
                aria-label="Back"
              >
                <ArrowLeft className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight" style={{ color: "var(--app-text-primary)" }}>
                {headerTitle}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--app-text-secondary)" }}>{headerSubtitle}</p>
            </div>
          </div>
          <button onClick={close} className="p-1 rounded-md hover:opacity-70" aria-label="Close">
            <X className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>
        </div>

        <div className="px-5 pb-5">
          {mode === "picker" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <PickerCard
                  icon={<Home className="h-5 w-5 text-white" />}
                  label="Create Server"
                  onClick={() => setMode("create")}
                />
                <PickerCard
                  icon={<Link2 className="h-5 w-5 text-white" />}
                  label="Join Server"
                  onClick={() => setMode("join")}
                />
              </div>
              <PickerCard
                icon={<Download className="h-5 w-5 text-white" />}
                label="Import Discord Template"
                onClick={() => setMode("import")}
                wide
              />
            </div>
          )}

          {mode === "create" && (
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Server name"
                maxLength={50}
                autoFocus
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
                className="w-full rounded-md py-2 text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
              >
                {busy ? "Creating…" : "Create Server"}
              </button>
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); }}
                  placeholder="Invite code (e.g. ABC123XY)"
                  maxLength={16}
                  autoFocus
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
                {busy ? "Joining…" : "Join Server"}
              </button>
            </div>
          )}

          {mode === "import" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={templateInput}
                  onChange={(e) => { setTemplateInput(e.target.value); setTemplatePreview(null); }}
                  placeholder="discord.new/abc123 or template code"
                  autoFocus
                  className="flex-1 rounded-md px-3 py-2 outline-none text-sm"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                />
                <button
                  onClick={onLookupTemplate}
                  disabled={busy || !templateInput.trim()}
                  className="rounded-md px-3 text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-secondary)", border: "1px solid var(--app-border)" }}
                >
                  {busy && !templatePreview ? "…" : "Fetch"}
                </button>
              </div>

              {templatePreview && (
                <div className="rounded-md p-3 space-y-2" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
                  <div className="font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>{templatePreview.name}</div>
                  {templatePreview.description && (
                    <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>{templatePreview.description}</p>
                  )}
                  <div className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                    {templatePreview.channels.length} channel{templatePreview.channels.length === 1 ? "" : "s"} • used {templatePreview.usage_count.toLocaleString()}×
                  </div>
                  <div className="max-h-32 overflow-y-auto pr-1 text-xs space-y-0.5 mt-1">
                    {templatePreview.channels.slice(0, 30).map((c, i) => (
                      <div key={i} style={{ color: "var(--app-text-secondary)" }}>
                        {c.kind === "voice" ? "🔊" : "#"} {c.name}
                        {c.category && <span className="opacity-60"> — {c.category}</span>}
                      </div>
                    ))}
                    {templatePreview.channels.length > 30 && (
                      <div className="opacity-60">+ {templatePreview.channels.length - 30} more…</div>
                    )}
                  </div>
                </div>
              )}

              {templatePreview && (
                <>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Server name (override)"
                    maxLength={50}
                    className="w-full rounded-md px-3 py-2 outline-none text-sm"
                    style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                  />
                  <input
                    value={iconUrl}
                    onChange={(e) => setIconUrl(e.target.value)}
                    placeholder="Icon URL (optional)"
                    className="w-full rounded-md px-3 py-2 outline-none text-sm"
                    style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                  />
                  <button
                    onClick={onImport}
                    disabled={busy}
                    className="w-full rounded-md py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
                  >
                    {busy ? "Importing…" : "Create from Template"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const PickerCard = ({
  icon, label, onClick, wide,
}: { icon: React.ReactNode; label: string; onClick: () => void; wide?: boolean }) => (
  <button
    onClick={onClick}
    className={`group flex ${wide ? "flex-row items-center justify-center gap-3 py-4" : "flex-col items-center justify-center gap-3 py-6"} rounded-lg transition-colors w-full`}
    style={{ backgroundColor: "var(--app-bg-tertiary)", border: "1px solid var(--app-border)" }}
  >
    <div
      className="h-10 w-10 rounded-full flex items-center justify-center transition-transform group-hover:scale-105"
      style={{ backgroundColor: "hsl(var(--primary))" }}
    >
      {icon}
    </div>
    <span className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{label}</span>
  </button>
);

export default CreateServerModal;
