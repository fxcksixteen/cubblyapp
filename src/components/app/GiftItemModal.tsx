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
        className="max-w-lg rounded-2xl border-0 p-0 overflow-hidden"
        style={{ backgroundColor: "var(--app-bg-secondary)" }}
      >
        <div
          className="px-6 pt-6 pb-4"
          style={{
            background: "linear-gradient(135deg, rgba(236,72,153,0.14), rgba(96,165,250,0.05))",
            borderBottom: "1px solid var(--app-border)",
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>
              Send a gift to {recipientName}
            </DialogTitle>
            <DialogDescription style={{ color: "var(--app-text-secondary)" }}>
              Pay with gems — they'll receive it instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--app-text-secondary)" }}>
            <img src={gemIcon} alt="" className="h-4 w-4" />
            <span>Your balance: <span className="font-extrabold tabular-nums" style={{ color: "#60a5fa" }}>{balance.toLocaleString()}</span></span>
          </div>
        </div>

        <div className="px-5 pt-3">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={140}
            placeholder="Add a note (optional)…"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: "var(--app-bg-tertiary)",
              border: "1px solid var(--app-border)",
              color: "var(--app-text-primary)",
            }}
          />
        </div>

        <div className="px-5 py-4 max-h-[55vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm" style={{ color: "var(--app-text-secondary)" }}>
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : wishedFirst.length === 0 ? (
            <div className="text-center text-sm py-8" style={{ color: "var(--app-text-secondary)" }}>
              {recipientName} already owns every giftable item — generous of you!
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {wishedFirst.map((item) => {
                const isWished = wishlist.has(item.id);
                const canAfford = item.price_gems !== null && balance >= item.price_gems;
                const isBusy = sending === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style={{
                      backgroundColor: "var(--app-bg-tertiary)",
                      border: `1px solid ${isWished ? "rgba(236,72,153,0.5)" : "var(--app-border)"}`,
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-bold truncate" style={{ color: "var(--app-text-primary)" }}>{item.name}</div>
                        {isWished && (
                          <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide rounded-full px-1.5 py-0.5"
                                style={{ backgroundColor: "rgba(236,72,153,0.18)", color: "#f472b6" }}>
                            <Heart className="h-2.5 w-2.5" fill="currentColor" /> Wished
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <div className="text-[11px] line-clamp-1" style={{ color: "var(--app-text-secondary)" }}>{item.description}</div>
                      )}
                    </div>
                    <button
                      onClick={() => sendGift(item)}
                      disabled={!canAfford || isBusy}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: canAfford ? "#5865f2" : "var(--app-bg-secondary)",
                        color: "white",
                      }}
                    >
                      <img src={gemIcon} alt="" className="h-4 w-4" />
                      <span>{item.price_gems?.toLocaleString()}</span>
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
