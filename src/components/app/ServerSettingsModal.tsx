import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Hash,
  Volume2,
  Crown,
  Trash2,
  Pencil,
  UserMinus,
  Copy,
  Link2Off,
  Loader2,
  Plus,
  ArrowUpRightFromCircle,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServers, type Server } from "@/contexts/ServersContext";
import { useServerChannels, useServerMembers } from "@/hooks/useServerChannels";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getProfileColor } from "@/lib/profileColors";

type Tab = "overview" | "channels" | "roles" | "members" | "invites";

interface Props {
  server: Server;
  onClose: () => void;
  onDeleted?: () => void;
}

/**
 * Discord-style owner-only server settings panel. Four tabs in a left rail:
 * Overview (rename / icon / delete), Channels (rename / delete inline),
 * Members (kick / transfer ownership), Invites (list / revoke / create).
 *
 * Rendered into document.body via a portal so it always sits above the
 * server view's sidebars regardless of stacking context.
 */
const ServerSettingsModal = ({ server, onClose, onDeleted }: Props) => {
  const [tab, setTab] = useState<Tab>("overview");

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 animate-fade-in">
      <div
        className="relative flex w-[min(960px,95vw)] h-[min(640px,85vh)] overflow-hidden rounded-2xl shadow-2xl"
        style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left rail */}
        <div
          className="w-56 flex-shrink-0 px-3 py-5 flex flex-col gap-0.5"
          style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}
        >
          <div
            className="px-2 mb-2 text-[10px] font-bold uppercase tracking-wide truncate"
            style={{ color: "var(--app-text-secondary)" }}
          >
            {server.name}
          </div>
          <RailItem label="Overview" active={tab === "overview"} onClick={() => setTab("overview")} />
          <RailItem label="Channels" active={tab === "channels"} onClick={() => setTab("channels")} />
          <RailItem label="Roles" active={tab === "roles"} onClick={() => setTab("roles")} />
          <RailItem label="Members" active={tab === "members"} onClick={() => setTab("members")} />
          <RailItem label="Invites" active={tab === "invites"} onClick={() => setTab("invites")} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 rounded-full p-1.5 transition-colors hover:bg-[var(--app-hover)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>

          {tab === "overview" && <OverviewTab server={server} onDeleted={onDeleted} onClose={onClose} />}
          {tab === "channels" && <ChannelsTab serverId={server.id} />}
          {tab === "members" && <MembersTab server={server} onClose={onClose} />}
          {tab === "invites" && <InvitesTab serverId={server.id} />}
        </div>
      </div>
    </div>,
    document.body,
  );
};

const RailItem = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="w-full text-left rounded-md px-3 py-1.5 text-sm transition-colors"
    style={{
      backgroundColor: active ? "var(--app-hover, #35373c)" : "transparent",
      color: active ? "var(--app-text-primary)" : "var(--app-text-secondary)",
      fontWeight: active ? 600 : 500,
    }}
  >
    {label}
  </button>
);

// =============== Overview ===============

