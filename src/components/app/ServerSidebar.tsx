import { Plus } from "lucide-react";
import cubblyWordmark from "@/assets/cubbly-wordmark-white.png";
import cubblyLogo from "@/assets/cubbly-logo.png";
import { UnreadInfo } from "@/hooks/useUnreadCounts";
import { getProfileColor } from "@/lib/profileColors";

interface ServerSidebarProps {
  isActive?: boolean;
  onHomeClick: () => void;
  /** Per-conversation unread info (most recent first). Each shown as a stacked pill under the logo. */
  unreadConversations?: { conversationId: string; info: UnreadInfo }[];
  /** Called when a user clicks an unread pill */
  onJumpToConversation?: (conversationId: string) => void;
}

const ServerSidebar = ({
  onHomeClick,
  isActive = false,
  unreadConversations = [],
  onJumpToConversation,
}: ServerSidebarProps) => {
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
          if (!isActive) onHomeClick();
        }}
        className="group relative flex h-14 w-14 items-center justify-center overflow-visible transition-all duration-200 hover:scale-[1.03]"
        aria-current={isActive ? "page" : undefined}
      >
        <div
          className={`absolute -left-4 w-1 rounded-r-full bg-white transition-all duration-200 ${
            isActive ? "h-8 opacity-100" : "h-0 opacity-0 group-hover:h-6 group-hover:opacity-100"
          }`}
        />
        <img
          src={cubblyLogo}
          alt="Home"
          className={`h-14 w-14 object-cover shadow-[0_10px_20px_rgba(0,0,0,0.24)] cubbly-3d-circle transition-all duration-200 ${
            isActive ? "rounded-[16px]" : "rounded-full group-hover:rounded-[20px]"
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

      <div className="mx-auto h-[2px] w-8 rounded-full bg-[#35363c]" />

      <button
        className={`group relative flex h-14 w-14 items-center justify-center text-[#3ba55c] transition-all duration-200 hover:bg-[#3ba55c] hover:text-white cubbly-3d-circle ${
          false ? "rounded-[16px]" : "rounded-full hover:rounded-[20px]"
        }`}
        style={{ backgroundColor: "var(--app-bg-primary)" }}
      >
        <div className="absolute -left-4 w-1 rounded-r-full bg-white transition-all duration-200 h-0 opacity-0 group-hover:h-6 group-hover:opacity-100" />
        <Plus className="h-6 w-6" />
      </button>
    </div>
  );
};

export default ServerSidebar;
