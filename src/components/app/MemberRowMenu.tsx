import { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { MessageSquare, UserRound, AtSign, Copy, UserMinus } from "lucide-react";
import { toast } from "sonner";

/**
 * Right-click wrapper used for member rows in the server members panel and
 * the group chat members panel — mirrors the DM sidebar's profile/message
 * options so users get the same expected interactions everywhere.
 *
 * v0.3.21: `canKick` adds an owner-only "Remove from group" action; only
 * pass true when the current user owns the group AND the target row isn't
 * themselves. Servers don't use this prop.
 */
interface Props {
  userId: string;
  displayName: string;
  isYou?: boolean;
  onViewProfile: () => void;
  onMessage?: () => void;
  onMention?: () => void;
  canKick?: boolean;
  onKick?: () => void;
  children: ReactNode;
}

const MemberRowMenu = ({ userId, displayName, isYou, onViewProfile, onMessage, onMention, canKick, onKick, children }: Props) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-52 rounded-xl border p-1.5 shadow-xl"
        style={{ backgroundColor: "#111214", borderColor: "var(--app-border, #2b2d31)" }}
      >
        <ContextMenuItem
          onClick={onViewProfile}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <UserRound className="h-4 w-4" />
          View Profile
        </ContextMenuItem>
        {!isYou && onMessage && (
          <ContextMenuItem
            onClick={onMessage}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" />
            Message
          </ContextMenuItem>
        )}
        {!isYou && onMention && (
          <ContextMenuItem
            onClick={onMention}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
          >
            <AtSign className="h-4 w-4" />
            Mention
          </ContextMenuItem>
        )}
        <ContextMenuSeparator className="my-1" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />
        <ContextMenuItem
          onClick={() => {
            navigator.clipboard.writeText(userId);
            toast.success("User ID copied");
          }}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <Copy className="h-4 w-4" />
          Copy User ID
        </ContextMenuItem>
        {canKick && onKick && (
          <>
            <ContextMenuSeparator className="my-1" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />
            <ContextMenuItem
              onClick={onKick}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white cursor-pointer"
            >
              <UserMinus className="h-4 w-4" />
              Remove from group
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default MemberRowMenu;

