import { Reply, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import copyIcon from "@/assets/icons/copy.svg";
import EmojiReactionPicker from "./EmojiReactionPicker";

interface MessageActionsProps {
  messageId: string;
  messageContent: string;
  isOwnMessage: boolean;
  onReply?: () => void;
  onReact?: (emoji: string) => void;
}

const MessageActions = ({ messageId, messageContent, isOwnMessage, onReply, onReact }: MessageActionsProps) => {
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const clean = messageContent.replace(/\[attachments\].*?\[\/attachments\]/s, "").trim();
    navigator.clipboard.writeText(clean);
    toast.success("Message copied!");
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) toast.error("Failed to delete message");
    else toast.success("Message deleted");
  };

  return (
    <>
      <button
        onClick={onReply}
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        title="Reply"
      >
        <Reply className="h-4 w-4" style={{ color: "var(--app-text-secondary, #949ba4)" }} />
      </button>
      <button
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        title="Add Reaction"
      >
        <img src={emojiReactIcon} alt="React" className="h-4 w-4 invert opacity-60" />
      </button>
      <button
        onClick={handleCopy}
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        title="Copy"
      >
        <img src={copyIcon} alt="Copy" className="h-4 w-4 invert opacity-60" />
      </button>
      {isOwnMessage && (
        <button
          onClick={handleDelete}
          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#ed4245]/20"
          title="Delete"
        >
          <Trash2 className="h-4 w-4 text-[#ed4245]" />
        </button>
      )}
    </>
  );
};

export default MessageActions;
