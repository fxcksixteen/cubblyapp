import { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AtSign } from "lucide-react";
import { toast } from "sonner";
import friendsIcon from "@/assets/icons/friends.svg";
import messagesIcon from "@/assets/icons/messages.svg";
import giftIcon from "@/assets/icons/gift.svg";
import copyIcon from "@/assets/icons/copy.svg";
import removeUserIcon from "@/assets/icons/remove-user.svg";

/**
 * Right-click wrapper used for member rows in the server members panel, the
 * group chat members panel and the friends list — mirrors the DM sidebar's
 * profile/message options so users get the same expected interactions.
 *
 * v0.4.19: uses Cubbly's own SVG icon set instead of Lucide glyphs so the menu
 * matches the rest of the app's iconography.
 */
interface Props {
  userId: string;
  displayName: string;
  isYou?: boolean;
  onViewProfile: () => void;
  onMessage?: () => void;
  onMention?: () => void;
  /** v0.4.0: opens the gem-shop gifting modal targeted at this user. */
  onGift?: () => void;
  canKick?: boolean;
  onKick?: () => void;
  children: ReactNode;
}

const itemClass =
  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer";
const iconClass = "h-4 w-4 shrink-0 invert opacity-80";

const MemberRowMenu = ({ userId, displayName, isYou, onViewProfile, onMessage, onMention, onGift, canKick, onKick, children }: Props) => {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-52 rounded-xl border p-1.5 shadow-xl"
        style={{ backgroundColor: "#111214", borderColor: "var(--app-border, #2b2d31)" }}
      >
        <ContextMenuItem onClick={onViewProfile} className={itemClass}>
          <img src={friendsIcon} alt="" className={iconClass} />
          View Profile
        </ContextMenuItem>
        {!isYou && onMessage && (
          <ContextMenuItem onClick={onMessage} className={itemClass}>
            <img src={messagesIcon} alt="" className={iconClass} />
            Message
          </ContextMenuItem>
        )}
        {!isYou && onMention && (
          <ContextMenuItem onClick={onMention} className={itemClass}>
            <AtSign className="h-4 w-4 shrink-0" />
            Mention
          </ContextMenuItem>
        )}
        {!isYou && onGift && (
          <ContextMenuItem onClick={onGift} className={itemClass}>
            <img src={giftIcon} alt="" className={iconClass} />
            Send a gift
          </ContextMenuItem>
        )}
        <ContextMenuSeparator className="my-1" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />
        <ContextMenuItem
          onClick={() => {
            navigator.clipboard.writeText(userId);
            toast.success("User ID copied");
          }}
          className={itemClass}
        >
          <img src={copyIcon} alt="" className={iconClass} />
          Copy User ID
        </ContextMenuItem>
        {canKick && onKick && (
          <>
            <ContextMenuSeparator className="my-1" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />
            <ContextMenuItem
              onClick={onKick}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white cursor-pointer"
            >
              <img src={removeUserIcon} alt="" className="h-4 w-4 shrink-0 invert opacity-80" />
              Remove from group
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default MemberRowMenu;
