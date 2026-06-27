import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Hash, Volume2, Plus, Settings, UserPlus, LogOut, Copy, Loader2, ChevronDown, ChevronRight, Crown, MicOff, Headphones, Video, MonitorUp, type LucideIcon } from "lucide-react";
import { useServers, type ServerChannel } from "@/contexts/ServersContext";
import { useServerChannels, useServerMembers } from "@/hooks/useServerChannels";
import { useChannelVoiceParticipants } from "@/hooks/useChannelVoiceParticipants";
import type { Conversation } from "@/hooks/useConversations";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupCall } from "@/contexts/GroupCallContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ChatView from "@/components/app/ChatView";
import ServerVoicePanel from "@/components/app/ServerVoicePanel";
import SidebarGroupCallCard from "@/components/app/SidebarGroupCallCard";
import SidebarActivityCard from "@/components/app/SidebarActivityCard";
import UserPanel from "@/components/app/UserPanel";
import StatusIndicator from "@/components/app/StatusIndicator";
import UserDisplayName from "@/components/app/UserDisplayName";
import UserBadges from "@/components/app/UserBadges";
import { getEffectivePresenceStatus } from "@/lib/presence";
import { getProfileColor } from "@/lib/profileColors";
import { Button } from "@/components/ui/button";

const ServerView = () => {
  const location = useLocation();
  const parts = location.pathname.split("/").filter(Boolean);
  // /@me/server/:serverId/:channelId?
  const serverId = parts[1] === "server" ? parts[2] : undefined;
  const channelId = parts[1] === "server" ? parts[3] : undefined;
  const navigate = useNavigate();
  const { user, onlineUserIds } = useAuth();
  const { servers, refresh: refreshServers } = useServers();
  const server = servers.find((s) => s.id === serverId);
  const { channels } = useServerChannels(serverId || null);
  const { members } = useServerMembers(serverId || null);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);

  const isOwner = !!server && server.owner_id === user?.id;

  // Auto-select first text channel if none specified
  useEffect(() => {
    if (!channelId && channels.length > 0 && serverId) {
      const firstText = channels.find((c) => c.kind === "text");
      if (firstText) navigate(`/@me/server/${serverId}/${firstText.id}`, { replace: true });
    }
  }, [channelId, channels, serverId, navigate]);

  const activeChannel = channels.find((c) => c.id === channelId);
  const activeParticipant = useMemo(() => ({
    user_id: server?.id || "server",
    display_name: server?.name || "Server",
    username: "",
    avatar_url: server?.icon_url || null,
    status: "online",
  }), [server?.id, server?.name, server?.icon_url]);

  useEffect(() => {
    let cancelled = false;
    if (!activeChannel?.conversation_id) { setActiveConv(null); return; }
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, is_group, name, picture_url, owner_id")
        .eq("id", activeChannel.conversation_id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setActiveConv(null); return; }
      setActiveConv({
        id: data.id,
        is_group: data.is_group,
        name: data.name,
        picture_url: data.picture_url,
        owner_id: data.owner_id,
        participant: activeParticipant,
        members: members.map((m) => ({
          user_id: m.user_id,
          display_name: m.display_name,
          username: m.username,
          avatar_url: m.avatar_url,
          status: m.status,
        })),
      });
    })();
    return () => { cancelled = true; };
  }, [activeChannel?.conversation_id, activeParticipant, members]);

  const [createChanOpen, setCreateChanOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);

  const onLeave = async () => {
    if (!server || !user) return;
    if (isOwner) {
      if (!confirm("You own this server. Delete it permanently?")) return;
      await supabase.from("servers").delete().eq("id", server.id);
      toast.success("Server deleted");
    } else {
      if (!confirm(`Leave ${server.name}?`)) return;
      await supabase.from("server_members").delete().eq("server_id", server.id).eq("user_id", user.id);
      toast.success("Left server");
    }
    await refreshServers();
    navigate("/@me/online", { replace: true });
  };

  if (!server) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ backgroundColor: "var(--app-bg-primary)" }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--app-text-secondary)" }} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      {/* Channel sidebar */}
      <div className="w-60 flex flex-col" style={{ backgroundColor: "var(--app-bg-secondary)" }}>
        {/* Server header */}
        <div className="relative">
          <button
            onClick={() => setHeaderMenuOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 border-b transition-colors"
            style={{ borderColor: "var(--app-border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
          >
            <span className="text-sm font-bold truncate" style={{ color: "var(--app-text-primary)" }}>{server.name}</span>
            <ChevronDown className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>
          {headerMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setHeaderMenuOpen(false)} />
              <div
                className="absolute left-2 right-2 top-full z-20 mt-1 rounded-md py-1 shadow-lg"
                style={{ backgroundColor: "var(--app-bg-tertiary)", border: "1px solid var(--app-border)" }}
              >
                <MenuItem icon={UserPlus} label="Invite people" onClick={() => { setInviteOpen(true); setHeaderMenuOpen(false); }} />
                {isOwner && <MenuItem icon={Plus} label="Create channel" onClick={() => { setCreateChanOpen(true); setHeaderMenuOpen(false); }} />}
                {isOwner && <MenuItem icon={Settings} label="Server settings" onClick={() => toast.info("Coming soon")} />}
                <MenuItem icon={LogOut} label={isOwner ? "Delete server" : "Leave server"} danger onClick={onLeave} />
              </div>
            </>
          )}
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <ChannelGroup label="Text Channels" channels={channels.filter((c) => c.kind === "text")} activeId={channelId}
            onSelect={(id) => navigate(`/@me/server/${serverId}/${id}`)} />
          <ChannelGroup label="Voice Channels" channels={channels.filter((c) => c.kind === "voice")} activeId={channelId}
            onSelect={(id) => navigate(`/@me/server/${serverId}/${id}`)} />
        </div>
        {/* Voice-Connected card pinned to the bottom of the channel sidebar,
            mirroring the DM sidebar so users can mute/share/disconnect without
            leaving the server view. Pass fallback info so it paints instantly
            instead of blanking while the supabase lookup races. */}
        <SidebarActivityCard />
        <SidebarGroupCallCard
          fallbackServerInfo={
            serverId && channelId && server?.name
              ? { server_id: serverId, server_name: server.name, channel_id: channelId }
              : null
          }
        />

        {/* Profile / mute / deafen / settings — same panel as the DM sidebar
            so the user always has these controls in reach. */}
        <UserPanel />

      </div>

      {/* Main: chat or voice channel placeholder */}
      <div className="flex-1 min-w-0 flex flex-col">
        {activeChannel?.kind === "text" && activeConv ? (
          <ChatView
            conversation={activeConv}
            conversationId={activeConv.id}
            recipientName={`#${activeChannel.name}`}
            showGroupMembers={false}
          />
        ) : activeChannel?.kind === "voice" ? (
          <VoiceChannelPanel channel={activeChannel} conversation={activeConv} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm" style={{ color: "var(--app-text-secondary)" }}>
            {channels.length === 0 ? "No channels yet" : "Select a channel"}
          </div>
        )}
      </div>

      {/* Members panel */}
      <div className="w-60 flex flex-col border-l" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}>
        <div className="px-3 py-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-secondary)" }}>
          Members — {members.length}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {members.map((m) => {
            const status = getEffectivePresenceStatus(m.user_id, m.status, onlineUserIds);
            const color = getProfileColor(m.user_id);
            return (
              <div key={m.user_id} className="flex items-center gap-2 px-2 py-1 rounded transition-colors hover:bg-[var(--app-hover)]">
                <div className="relative shrink-0">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ backgroundColor: color.bg, color: "white" }}>
                      {m.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <StatusIndicator status={status} size="sm" borderColor="var(--app-bg-secondary)" />
                  </div>
                </div>
                <div className="min-w-0 flex-1 flex items-center gap-1">
                  <UserDisplayName userId={m.user_id} name={m.display_name} className="truncate text-sm font-medium" />
                  <UserBadges userId={m.user_id} size={12} />
                  {m.role === "owner" && <Crown aria-label="Owner" className="h-3.5 w-3.5 shrink-0" style={{ color: "#faa61a" }} />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {createChanOpen && <CreateChannelModal serverId={server.id} onClose={() => setCreateChanOpen(false)} />}
      {inviteOpen && <InviteModal serverId={server.id} onClose={() => setInviteOpen(false)} />}
    </div>
  );
};

const MenuItem = ({ icon: Icon, label, onClick, danger }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) => (
  <button
    onClick={onClick}
    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors"
    style={{ color: danger ? "#ed4245" : "var(--app-text-primary)" }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover)")}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const ChannelGroup = ({
  label, channels, activeId, onSelect,
}: { label: string; channels: ServerChannel[]; activeId?: string; onSelect: (id: string) => void }) => {
  if (channels.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-secondary)" }}>{label}</div>
      {channels.map((c) => {
        const isActive = c.id === activeId;
        const Icon = c.kind === "voice" ? Volume2 : Hash;
        return (
          <div key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors"
              style={{
                backgroundColor: isActive ? "var(--app-active, #404249)" : undefined,
                color: isActive ? "var(--app-text-primary)" : "var(--app-text-secondary)",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--app-hover)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = ""; }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{c.name}</span>
            </button>
            {c.kind === "voice" && c.conversation_id && (
              <VoiceChannelParticipants conversationId={c.conversation_id} />
            )}
          </div>
        );
      })}
    </div>
  );
};

