import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Reply, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import copyIcon from "@/assets/icons/copy.svg";
import { QUICK_REACTIONS } from "@/hooks/useMessageReactions";

interface MessageContextMenuProps {
  children: React.ReactNode;
  messageId: string;
  messageContent: string;
  isOwnMessage: boolean;
  onReply?: () => void;
  onReact?: (emoji: string) => void;
}

const MessageContextMenu = ({ children, messageId, messageContent, isOwnMessage, onReply, onReact }: MessageContextMenuProps) => {
  const handleCopy = () => {
    const clean = messageContent.replace(/\[attachments\].*?\[\/attachments\]/s, "").trim();
    navigator.clipboard.writeText(clean);
    toast.success("Message copied!");
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) toast.error("Failed to delete message");
    else toast.success("Message deleted");
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="w-56 rounded-xl border p-1.5 shadow-xl"
        style={{ backgroundColor: "#111214", borderColor: "#2b2d31" }}
      >
        {/* Quick emoji slider */}
        <div className="flex items-center gap-0.5 px-1 py-1">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onReact?.(e)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-white/10"
            >
              {e}
            </button>
          ))}
        </div>
        <ContextMenuSeparator className="my-1 bg-[#2b2d31]" />
        <ContextMenuItem
          onClick={onReply}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <Reply className="h-4 w-4" />
          Reply
        </ContextMenuItem>
        <ContextMenuItem
          onClick={handleCopy}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <img src={copyIcon} alt="" className="h-4 w-4 invert opacity-80" />
          Copy Text
        </ContextMenuItem>
        {isOwnMessage && (
          <>
            <ContextMenuSeparator className="my-1 bg-[#2b2d31]" />
            <ContextMenuItem
              onClick={handleDelete}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
              Delete Message
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default MessageContextMenu;
