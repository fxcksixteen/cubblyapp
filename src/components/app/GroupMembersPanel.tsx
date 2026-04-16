import { useState } from "react";
import { Conversation } from "@/hooks/useConversations";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getProfileColor } from "@/lib/profileColors";
import { getEffectivePresenceStatus } from "@/lib/presence";
import StatusIndicator from "./StatusIndicator";
import GroupAvatar from "./GroupAvatar";
import { Crown, UserMinus, LogOut, Pencil, Image as ImageIcon, Check, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface GroupMembersPanelProps {
  conversation: Conversation;
  onClose: () => void;
  onLeftGroup: () => void;
}

const GroupMembersPanel = ({ conversation, onClose, onLeftGroup }: GroupMembersPanelProps) => {
  const { user, onlineUserIds } = useAuth();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(conversation.name || "");
  const [savingName, setSavingName] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const [uploadingPic, setUploadingPic] = useState(false);

  const isOwner = user?.id === conversation.owner_id;

  const handleSaveName = async () => {
    if (!nameDraft.trim() || nameDraft.trim() === conversation.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    const { error } = await supabase
      .from("conversations")
      .update({ name: nameDraft.trim() })
      .eq("id", conversation.id);
    setSavingName(false);
    if (error) {
      toast.error("Failed to rename group");
      return;
    }
    toast.success("Group renamed");
    setEditingName(false);
  };

  const handlePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }
    setUploadingPic(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${conversation.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("group-pictures").upload(path, file, { upsert: true });
    if (uploadError) {
      toast.error("Failed to upload picture");
      setUploadingPic(false);
      return;
    }
    const { data: pub } = supabase.storage.from("group-pictures").getPublicUrl(path);
    if (pub?.publicUrl) {
      await supabase.from("conversations").update({ picture_url: pub.publicUrl }).eq("id", conversation.id);
      toast.success("Group picture updated");
    }
    setUploadingPic(false);
  };

  const handleLeave = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to leave group");
      return;
    }
    toast.success("You left the group");
    setConfirmLeave(false);
    onLeftGroup();
  };

  const handleKick = async (memberUserId: string) => {
    const { error } = await supabase
      .from("conversation_participants")
      .delete()
      .eq("conversation_id", conversation.id)
      .eq("user_id", memberUserId);
    if (error) {
      toast.error("Failed to remove member");
      return;
    }
    toast.success("Member removed");
    setConfirmKick(null);
  };

  // Build full members list including current user
  const allMembers = [
    ...(user
      ? [
          {
            user_id: user.id,
            display_name: user.user_metadata?.display_name || "You",
            username: user.user_metadata?.username || "you",
            avatar_url: null as string | null,
            status: "online",
            isYou: true,
          },
        ]
      : []),
    ...conversation.members.map((m) => ({ ...m, isYou: false })),
  ];

  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-l overflow-y-auto"
      style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)", borderColor: "var(--app-border, #1e1f22)" }}
    >
      {/* Header with picture & name */}
      <div className="px-4 pt-5 pb-4 flex flex-col items-center text-center border-b" style={{ borderColor: "var(--app-border, #1e1f22)" }}>
        <div className="relative group">
          <GroupAvatar conversation={conversation} size={64} />
          {isOwner && (
            <label
              className="absolute inset-0 flex items-center justify-center rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
              title="Change picture"
            >
              <ImageIcon className="h-5 w-5 text-white" />
              <input type="file" accept="image/*" className="hidden" onChange={handlePictureUpload} disabled={uploadingPic} />
            </label>
          )}
        </div>

        <div className="mt-3 w-full">
          {editingName ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                maxLength={50}
                className="flex-1 rounded px-2 py-1 text-sm bg-[#1e1f22] text-white outline-none border border-[#5865f2]"
              />
              <button onClick={handleSaveName} disabled={savingName} className="p-1 rounded hover:bg-[#35373c]" title="Save">
                <Check className="h-4 w-4 text-[#3ba55c]" />
              </button>
              <button onClick={() => { setEditingName(false); setNameDraft(conversation.name || ""); }} className="p-1 rounded hover:bg-[#35373c]" title="Cancel">
                <X className="h-4 w-4 text-[#ed4245]" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1.5">
              <h3 className="font-bold text-white truncate">
                {conversation.name || conversation.members.map((m) => m.display_name).slice(0, 2).join(", ") || "Group"}
              </h3>
              {isOwner && (
                <button onClick={() => setEditingName(true)} className="opacity-50 hover:opacity-100 transition-opacity" title="Rename group">
                  <Pencil className="h-3 w-3" style={{ color: "var(--app-text-secondary)" }} />
                </button>
              )}
            </div>
          )}
          <p className="mt-1 text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
            {allMembers.length} {allMembers.length === 1 ? "member" : "members"}
          </p>
        </div>
      </div>

      {/* Members list */}
      <div className="flex-1 px-2 py-3">
        <p className="px-2 mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--app-text-secondary)" }}>
          Members — {allMembers.length}
        </p>
        {allMembers.map((m) => {
          const color = getProfileColor(m.user_id);
          const status = m.isYou ? "online" : getEffectivePresenceStatus(m.user_id, m.status, onlineUserIds);
          const memberIsOwner = m.user_id === conversation.owner_id;
          return (
            <div
              key={m.user_id}
              className="group flex items-center gap-2.5 rounded px-2 py-1.5 transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
            >
              <div className="relative shrink-0">
                {m.avatar_url ? (
                  <img src={m.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: color.bg }}
                  >
                    {m.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5">
                  <StatusIndicator status={status} size="sm" borderColor="var(--app-bg-secondary, #2b2d31)" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate text-sm font-medium text-white">
                    {m.display_name}
                    {m.isYou && <span className="ml-1 text-[10px] opacity-60">(you)</span>}
                  </p>
                  {memberIsOwner && <Crown className="h-3 w-3 shrink-0" style={{ color: "#faa61a" }} />}
                </div>
              </div>
              {isOwner && !m.isYou && (
                <button
                  onClick={() => setConfirmKick(m.user_id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#ed4245]/20 transition-opacity"
                  title="Remove from group"
                >
                  <UserMinus className="h-3.5 w-3.5 text-[#ed4245]" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Leave group */}
      <div className="px-2 py-3 border-t" style={{ borderColor: "var(--app-border, #1e1f22)" }}>
        <button
          onClick={() => setConfirmLeave(true)}
          className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm font-medium text-[#ed4245] transition-colors hover:bg-[#ed4245]/10"
        >
          <LogOut className="h-4 w-4" />
          Leave Group
        </button>
      </div>

      {/* Leave confirmation */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent style={{ backgroundColor: "var(--app-bg-secondary)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Leave this group?</AlertDialogTitle>
            <AlertDialogDescription>
              You won't be able to see new messages or rejoin unless someone re-adds you.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave} className="bg-[#ed4245] hover:bg-[#c93b3e]">
              Leave Group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Kick confirmation */}
      <AlertDialog open={!!confirmKick} onOpenChange={(open) => !open && setConfirmKick(null)}>
        <AlertDialogContent style={{ backgroundColor: "var(--app-bg-secondary)" }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Remove this member?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be removed from the group and won't see new messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmKick && handleKick(confirmKick)}
              className="bg-[#ed4245] hover:bg-[#c93b3e]"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
};

export default GroupMembersPanel;
