import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Smile, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CustomStatusModalProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (status: { text: string; emoji: string | null; expires_at: string | null } | null) => void;
}

type Duration = "until_cleared" | "30m" | "1h" | "4h" | "today" | "1w";

const DURATIONS: { id: Duration; label: string }[] = [
  { id: "until_cleared", label: "Don't clear" },
  { id: "30m", label: "30 minutes" },
  { id: "1h", label: "1 hour" },
  { id: "4h", label: "4 hours" },
  { id: "today", label: "Today" },
  { id: "1w", label: "This week" },
];

const expiresFor = (d: Duration): string | null => {
  const now = new Date();
  switch (d) {
    case "30m": return new Date(now.getTime() + 30 * 60_000).toISOString();
    case "1h":  return new Date(now.getTime() + 60 * 60_000).toISOString();
    case "4h":  return new Date(now.getTime() + 4 * 60 * 60_000).toISOString();
    case "today": { const end = new Date(now); end.setHours(23, 59, 59, 999); return end.toISOString(); }
    case "1w":  return new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();
    default:    return null;
  }
};

const QUICK_EMOJI = ["😀","🙂","😎","🤔","😴","🎮","💻","📚","🎵","☕","🚀","❤️","🔥","✨","🌙","🍕"];

/**
 * CustomStatusModal — set/clear a per-user custom status that surfaces
 * underneath the user's name on profiles and (later) the sidebar.
 * Writes directly to public.custom_statuses (upsert keyed on user_id).
 */
const CustomStatusModal = ({ open, onClose, onSaved }: CustomStatusModalProps) => {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState<string | null>(null);
  const [duration, setDuration] = useState<Duration>("until_cleared");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    supabase.from("custom_statuses")
      .select("text, emoji")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (data?.text) {
          setText(data.text);
          setEmoji((data as any).emoji ?? null);
          setExisting(true);
        } else {
          setText(""); setEmoji(null); setExisting(false);
        }
        setDuration("until_cleared");
      });
    return () => { alive = false; };
  }, [open, user]);

  const handleSave = async () => {
    if (!user) return;
    const trimmed = text.trim();
    if (!trimmed && !emoji) {
      toast.error("Add some text or pick an emoji");
      return;
    }
    setBusy(true);
    const payload = {
      user_id: user.id,
      text: trimmed,
      emoji,
      expires_at: expiresFor(duration),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("custom_statuses").upsert(payload, { onConflict: "user_id" });
    setBusy(false);
    if (error) { toast.error("Couldn't save status"); return; }
    onSaved?.({ text: trimmed, emoji, expires_at: payload.expires_at });
    onClose();
  };

  const handleClear = async () => {
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("custom_statuses").delete().eq("user_id", user.id);
    setBusy(false);
    if (error) { toast.error("Couldn't clear status"); return; }
    onSaved?.(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-[var(--app-bg-secondary,#2b2d31)] border-[var(--app-border,#3f4147)]">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-white">Set a custom status</DialogTitle>
          <DialogDescription className="text-[var(--app-text-secondary,#949ba4)]">
            Tell people what you're up to. Shows on your profile until cleared or expired.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-2">
          <div className="flex items-stretch gap-2">
            <button
              onClick={() => setEmoji(null)}
              className="w-11 shrink-0 rounded-md text-xl flex items-center justify-center"
              style={{ backgroundColor: "var(--app-bg-tertiary,#1e1f22)", border: "1px solid var(--app-border,#3f4147)", color: "white" }}
              title="Pick an emoji below or clear"
            >
              {emoji ?? <Smile className="h-5 w-5 text-[var(--app-text-secondary,#949ba4)]" />}
            </button>
            <input
              type="text"
              value={text}
              maxLength={128}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's happening?"
              className="flex-1 px-3 py-2 rounded-md text-sm bg-[var(--app-bg-tertiary,#1e1f22)] border border-[var(--app-border,#3f4147)] text-white outline-none focus:border-[#5865f2]"
              autoFocus
            />
          </div>

          <div className="mt-2 grid grid-cols-8 gap-1.5">
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e === emoji ? null : e)}
                className="h-8 rounded text-lg transition-colors"
                style={{
                  backgroundColor: e === emoji ? "var(--app-active,#404249)" : "transparent",
                  border: e === emoji ? "1px solid #5865f2" : "1px solid transparent",
                }}
                onMouseEnter={(ev) => { if (e !== emoji) ev.currentTarget.style.backgroundColor = "var(--app-hover,#35373c)"; }}
                onMouseLeave={(ev) => { if (e !== emoji) ev.currentTarget.style.backgroundColor = "transparent"; }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 pt-3">
          <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5 text-[var(--app-text-secondary,#949ba4)]">
            Clear after
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDuration(d.id)}
                className="px-2 py-1.5 rounded text-xs font-medium transition-colors"
                style={{
                  backgroundColor: duration === d.id ? "var(--app-active,#404249)" : "var(--app-bg-tertiary,#1e1f22)",
                  color: duration === d.id ? "white" : "var(--app-text-secondary,#949ba4)",
                  border: duration === d.id ? "1px solid #5865f2" : "1px solid var(--app-border,#3f4147)",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 mt-3 border-t border-[var(--app-border,#3f4147)]">
          {existing ? (
            <button
              onClick={handleClear}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md text-[#ed4245] hover:bg-[rgba(237,66,69,0.12)]"
            >
              <Trash2 className="h-4 w-4" /> Clear
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md text-[var(--app-text-secondary,#949ba4)] hover:text-white">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              className="px-4 py-1.5 text-sm font-bold rounded-md text-white flex items-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: "#5865f2" }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomStatusModal;
