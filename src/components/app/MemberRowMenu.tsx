import { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { MessageSquare, UserRound, AtSign, Copy } from "lucide-react";
import { toast } from "sonner";

/**
 * Right-click wrapper used for member rows in the server members panel and
 * the group chat members panel — mirrors the DM sidebar's profile/message
 * options so users get the same expected interactions everywhere.
 */
interface Props {
  userId: string;
  displayName: string;
  isYou?: boolean;
  onViewProfile: () => void;
  onMessage?: () => void;
  onMention?: () => void;
  children: ReactNode;
}

const MemberRowMenu = ({ userId, displayName, isYou, onViewProfile, onMessage, onMention, children }: Props) => {
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
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default MemberRowMenu;
