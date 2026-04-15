import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Reply, Smile, Copy, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MessageContextMenuProps {
  children: React.ReactNode;
  messageId: string;
  messageContent: string;
  isOwnMessage: boolean;
  onReply?: () => void;
}

const MessageContextMenu = ({ children, messageId, messageContent, isOwnMessage, onReply }: MessageContextMenuProps) => {
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
        className="w-52 rounded-xl border p-1.5 shadow-xl"
        style={{ backgroundColor: "#111214", borderColor: "#2b2d31" }}
      >
        <ContextMenuItem
          onClick={onReply}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <Reply className="h-4 w-4" />
          Reply
        </ContextMenuItem>
        <ContextMenuItem
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <Smile className="h-4 w-4" />
          Add Reaction
        </ContextMenuItem>
        <ContextMenuItem
          onClick={handleCopy}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <Copy className="h-4 w-4" />
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
