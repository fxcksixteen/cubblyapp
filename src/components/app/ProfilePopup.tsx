import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Copy, Pencil, User, Check } from "lucide-react";
import { toast } from "sonner";
import { getProfileColor } from "@/lib/profileColors";

const statuses = [
  { value: "online", label: "Online", color: "bg-[#3ba55c]", dotClass: "bg-[#3ba55c]" },
  { value: "idle", label: "Idle", color: "bg-[#faa61a]", dotClass: "bg-[#faa61a]" },
  { value: "dnd", label: "Do Not Disturb", color: "bg-[#ed4245]", dotClass: "bg-[#ed4245]" },
  { value: "invisible", label: "Invisible", color: "bg-[#747f8d]", dotClass: "bg-[#747f8d]" },
] as const;

interface ProfilePopupProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
  onOpenSettings: () => void;
}

const ProfilePopup = ({ currentStatus, onStatusChange, onOpenSettings }: ProfilePopupProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();
  const profileColor = getProfileColor(user?.id || "default");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleStatusSelect = async (status: string) => {
    onStatusChange(status);
    if (user) {
      await supabase.from("profiles").update({ status }).eq("user_id", user.id);
    }
  };

  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopied(true);
      toast.success("User ID copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const currentStatusObj = statuses.find(s => s.value === currentStatus) || statuses[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white hover:opacity-80 transition-opacity cursor-pointer"
        style={{ backgroundColor: profileColor.bg }}
      >
        {displayName.charAt(0).toUpperCase()}
        <div className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[var(--app-bg-accent,#232428)] ${currentStatusObj.dotClass}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-[300px] rounded-xl bg-[#111214] shadow-2xl border border-[#2b2d31] z-50 overflow-hidden">
          {/* Banner */}
          <div className="h-[60px]" style={{ background: profileColor.banner }} />

          {/* Avatar */}
          <div className="px-4 -mt-6">
            <div
              className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[4px] border-[#111214] text-lg font-bold text-white"
              style={{ backgroundColor: profileColor.bg }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>

          {/* Info */}
          <div className="px-4 pt-1.5 pb-3">
            <p className="text-lg font-bold text-white">{displayName}</p>
            <p className="text-sm text-[#949ba4]">{username}</p>
          </div>

          <div className="mx-3 h-px bg-[#2b2d31]" />

          {/* Actions */}
          <div className="p-2">
            <p className="px-2 pt-1 pb-1 text-[11px] font-bold uppercase text-[#949ba4]">Status</p>
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => handleStatusSelect(s.value)}
                className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors ${
                  currentStatus === s.value ? "bg-[#404249] text-white" : "text-[#dbdee1] hover:bg-[#35373c]"
                }`}
              >
                <div className={`h-2.5 w-2.5 rounded-full ${s.color}`} />
                {s.label}
              </button>
            ))}

            <div className="my-1.5 h-px bg-[#2b2d31]" />

            <button
              onClick={() => { setOpen(false); onOpenSettings(); }}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-[#dbdee1] hover:bg-[#35373c] transition-colors"
            >
              <Pencil className="h-4 w-4 text-[#949ba4]" />
              Edit Profile
            </button>
            <button
              onClick={handleCopyId}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-[#dbdee1] hover:bg-[#35373c] transition-colors"
            >
              {copied ? <Check className="h-4 w-4 text-[#3ba55c]" /> : <Copy className="h-4 w-4 text-[#949ba4]" />}
              {copied ? "Copied!" : "Copy User ID"}
            </button>
            <button
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm text-[#dbdee1] hover:bg-[#35373c] transition-colors"
            >
              <User className="h-4 w-4 text-[#949ba4]" />
              View Profile
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePopup;
