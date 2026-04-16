import { ArrowLeft, Users } from "lucide-react";
import GroupAvatar from "@/components/app/GroupAvatar";
import StatusIndicator from "@/components/app/StatusIndicator";
import callIcon from "@/assets/icons/call.svg";
import callEndIcon from "@/assets/icons/call-end.svg";
import videoIcon from "@/assets/icons/video-camera.svg";

interface Props {
  conversation: any;
  participant?: any;
  participantStatus: string;
  isInCall: boolean;
  onBack: () => void;
  onCall: () => void;
  onVideo?: () => void;
  onShowMembers?: () => void;
}

/** Mobile chat header — compact, with back arrow. Replaces the desktop header on mobile. */
const MobileChatHeader = ({
  conversation,
  participant,
  participantStatus,
  isInCall,
  onBack,
  onCall,
  onVideo,
  onShowMembers,
}: Props) => {
  const title = conversation.is_group
    ? (conversation.name || conversation.members.map((m: any) => m.display_name).slice(0, 3).join(", ") || "Group")
    : participant?.display_name || "Conversation";

  return (
    <div
      className="flex h-14 items-center gap-2 border-b px-2 shadow-sm"
      style={{
        backgroundColor: "var(--app-bg-primary)",
        borderColor: "var(--app-border)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <button
        onClick={onBack}
        className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[var(--app-hover)] touch-manipulation"
        aria-label="Back"
      >
        <ArrowLeft className="h-5 w-5" style={{ color: "var(--app-text-primary)" }} />
      </button>

      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="relative shrink-0">
          <GroupAvatar conversation={conversation} size={32} />
          {!conversation.is_group && (
            <div className="absolute -bottom-0.5 -right-0.5">
              <StatusIndicator status={participantStatus} size="sm" borderColor="var(--app-bg-primary)" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight" style={{ color: "var(--app-text-primary)" }}>{title}</p>
          {conversation.is_group && (
            <p className="text-[11px] leading-tight" style={{ color: "var(--app-text-secondary)" }}>
              {conversation.members.length + 1} members
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!conversation.is_group && (
          <>
            <button
              onClick={onCall}
              className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[var(--app-hover)] touch-manipulation"
              aria-label={isInCall ? "End call" : "Voice call"}
            >
              <img
                src={isInCall ? callEndIcon : callIcon}
                alt=""
                className="h-5 w-5"
                style={{
                  filter: isInCall
                    ? "brightness(0) saturate(100%) invert(29%) sepia(98%) saturate(2052%) hue-rotate(337deg) brightness(95%) contrast(92%)"
                    : "brightness(0) invert(0.7)",
                }}
              />
            </button>
            {onVideo && (
              <button
                onClick={onVideo}
                className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[var(--app-hover)] touch-manipulation"
                aria-label="Video call"
              >
                <img src={videoIcon} alt="" className="h-5 w-5" style={{ filter: "brightness(0) invert(0.7)" }} />
              </button>
            )}
          </>
        )}
        {conversation.is_group && onShowMembers && (
          <button
            onClick={onShowMembers}
            className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[var(--app-hover)] touch-manipulation"
            aria-label="Members"
          >
            <Users className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />
          </button>
        )}
      </div>
    </div>
  );
};

export default MobileChatHeader;
