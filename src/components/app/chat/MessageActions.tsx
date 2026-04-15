import { useState } from "react";
import { Reply, Smile, Copy, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MessageActionsProps {
  messageId: string;
  messageContent: string;
  isOwnMessage: boolean;
  onReply?: () => void;
}

const MessageActions = ({ messageId, messageContent, isOwnMessage, onReply }: MessageActionsProps) => {
  const [deleting, setDeleting] = useState(false);

  const handleCopy = () => {
    // Strip attachment metadata for copy
    const clean = messageContent.replace(/\[attachments\].*?\[\/attachments\]/s, "").trim();
    navigator.clipboard.writeText(clean);
    toast.success("Message copied!");
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const { error } = await supabase.from("messages").delete().eq("id", messageId);
    if (error) {
      toast.error("Failed to delete message");
      setDeleting(false);
    } else {
      toast.success("Message deleted");
    }
  };

  return (
    <div
      className="absolute -top-3 right-2 flex items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
      style={{ backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" }}
    >
      <button
        onClick={onReply}
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        title="Reply"
      >
        <Reply className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
      </button>
      <button
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        title="Add Reaction"
      >
        <Smile className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
      </button>
      <button
        onClick={handleCopy}
        className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
        title="Copy"
      >
        <Copy className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
      </button>
      {isOwnMessage && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-[#ed4245]/20"
          title="Delete"
        >
          <Trash2 className="h-4 w-4 text-[#ed4245]" />
        </button>
      )}
    </div>
  );
};

export default MessageActions;
