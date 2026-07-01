import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFriends } from "@/hooks/useFriends";
import { useGems } from "@/contexts/GemsContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Search } from "lucide-react";
import gemIcon from "@/assets/gems/gem.png";
import giftIcon from "@/assets/icons/gift.svg";
import { defaultProfileColor } from "@/lib/profileColors";

interface GiftSendModalProps {
  open: boolean;
  onClose: () => void;
  item: { id: string; name: string; description: string | null; category: string; price: number; price_gems: number | null; config?: any } | null;
  onSent?: (item: { id: string; name: string }) => void;
}

/**
 * GiftSendModal — given a preselected shop item, pick a friend to send it to.
  * Gifts are always paid for with gems.
  * Direct shop prices stay single-currency; coin-only items get a gift-only
  * gem price that matches the backend's server-side conversion.
 */
const GiftSendModal = ({ open, onClose, item, onSent }: GiftSendModalProps) => {
  const { user } = useAuth();
  const { friends, loading: friendsLoading } = useFriends();
  const { balance: gemBalance, refreshBalance } = useGems();
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [recipientOwned, setRecipientOwned] = useState<Set<string>>(new Set());
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const giftPriceGems = useMemo(() => {
    if (!item) return 0;
    if (item.config?.gems_only && item.price_gems != null && item.price_gems > 0) return item.price_gems;
    return Math.max(20, Math.ceil(item.price / 10));
  }, [item]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPickedId(null);
      setNote("");
      setRecipientOwned(new Set());
    }
  }, [open]);

  // Preload which of the user's friends already own this item, so we can
  // grey them out and prevent wasted gem spends.
  useEffect(() => {
    if (!open || !item || friends.length === 0) return;
    let alive = true;
    (async () => {
      const ids = friends.map((f) => f.profile.user_id);
      const { data } = await supabase
        .from("user_inventory")
        .select("user_id")
        .eq("item_id", item.id)
        .in("user_id", ids);
      if (!alive) return;
      setRecipientOwned(new Set((data ?? []).map((r: any) => r.user_id)));
    })();
    return () => { alive = false; };
  }, [open, item, friends]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) =>
      (f.profile.display_name || "").toLowerCase().includes(q) ||
      (f.profile.username || "").toLowerCase().includes(q),
    );
  }, [friends, query]);

  const canSend = !!item && !!pickedId && !recipientOwned.has(pickedId) && gemBalance >= giftPriceGems && !sending;

  const handleSend = async () => {
    if (!item || !pickedId) return;
    if (gemBalance < giftPriceGems) {
      toast.error(`Need ${giftPriceGems - gemBalance} more gems`);
      return;
    }
    setSending(true);
    const { error } = await supabase.rpc("gift_shop_item", {
      _recipient_id: pickedId,
      _item_id: item.id,
      _conversation_id: null,
      _message: note.trim() || null,
    });
    setSending(false);
    if (error) {
      const m = error.message || "";
      if (m.includes("INSUFFICIENT_GEMS")) toast.error("Not enough gems");
      else if (m.includes("RECIPIENT_ALREADY_OWNS")) toast.info("They already own this item");
      else if (m.includes("INVALID_RECIPIENT")) toast.error("Can't gift to yourself");
      else toast.error("Couldn't send gift");
      return;
    }
    await refreshBalance?.();
    onSent?.({ id: item.id, name: item.name });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-[var(--app-bg-secondary,#2b2d31)] border-[var(--app-border,#3f4147)]">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-white flex items-center gap-2">
            <img src={giftIcon} alt="" className="h-5 w-5" style={{ filter: "invert(78%) sepia(36%) saturate(2200%) hue-rotate(295deg) brightness(105%) contrast(92%)" }} />
            Send a gift
          </DialogTitle>
          <DialogDescription className="text-[var(--app-text-secondary,#949ba4)]">
            Pick a friend to send <b className="text-white">{item?.name ?? "this item"}</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5">
          <div className="flex items-center justify-between rounded-lg p-3 mb-3" style={{ backgroundColor: "var(--app-bg-tertiary,#1e1f22)", border: "1px solid var(--app-border,#3f4147)" }}>
            <div className="text-[13px] text-white">
              <div className="font-semibold">{item?.name}</div>
              <div className="text-[var(--app-text-secondary,#949ba4)] text-[11px] capitalize">{item?.category?.replace("_", " ")}</div>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-[#60a5fa]">
              <img src={gemIcon} alt="" className="h-5 w-5" />
              <span>{giftPriceGems.toLocaleString()}</span>
            </div>
          </div>

          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--app-text-secondary,#949ba4)]" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends…"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-sm bg-[var(--app-bg-tertiary,#1e1f22)] border border-[var(--app-border,#3f4147)] text-white outline-none focus:border-[#5865f2]"
            />
          </div>
        </div>

        <div className="max-h-[260px] overflow-y-auto px-3">
          {friendsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[var(--app-text-secondary)]" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm py-6 text-[var(--app-text-secondary)]">
              {friends.length === 0 ? "Add a friend first to send gifts." : "No friends match."}
            </div>
          ) : (
            filtered.map((f) => {
              const profile = f.profile;
              const owned = recipientOwned.has(profile.user_id);
              const picked = pickedId === profile.user_id;
              const color = defaultProfileColor;
              return (
                <button
                  key={profile.user_id}
                  onClick={() => !owned && setPickedId(profile.user_id)}
                  disabled={owned}
                  className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${owned ? "opacity-50 cursor-not-allowed" : ""}`}
                  style={{ backgroundColor: picked ? "var(--app-active,#404249)" : "transparent" }}
                  onMouseEnter={(e) => { if (!picked && !owned) e.currentTarget.style.backgroundColor = "var(--app-hover,#35373c)"; }}
                  onMouseLeave={(e) => { if (!picked && !owned) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <div className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: color.bg }}>
                      {(profile.display_name || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{profile.display_name}</div>
                    <div className="text-[11px] text-[var(--app-text-secondary,#949ba4)] truncate">
                      {owned ? "Already owns this" : `@${profile.username}`}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {pickedId && (
          <div className="px-5 pt-3">
            <input
              type="text"
              value={note}
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)…"
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--app-bg-tertiary,#1e1f22)] border border-[var(--app-border,#3f4147)] text-white outline-none focus:border-[#5865f2]"
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-4 mt-2 border-t border-[var(--app-border,#3f4147)]">
          <div className="text-[12px] text-[var(--app-text-secondary,#949ba4)] flex items-center gap-1">
            <img src={gemIcon} alt="" className="h-4 w-4" />
            <span>Balance: <b className="text-white">{gemBalance.toLocaleString()}</b></span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md text-[var(--app-text-secondary,#949ba4)] hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="px-4 py-1.5 text-sm font-bold rounded-md text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: canSend ? "#ec4899" : "var(--app-bg-tertiary,#1e1f22)" }}
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" />}
              Send Gift
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GiftSendModal;