/** Discord-style list of avatars + names of users currently in a voice channel. */
const VoiceChannelParticipants = ({ conversationId }: { conversationId: string }) => {
  const { participants } = useChannelVoiceParticipants(conversationId);
  if (participants.length === 0) return null;
  return (
    <div className="ml-6 mt-0.5 mb-1 space-y-0.5">
      {participants.map((p) => (
        <div
          key={p.user_id}
          className="flex items-center gap-2 px-2 py-1 rounded transition-colors hover:bg-[var(--app-hover)]"
        >
          {p.avatar_url ? (
            <img src={p.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
          ) : (
            <div
              className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: getProfileColor(p.user_id).bg, color: "white" }}
            >
              {p.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <UserDisplayName
            userId={p.user_id}
            name={p.display_name}
            className="flex-1 truncate text-[13px]"
          />
          <div className="flex items-center gap-1 shrink-0" style={{ color: "var(--app-text-secondary)" }}>
            {p.is_screen_sharing && <MonitorUp className="h-3 w-3" />}
            {p.is_video_on && <Video className="h-3 w-3" />}
            {p.is_deafened ? (
              <Headphones className="h-3 w-3" style={{ color: "#ed4245" }} />
            ) : p.is_muted ? (
              <MicOff className="h-3 w-3" style={{ color: "#ed4245" }} />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
};

const VoiceChannelPanel = ({ channel, conversation }: { channel: ServerChannel; conversation: Conversation | null }) => {
  const groupCall = useGroupCall();
  const isJoined = !!conversation && groupCall.activeCall?.conversationId === conversation.id;
  const handleJoin = async () => {
    if (!conversation) return;
    if (isJoined) { groupCall.leaveCall(); return; }
    await groupCall.startCall(conversation.id, channel.name, conversation.members.map((m) => m.user_id));
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-5 h-14 border-b" style={{ borderColor: "var(--app-border)" }}>
        <Volume2 className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />
        <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>{channel.name}</span>
      </div>
      {isJoined && conversation ? (
        <ServerVoicePanel conversationId={conversation.id} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-center p-6">
          <div className="max-w-sm">
            <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full mb-4" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
              <Volume2 className="h-8 w-8" style={{ color: "hsl(var(--primary))" }} />
            </div>
            <h3 className="font-semibold mb-1" style={{ color: "var(--app-text-primary)" }}>Voice channel</h3>
            <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
              Join this channel to talk with everyone here.
            </p>
            <Button onClick={handleJoin} disabled={!conversation} className="mt-4 rounded-full px-5">
              Join Voice
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};


const CreateChannelModal = ({ serverId, onClose }: { serverId: string; onClose: () => void }) => {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"text" | "voice">("text");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_server_channel", { _server_id: serverId, _name: name.trim(), _kind: kind, _category: null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Channel created");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ backgroundColor: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--app-border)" }}>
          <h3 className="text-base font-semibold" style={{ color: "var(--app-text-primary)" }}>Create channel</h3>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex gap-2">
            {(["text", "voice"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)}
                className="flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm transition-colors"
                style={{
                  backgroundColor: kind === k ? "hsl(var(--primary))" : "var(--app-bg-tertiary)",
                  color: kind === k ? "hsl(var(--primary-foreground))" : "var(--app-text-secondary)",
                }}>
                {k === "text" ? <Hash className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {k === "text" ? "Text" : "Voice"}
              </button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            placeholder="channel-name" maxLength={50}
            className="w-full rounded-md px-3 py-2 outline-none"
            style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }} />
          <button onClick={submit} disabled={busy || !name.trim()}
            className="w-full rounded-md py-2 text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
};

const InviteModal = ({ serverId, onClose }: { serverId: string; onClose: () => void }) => {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setBusy(true);
      const { data, error } = await supabase.rpc("create_server_invite", { _server_id: serverId, _max_uses: null, _expires_in_seconds: 7 * 24 * 3600 });
      setBusy(false);
      if (error) return toast.error(error.message);
      setCode(data as string);
    })();
  }, [serverId]);

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success("Code copied");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl overflow-hidden" style={{ backgroundColor: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b" style={{ borderColor: "var(--app-border)" }}>
          <h3 className="text-base font-semibold" style={{ color: "var(--app-text-primary)" }}>Invite friends</h3>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>Share this code. It expires in 7 days.</p>
          <div className="flex items-center gap-2 rounded-md p-3" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
            <div className="flex-1 font-mono text-lg tracking-widest" style={{ color: "var(--app-text-primary)" }}>
              {busy ? "…" : code || "—"}
            </div>
            <button onClick={copy} className="rounded p-2" style={{ backgroundColor: "var(--app-hover)" }}>
              <Copy className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServerView;