const OverviewTab = ({
  server,
  onDeleted,
  onClose,
}: {
  server: Server;
  onDeleted?: () => void;
  onClose: () => void;
}) => {
  const { refresh } = useServers();
  const [name, setName] = useState(server.name);
  const [iconUrl, setIconUrl] = useState(server.icon_url ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== server.name || (iconUrl || "") !== (server.icon_url ?? "");

  const onSave = async () => {
    if (!dirty || !name.trim()) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("update_server", {
      _server_id: server.id,
      _name: name.trim(),
      _icon_url: iconUrl.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Server updated");
    await refresh();
  };

  const onUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Pick an image");
    if (file.size > 5_000_000) return toast.error("Max 5 MB");
    const path = `servers/${server.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("group-pictures").upload(path, file, { upsert: true });
    if (upErr) return toast.error(upErr.message);
    const { data: pub } = supabase.storage.from("group-pictures").getPublicUrl(path);
    setIconUrl(pub.publicUrl);
  };

  const onDelete = async () => {
    const ok = window.confirm(`Permanently delete "${server.name}"? This cannot be undone.`);
    if (!ok) return;
    const { error } = await (supabase as any).rpc("delete_server", { _server_id: server.id });
    if (error) return toast.error(error.message);
    toast.success("Server deleted");
    await refresh();
    onClose();
    onDeleted?.();
  };

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold mb-6" style={{ color: "var(--app-text-primary)" }}>
        Server Overview
      </h2>

      <div className="flex items-start gap-5 mb-6">
        <div className="relative h-24 w-24 shrink-0">
          {iconUrl ? (
            <img src={iconUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <div
              className="h-24 w-24 rounded-full flex items-center justify-center text-3xl font-bold text-white"
              style={{ backgroundColor: "var(--app-bg-primary)" }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-2">
          <label className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-md bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752c4]">
            Upload icon
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onUpload(f);
              }}
            />
          </label>
          {iconUrl && (
            <button
              onClick={() => setIconUrl("")}
              className="text-xs text-left text-[#ed4245] hover:underline"
            >
              Remove icon
            </button>
          )}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-[11px] font-bold uppercase mb-2" style={{ color: "var(--app-text-secondary)" }}>
          Server name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          className="w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#5865f2]"
          style={{ backgroundColor: "var(--app-bg-primary)", color: "var(--app-text-primary)" }}
        />
      </div>

      <div className="flex justify-end mb-10">
        <button
          disabled={!dirty || saving || !name.trim()}
          onClick={onSave}
          className="rounded-md bg-[#3ba55c] px-5 py-2 text-sm font-semibold text-white hover:bg-[#2d8a4a] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <div
        className="rounded-lg p-4 border"
        style={{ borderColor: "rgba(237,66,69,0.3)", backgroundColor: "rgba(237,66,69,0.05)" }}
      >
        <h3 className="text-sm font-bold mb-1" style={{ color: "#ed4245" }}>
          Danger Zone
        </h3>
        <p className="text-xs mb-3" style={{ color: "var(--app-text-secondary)" }}>
          Deleting a server is permanent and removes all channels, messages, and members.
        </p>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-2 rounded-md bg-[#ed4245] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c63a3d]"
        >
          <Trash2 className="h-4 w-4" /> Delete server
        </button>
      </div>
    </div>
  );
};

// =============== Channels ===============

const ChannelsTab = ({ serverId }: { serverId: string }) => {
  const { channels, refresh } = useServerChannels(serverId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const onRename = async (id: string) => {
    if (!editName.trim()) return;
    const { error } = await (supabase as any).rpc("rename_server_channel", {
      _channel_id: id,
      _name: editName.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Channel renamed");
    setEditingId(null);
    refresh();
  };

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete #${name}? All messages in it will be lost.`)) return;
    const { error } = await (supabase as any).rpc("delete_server_channel", { _channel_id: id });
    if (error) return toast.error(error.message === "CANNOT_DELETE_LAST_CHANNEL" ? "You need at least one channel." : error.message);
    toast.success("Channel deleted");
    refresh();
  };

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold mb-6" style={{ color: "var(--app-text-primary)" }}>
        Channels
      </h2>
      <div className="space-y-1">
        {channels.map((c) => {
          const Icon = c.kind === "voice" ? Volume2 : Hash;
          return (
            <div
              key={c.id}
              className="flex items-center gap-2 rounded-md px-3 py-2 group"
              style={{ backgroundColor: "var(--app-bg-primary)" }}
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
              {editingId === c.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onRename(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 rounded bg-transparent px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-[#5865f2]"
                    style={{ color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                  />
                  <button
                    onClick={() => onRename(c.id)}
                    className="text-xs font-semibold text-[#3ba55c] hover:underline"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs text-[var(--app-text-secondary)] hover:underline"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm" style={{ color: "var(--app-text-primary)" }}>
                    {c.name}
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--app-text-secondary)" }}
                  >
                    {c.kind}
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(c.id);
                      setEditName(c.name);
                    }}
                    title="Rename"
                    className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--app-hover)] transition-opacity"
                  >
                    <Pencil className="h-3.5 w-3.5" style={{ color: "var(--app-text-secondary)" }} />
                  </button>
                  <button
                    onClick={() => onDelete(c.id, c.name)}
                    title="Delete"
                    className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-[var(--app-hover)] transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5" style={{ color: "#ed4245" }} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-xs" style={{ color: "var(--app-text-secondary)" }}>
        Use the “+” next to each channel category in the server view to create new channels.
      </p>
    </div>
  );
};

// =============== Members ===============

const MembersTab = ({ server, onClose }: { server: Server; onClose: () => void }) => {
  const { user } = useAuth();
  const { members, refresh } = useServerMembers(server.id);
  const { refresh: refreshServers } = useServers();

  const onKick = async (uid: string, name: string) => {
    if (!window.confirm(`Kick ${name} from the server?`)) return;
    const { error } = await (supabase as any).rpc("kick_server_member", {
      _server_id: server.id,
      _user_id: uid,
    });
    if (error) return toast.error(error.message);
    toast.success(`${name} kicked`);
    refresh();
  };

  const onTransfer = async (uid: string, name: string) => {
    const phrase = `transfer to ${name}`;
    const got = window.prompt(`Transfer ownership of ${server.name} to ${name}?\nType: ${phrase}`);
    if (got !== phrase) return;
    const { error } = await (supabase as any).rpc("transfer_server_ownership", {
      _server_id: server.id,
      _new_owner: uid,
    });
    if (error) return toast.error(error.message);
    toast.success(`Ownership transferred to ${name}`);
    await refreshServers();
    refresh();
    onClose();
  };

  const sorted = useMemo(() => {
    return [...members].sort((a, b) => {
      if (a.role === "owner") return -1;
      if (b.role === "owner") return 1;
      return a.display_name.localeCompare(b.display_name);
    });
  }, [members]);

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold mb-1" style={{ color: "var(--app-text-primary)" }}>
        Members — {members.length}
      </h2>
      <p className="text-xs mb-5" style={{ color: "var(--app-text-secondary)" }}>
        Manage who's in your server.
      </p>
      <div className="space-y-1">
        {sorted.map((m) => {
          const isYou = m.user_id === user?.id;
          const isOwner = m.role === "owner";
          const color = getProfileColor(m.user_id);
          return (
            <div
              key={m.user_id}
              className="flex items-center gap-3 rounded-md px-3 py-2 group"
              style={{ backgroundColor: "var(--app-bg-primary)" }}
            >
              {m.avatar_url ? (
                <img src={m.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: color.bg }}
                >
                  {m.display_name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                    {m.display_name}
                  </span>
                  {isOwner && <Crown className="h-3.5 w-3.5 shrink-0" style={{ color: "#faa61a" }} />}
                  {isYou && (
                    <span className="text-[10px] uppercase font-bold" style={{ color: "var(--app-text-secondary)" }}>
                      you
                    </span>
                  )}
                </div>
                {m.username && (
                  <div className="text-xs truncate" style={{ color: "var(--app-text-secondary)" }}>
                    @{m.username}
                  </div>
                )}
              </div>
              {!isYou && !isOwner && (
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onTransfer(m.user_id, m.display_name)}
                    title="Transfer ownership"
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--app-hover)]"
                    style={{ color: "var(--app-text-secondary)" }}
                  >
                    <ArrowUpRightFromCircle className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onKick(m.user_id, m.display_name)}
                    title="Kick"
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold hover:bg-[rgba(237,66,69,0.15)]"
                    style={{ color: "#ed4245" }}
                  >
                    <UserMinus className="h-3.5 w-3.5" /> Kick
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// =============== Invites ===============

type Invite = {
  id: string;
  code: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
};

const InvitesTab = ({ serverId }: { serverId: string }) => {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("server_invites")
      .select("id, code, created_at, expires_at, max_uses, uses")
      .eq("server_id", serverId)
      .order("created_at", { ascending: false });
    setInvites((data as Invite[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const onCreate = async () => {
    setCreating(true);
    const { error } = await (supabase as any).rpc("create_server_invite", {
      _server_id: serverId,
      _max_uses: null,
      _expires_in_seconds: 7 * 24 * 60 * 60,
    });
    setCreating(false);
    if (error) return toast.error(error.message);
    toast.success("Invite created");
    load();
  };

  const onRevoke = async (id: string) => {
    if (!window.confirm("Revoke this invite? Anyone with the link won't be able to join.")) return;
    const { error } = await (supabase as any).rpc("revoke_server_invite", { _invite_id: id });
    if (error) return toast.error(error.message);
    toast.success("Invite revoked");
    setInvites((prev) => prev.filter((i) => i.id !== id));
  };

  const onCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Invite code copied");
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold" style={{ color: "var(--app-text-primary)" }}>
          Invite Codes
        </h2>
        <button
          onClick={onCreate}
          disabled={creating}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#5865f2] px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-[#4752c4] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New invite
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--app-text-secondary)" }} />
        </div>
      ) : invites.length === 0 ? (
        <p className="text-sm py-6 text-center" style={{ color: "var(--app-text-secondary)" }}>
          No invites yet. Click “New invite” to generate one.
        </p>
      ) : (
        <div className="space-y-1">
          {invites.map((inv) => {
            const expired = inv.expires_at && new Date(inv.expires_at) < new Date();
            const usedUp = inv.max_uses != null && inv.uses >= inv.max_uses;
            return (
              <div
                key={inv.id}
                className="flex items-center gap-3 rounded-md px-3 py-2.5"
                style={{ backgroundColor: "var(--app-bg-primary)" }}
              >
                <code className="font-mono text-sm font-bold tracking-wide" style={{ color: "var(--app-text-primary)" }}>
                  {inv.code}
                </code>
                <div className="flex-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                  {inv.uses} use{inv.uses === 1 ? "" : "s"}
                  {inv.max_uses != null && ` / ${inv.max_uses}`}
                  {expired && " · expired"}
                  {usedUp && " · used up"}
                </div>
                <button
                  onClick={() => onCopy(inv.code)}
                  title="Copy code"
                  className="rounded p-1.5 hover:bg-[var(--app-hover)]"
                >
                  <Copy className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
                </button>
                <button
                  onClick={() => onRevoke(inv.id)}
                  title="Revoke"
                  className="rounded p-1.5 hover:bg-[rgba(237,66,69,0.15)]"
                >
                  <Link2Off className="h-4 w-4" style={{ color: "#ed4245" }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ServerSettingsModal;
