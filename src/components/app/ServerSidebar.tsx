import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import cubblyWordmark from "@/assets/cubbly-wordmark-white.png";
import cubblyLogo from "@/assets/cubbly-logo.png";
import { UnreadInfo } from "@/hooks/useUnreadCounts";
import { getProfileColor } from "@/lib/profileColors";
import { useServers } from "@/contexts/ServersContext";
import CreateServerModal from "./CreateServerModal";

interface ServerSidebarProps {
  isActive?: boolean;
  onHomeClick: () => void;
  unreadConversations?: { conversationId: string; info: UnreadInfo }[];
  onJumpToConversation?: (conversationId: string) => void;
}

const ServerSidebar = ({
  onHomeClick,
  isActive = false,
  unreadConversations = [],
  onJumpToConversation,
}: ServerSidebarProps) => {
  const { servers } = useServers();
  const navigate = useNavigate();
  const location = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const parts = location.pathname.split("/").filter(Boolean);
  const activeServerId = parts[1] === "server" ? parts[2] : null;
  const homeActive = isActive && parts[1] !== "server";
  return (
    <div
      className="flex w-[84px] flex-shrink-0 flex-col items-center gap-3 py-4 sidebar-tertiary overflow-y-auto"
      style={{ backgroundColor: "var(--app-bg-tertiary)" }}
    >
      <div className="mb-1">
        <img src={cubblyWordmark} alt="Cubbly" className="h-8 w-auto" />
      </div>

      <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

      <button
        onClick={() => {
          // Always leave any server view and return to the DM home.
          if (parts[1] === "server") navigate("/@me");
          if (!homeActive) onHomeClick();
        }}
        className="group relative flex h-14 w-14 items-center justify-center overflow-visible transition-all duration-200 hover:scale-[1.03]"
        aria-current={homeActive ? "page" : undefined}
      >
        <div
          className={`absolute -left-4 w-1 rounded-r-full bg-white transition-all duration-200 ${
            homeActive ? "h-8 opacity-100" : "h-0 opacity-0 group-hover:h-6 group-hover:opacity-100"
          }`}
        />
        <img
          src={cubblyLogo}
          alt="Home"
          className={`h-14 w-14 object-cover shadow-[0_10px_20px_rgba(0,0,0,0.24)] cubbly-3d-circle transition-all duration-200 ${
            homeActive ? "rounded-[16px]" : "rounded-full group-hover:rounded-[20px]"
          }`}
        />
      </button>

      {/* Unread message indicators — stacked under the logo, animated in */}
      {unreadConversations.length > 0 && (
        <div className="flex flex-col items-center gap-2 mt-1">
          {unreadConversations.slice(0, 6).map(({ conversationId, info }) => {
            // For groups, prefer the group's custom picture; otherwise fall back
            // to a neutral group color tile so it never looks like a 1:1 DM.
            const isGroup = !!info.isGroup;
            const senderColor = info.lastSenderId ? getProfileColor(info.lastSenderId) : { bg: "#5865f2" };
            const tileColor = isGroup ? "#5865f2" : senderColor.bg;
            const avatarUrl = isGroup ? (info.groupPictureUrl || null) : (info.lastSenderAvatar || null);
            const initial = isGroup
              ? (info.groupName || "G").charAt(0).toUpperCase()
              : (info.lastSenderName || "?").charAt(0).toUpperCase();
            const tooltip = isGroup
              ? `${info.groupName || "Group"} • ${info.count} new`
              : `${info.lastSenderName || "New message"} • ${info.count} new`;
            return (
              <button
                key={conversationId}
                onClick={() => onJumpToConversation?.(conversationId)}
                className="group relative flex h-12 w-12 items-center justify-center transition-all duration-200 hover:scale-[1.05] animate-fade-in"
                title={tooltip}
              >
                <div className="absolute -left-4 h-6 w-1 rounded-r-full bg-white opacity-100" />
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={tooltip}
                    className="h-12 w-12 rounded-full object-cover transition-all duration-200 group-hover:rounded-[16px]"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white transition-all duration-200 group-hover:rounded-[16px]"
                    style={{ backgroundColor: tileColor }}
                  >
                    {initial}
                  </div>
                )}
                <div
                  className="absolute -bottom-0.5 -right-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#ed4245] px-1.5 text-[11px] font-bold text-white border-2"
                  style={{ borderColor: "var(--app-bg-tertiary)" }}
                >
                  {info.count > 99 ? "99+" : info.count}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Joined servers */}
      {servers.length > 0 && (
        <>
          <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />
          <div className="flex flex-col items-center gap-2">
            {servers.map((s) => {
              const active = activeServerId === s.id;
              const initial = s.name.charAt(0).toUpperCase();
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/@me/server/${s.id}`)}
                  title={s.name}
                  className="group relative flex h-12 w-12 items-center justify-center transition-all duration-200 hover:scale-[1.05]"
                >
                  <div className={`absolute -left-4 w-1 rounded-r-full bg-white transition-all duration-200 ${active ? "h-8 opacity-100" : "h-0 opacity-0 group-hover:h-6 group-hover:opacity-100"}`} />
                  {s.icon_url ? (
                    <img src={s.icon_url} alt={s.name} className={`h-12 w-12 object-cover transition-all duration-200 ${active ? "rounded-[16px]" : "rounded-full group-hover:rounded-[16px]"}`} />
                  ) : (
                    <div
                      className={`flex h-12 w-12 items-center justify-center text-base font-bold text-white transition-all duration-200 ${active ? "rounded-[16px]" : "rounded-full group-hover:rounded-[16px]"}`}
                      style={{ backgroundColor: "var(--app-bg-primary)" }}
                    >
                      {initial}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      <button
        onClick={() => setCreateOpen(true)}
        title="Create or join a server"
        className="group relative flex h-14 w-14 items-center justify-center text-[#3ba55c] transition-all duration-200 hover:bg-[#3ba55c] hover:text-white cubbly-3d-circle rounded-full hover:rounded-[20px]"
        style={{ backgroundColor: "var(--app-bg-primary)" }}
      >
        <div className="absolute -left-4 w-1 rounded-r-full bg-white transition-all duration-200 h-0 opacity-0 group-hover:h-6 group-hover:opacity-100" />
        <Plus className="h-6 w-6" />
      </button>

      <CreateServerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => navigate(`/@me/server/${id}`)}
      />
    </div>
  );
};

export default ServerSidebar;
