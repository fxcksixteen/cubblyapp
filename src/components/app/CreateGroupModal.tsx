import { useState, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFriends } from "@/hooks/useFriends";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getProfileColor } from "@/lib/profileColors";
import { Check, Search, Users, Image as ImageIcon, X } from "lucide-react";
import { toast } from "sonner";

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  createGroupConversation: (memberIds: string[], name: string) => Promise<string | null>;
}

const CreateGroupModal = ({ isOpen, onClose, onCreated, createGroupConversation }: CreateGroupModalProps) => {
  const { user } = useAuth();
  const { friends } = useFriends();
  const [step, setStep] = useState<"select" | "details">("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState("");
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.profile.display_name.toLowerCase().includes(q) ||
        f.profile.username.toLowerCase().includes(q),
    );
  }, [friends, search]);

  const reset = () => {
    setStep("select");
    setSelectedIds(new Set());
    setSearch("");
    setGroupName("");
    setPictureFile(null);
    setPicturePreview(null);
    setCreating(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handlePictureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }
    setPictureFile(file);
    const reader = new FileReader();
    reader.onload = () => setPicturePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleCreate = async () => {
    if (!user) return;
    if (selectedIds.size === 0) {
      toast.error("Pick at least one friend to start a group");
      return;
    }
    setCreating(true);

    const finalName =
      groupName.trim() ||
      // Auto-name: "You, A, B and N more"
      (() => {
        const selectedFriends = friends.filter((f) => selectedIds.has(f.profile.user_id));
        const names = selectedFriends.slice(0, 3).map((f) => f.profile.display_name);
        const extra = selectedFriends.length - names.length;
        return extra > 0 ? `${names.join(", ")} and ${extra} more` : names.join(", ");
      })();

    const memberIds = Array.from(selectedIds);
    const convId = await createGroupConversation(memberIds, finalName);

    if (!convId) {
      toast.error("Failed to create group");
      setCreating(false);
      return;
    }

    // Upload picture if provided
    if (pictureFile) {
      const ext = pictureFile.name.split(".").pop() || "png";
      const path = `${convId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("group-pictures")
        .upload(path, pictureFile, { upsert: true });
      if (!uploadError) {
        const { data: pub } = supabase.storage.from("group-pictures").getPublicUrl(path);
        if (pub?.publicUrl) {
          await supabase.from("conversations").update({ picture_url: pub.publicUrl }).eq("id", convId);
        }
      }
    }

    toast.success("Group created!");
    onCreated(convId);
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-[440px] p-0 gap-0 border-0 overflow-hidden"
        style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-white text-lg font-bold">
            {step === "select" ? "Create Group Chat" : "Customize your group"}
          </DialogTitle>
          <DialogDescription className="text-[13px]" style={{ color: "var(--app-text-secondary, #b5bac1)" }}>
            {step === "select"
              ? "Pick friends to add. You can also skip and just name a group."
              : "Optionally add a name and picture. We'll auto-name it if you skip."}
          </DialogDescription>
        </DialogHeader>

        {step === "select" ? (
          <>
            {/* Search */}
            <div className="px-5 pb-3">
              <div
                className="flex items-center gap-2 rounded-md px-3 py-2"
                style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}
              >
                <Search className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
                <input
                  autoFocus
                  type="text"
                  placeholder="Type the username of a friend"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-[#6d6f78]"
                  style={{ color: "var(--app-text-primary)" }}
                />
              </div>
            </div>

            {/* Friend list */}
            <div className="max-h-[320px] overflow-y-auto px-2 pb-2">
              {filteredFriends.length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="mx-auto h-12 w-12 opacity-30 mb-2" style={{ color: "var(--app-text-secondary)" }} />
                  <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
                    {friends.length === 0 ? "Add some friends first!" : "No friends match your search."}
                  </p>
                </div>
              ) : (
                filteredFriends.map((f) => {
                  const checked = selectedIds.has(f.profile.user_id);
                  const color = getProfileColor(f.profile.user_id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => toggleSelect(f.profile.user_id)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 transition-colors"
                      style={{
                        backgroundColor: checked ? "rgba(88, 101, 242, 0.15)" : undefined,
                      }}
                      onMouseEnter={(e) => {
                        if (!checked) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)";
                      }}
                      onMouseLeave={(e) => {
                        if (!checked) e.currentTarget.style.backgroundColor = "";
                      }}
                    >
                      {f.profile.avatar_url ? (
                        <img src={f.profile.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                          style={{ backgroundColor: color.bg }}
                        >
                          {f.profile.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{f.profile.display_name}</p>
                        <p className="truncate text-xs" style={{ color: "var(--app-text-secondary)" }}>
                          {f.profile.username}
                        </p>
                      </div>
                      <div
                        className="flex h-5 w-5 items-center justify-center rounded border-2 transition-all"
                        style={{
                          borderColor: checked ? "#5865f2" : "var(--app-border, #4e5058)",
                          backgroundColor: checked ? "#5865f2" : "transparent",
                        }}
                      >
                        {checked && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between px-5 py-3 border-t"
              style={{ borderColor: "var(--app-border, #1e1f22)" }}
            >
              <span className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClose}
                  className="rounded px-4 py-2 text-sm font-medium transition-colors"
                  style={{ color: "var(--app-text-secondary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep("details")}
                  disabled={selectedIds.size === 0}
                  className="rounded bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="px-5 pb-4 space-y-4">
              {/* Picture upload */}
              <div className="flex justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="relative h-20 w-20 rounded-full overflow-hidden flex items-center justify-center transition-all hover:opacity-80"
                  style={{
                    backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
                    border: "2px dashed var(--app-border, #4e5058)",
                  }}
                >
                  {picturePreview ? (
                    <img src={picturePreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-8 w-8" style={{ color: "var(--app-text-secondary)" }} />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePictureSelect}
                />
              </div>
              {picturePreview && (
                <button
                  onClick={() => {
                    setPictureFile(null);
                    setPicturePreview(null);
                  }}
                  className="mx-auto flex items-center gap-1 text-xs text-[#ed4245] hover:underline"
                >
                  <X className="h-3 w-3" /> Remove picture
                </button>
              )}

              {/* Name input */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide mb-2 block" style={{ color: "var(--app-text-secondary)" }}>
                  Group Name (Optional)
                </label>
                <Input
                  autoFocus
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Will auto-generate from members if blank"
                  maxLength={50}
                  className="border-0 text-white"
                  style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)" }}
                />
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
                  {selectedIds.size + 1} member{selectedIds.size !== 0 ? "s" : ""} (you + {selectedIds.size} friend{selectedIds.size !== 1 ? "s" : ""})
                </p>
              </div>
            </div>

            <div
              className="flex items-center justify-between px-5 py-3 border-t"
              style={{ borderColor: "var(--app-border, #1e1f22)" }}
            >
              <button
                onClick={() => setStep("select")}
                className="rounded px-4 py-2 text-sm font-medium transition-colors"
                style={{ color: "var(--app-text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
              >
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Group"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CreateGroupModal;
