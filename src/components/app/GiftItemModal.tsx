import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGems } from "@/contexts/GemsContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Heart } from "lucide-react";
import gemIcon from "@/assets/gems/gem.png";

interface GiftItemModalProps {
  open: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  conversationId?: string | null;
}

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  price_gems: number | null;
}

/**
 * GiftItemModal — pick a gem-priced shop item to send to another user.
 * The recipient's public wishlist (when shared) is surfaced at the top so
 * the gifter knows exactly what they want.
 */
const GiftItemModal = ({ open, onClose, recipientId, recipientName, conversationId }: GiftItemModalProps) => {
  const { balance } = useGems();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [ownedByRecipient, setOwnedByRecipient] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: catalog }, { data: wish }, { data: inv }] = await Promise.all([
        supabase
          .from("shop_items")
          .select("id, name, description, category, price_gems")
          .eq("is_active", true)
          .not("price_gems", "is", null)
          .order("price_gems", { ascending: true }),
        supabase.from("wishlist_items").select("item_id").eq("user_id", recipientId),
        supabase.from("user_inventory").select("item_id").eq("user_id", recipientId),
      ]);
      if (!alive) return;
      setItems((catalog as ShopItem[]) ?? []);
      setWishlist(new Set((wish ?? []).map((r: any) => r.item_id)));
      setOwnedByRecipient(new Set((inv ?? []).map((r: any) => r.item_id)));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, recipientId]);

  const giftable = useMemo(() => items.filter((i) => !ownedByRecipient.has(i.id)), [items, ownedByRecipient]);
  const wishedFirst = useMemo(() => {
    const w: ShopItem[] = [];
    const rest: ShopItem[] = [];
    for (const it of giftable) (wishlist.has(it.id) ? w : rest).push(it);
    return [...w, ...rest];
  }, [giftable, wishlist]);

  const sendGift = async (item: ShopItem) => {
    if (!item.price_gems) return;
    if (balance < item.price_gems) {
      toast.error("Not enough gems — top up first");
      return;
    }
    setSending(item.id);
    const { error } = await supabase.rpc("gift_shop_item", {
      _recipient_id: recipientId,
      _item_id: item.id,
      _conversation_id: conversationId ?? null,
      _message: message.trim() || null,
    });
    setSending(null);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("RECIPIENT_ALREADY_OWNS")) toast.info(`${recipientName} already owns this`);
      else if (msg.includes("INSUFFICIENT_GEMS")) toast.error("Not enough gems");
      else toast.error("Couldn't send gift");
      return;
    }
    toast.success(`Sent ${item.name} to ${recipientName} 💝`);
    onClose();
    setMessage("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg rounded-lg border-0 p-0 overflow-hidden shadow-2xl"
        style={{ backgroundColor: "#2b2d31" }}
      >
        {/* Solid Discord-style header */}
        <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: "#1f2024", backgroundColor: "#2b2d31" }}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white">
              Send a gift to {recipientName}
            </DialogTitle>
            <DialogDescription className="text-[13px]" style={{ color: "#b5bac1" }}>
              Pick something from the shop — paid with gems, delivered instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex items-center gap-2 rounded-md px-3 py-2" style={{ backgroundColor: "#1e1f22" }}>
            <img src={gemIcon} alt="" className="h-7 w-7" />
            <div className="flex flex-col leading-tight">
              <span className="text-[10px] uppercase font-bold tracking-wide" style={{ color: "#949ba4" }}>Your balance</span>
              <span className="text-[15px] font-extrabold tabular-nums text-white">{balance.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="px-5 pt-4" style={{ backgroundColor: "#313338" }}>
          <label className="text-[10px] uppercase font-bold tracking-wide block mb-1.5" style={{ color: "#b5bac1" }}>
            Add a note (optional)
          </label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={140}
            placeholder="Say something nice…"
            className="w-full rounded-md px-3 py-2 text-sm text-white outline-none focus:ring-2"
            style={{ backgroundColor: "#1e1f22", border: "1px solid #1f2024" }}
          />
        </div>

        <div className="px-3 pb-3 pt-3 max-h-[55vh] overflow-y-auto" style={{ backgroundColor: "#313338" }}>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : wishedFirst.length === 0 ? (
            <div className="text-center text-sm py-8" style={{ color: "#b5bac1" }}>
              {recipientName} already owns every giftable item — generous of you!
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {wishedFirst.map((item) => {
                const isWished = wishlist.has(item.id);
                const canAfford = item.price_gems !== null && balance >= item.price_gems;
                const isBusy = sending === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors"
                    style={{ backgroundColor: "transparent" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#35373c")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-[14px] font-semibold text-white truncate">{item.name}</div>
                        {isWished && (
                          <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5"
                                style={{ backgroundColor: "rgba(236,72,153,0.16)", color: "#f472b6" }}>
                            <Heart className="h-2.5 w-2.5" fill="currentColor" /> Wished
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <div className="text-[12px] line-clamp-1 mt-0.5" style={{ color: "#b5bac1" }}>{item.description}</div>
                      )}
                    </div>
                    <button
                      onClick={() => sendGift(item)}
                      disabled={!canAfford || isBusy}
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      style={{ backgroundColor: canAfford ? "#5865f2" : "#4e5058" }}
                      onMouseEnter={(e) => { if (canAfford && !isBusy) e.currentTarget.style.backgroundColor = "#4752c4"; }}
                      onMouseLeave={(e) => { if (canAfford && !isBusy) e.currentTarget.style.backgroundColor = "#5865f2"; }}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <img src={gemIcon} alt="" className="h-5 w-5" />}
                      <span className="tabular-nums">{item.price_gems?.toLocaleString()}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GiftItemModal;

