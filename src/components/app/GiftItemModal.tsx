import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGems } from "@/contexts/GemsContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Heart, Search, Check } from "lucide-react";
import gemIcon from "@/assets/gems/gem.png";
import { ShopItemPreview } from "@/components/app/shop/ShopItemPreview";
import { ShopAllIcon, ShopNameColorIcon, ShopThemeIcon, ShopBadgeIcon, ShopWishlistIcon } from "@/components/app/shop/ShopTabIcons";

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
  subcategory: string | null;
  price: number;
  price_gems: number | null;
  config: any;
}

const giftPriceGemsFor = (item: ShopItem) => {
  const gemsOnly = !!item.config?.gems_only;
  if (gemsOnly) return item.price_gems ?? 0;
  return Math.max(20, Math.ceil((item.price || 0) / 10));
};

const TABS = [
  { key: "all", label: "All", Icon: ShopAllIcon },
  { key: "wishlist", label: "Wishlist", Icon: ShopWishlistIcon },
  { key: "name_color", label: "Name colors", Icon: ShopNameColorIcon },
  { key: "theme", label: "Themes", Icon: ShopThemeIcon },
  { key: "badge", label: "Badges", Icon: ShopBadgeIcon },
] as const;

/**
 * GiftItemModal — shop-style grid for picking a gift to send to another user.
 * Items the recipient already owns are shown as disabled "Owned" tiles so the
 * gifter never wastes gems, and wishlisted items are surfaced first.
 */
const GiftItemModal = ({ open, onClose, recipientId, recipientName, conversationId }: GiftItemModalProps) => {
  const { balance } = useGems();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [ownedByRecipient, setOwnedByRecipient] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<string>("all");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: catalog }, { data: wish }, { data: inv }] = await Promise.all([
        supabase
          .from("shop_items")
          .select("id, name, description, category, subcategory, price, price_gems, config")
          .eq("is_active", true)
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true }),
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byGiftPrice = (a: ShopItem, b: ShopItem) => giftPriceGemsFor(a) - giftPriceGemsFor(b);
    const filtered = items.filter((i) => {
      if (tab === "wishlist" && !wishlist.has(i.id)) return false;
      if (tab !== "all" && tab !== "wishlist" && i.category !== tab) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    });
    const wished: ShopItem[] = [];
    const owned: ShopItem[] = [];
    const rest: ShopItem[] = [];
    for (const it of filtered) {
      if (ownedByRecipient.has(it.id)) owned.push(it);
      else if (wishlist.has(it.id)) wished.push(it);
      else rest.push(it);
    }
    return [...wished.sort(byGiftPrice), ...rest.sort(byGiftPrice), ...owned.sort(byGiftPrice)];
  }, [items, wishlist, ownedByRecipient, query, tab]);

  const sendGift = async (item: ShopItem) => {
    if (ownedByRecipient.has(item.id)) {
      toast.info(`${recipientName} already owns this`);
      return;
    }
    const giftPriceGems = giftPriceGemsFor(item);
    if (!giftPriceGems) return;
    if (balance < giftPriceGems) {
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
      if (msg.includes("RECIPIENT_ALREADY_OWNS")) {
        setOwnedByRecipient((prev) => new Set(prev).add(item.id));
        toast.info(`${recipientName} already owns this`);
      } else if (msg.includes("INSUFFICIENT_GEMS")) toast.error("Not enough gems");
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
        className="max-w-3xl rounded-lg border-0 p-0 overflow-hidden shadow-2xl"
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
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-md px-3 py-2" style={{ backgroundColor: "#1e1f22" }}>
              <img src={gemIcon} alt="" className="h-7 w-7" />
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] uppercase font-bold tracking-wide" style={{ color: "#949ba4" }}>Your balance</span>
                <span className="text-[15px] font-extrabold tabular-nums text-white">{balance.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-1 min-w-[180px] items-center gap-2 rounded-md px-3 py-2" style={{ backgroundColor: "#1e1f22" }}>
              <Search className="h-4 w-4 shrink-0" style={{ color: "#949ba4" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the shop…"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-[#72767d]"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
                style={{
                  backgroundColor: tab === key ? "#404249" : "#1e1f22",
                  color: tab === key ? "#ffffff" : "#b5bac1",
                }}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
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

        <div className="px-4 pb-4 pt-3 max-h-[55vh] overflow-y-auto" style={{ backgroundColor: "#313338" }}>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center text-sm py-8" style={{ color: "#b5bac1" }}>
              Nothing here — try another category or search.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {visible.map((item) => {
                const isWished = wishlist.has(item.id);
                const isOwned = ownedByRecipient.has(item.id);
                const giftPriceGems = giftPriceGemsFor(item);
                const canAfford = balance >= giftPriceGems;
                const isBusy = sending === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col overflow-hidden rounded-lg border transition-colors"
                    style={{
                      backgroundColor: "#2b2d31",
                      borderColor: isWished && !isOwned ? "rgba(236,72,153,0.45)" : "#1f2024",
                      opacity: isOwned ? 0.55 : 1,
                    }}
                  >
                    <div className="relative">
                      <ShopItemPreview
                        item={{ id: item.id, category: item.category, subcategory: item.subcategory, name: item.name, config: item.config }}
                        displayName={recipientName}
                        sizeClass="h-20 w-full"
                        compact
                      />
                      {isWished && !isOwned && (
                        <span
                          className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                          style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#f472b6" }}
                        >
                          <Heart className="h-2.5 w-2.5" fill="currentColor" /> Wished
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-2.5">
                      <div className="text-[13px] font-semibold text-white truncate">{item.name}</div>
                      {item.description && (
                        <div className="text-[11px] line-clamp-2" style={{ color: "#b5bac1" }}>{item.description}</div>
                      )}
                      <button
                        onClick={() => sendGift(item)}
                        disabled={isOwned || !canAfford || isBusy}
                        className="mt-auto flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-bold text-white disabled:cursor-not-allowed transition-colors"
                        style={{ backgroundColor: isOwned ? "#3f4147" : canAfford ? "#5865f2" : "#4e5058" }}
                      >
                        {isOwned ? (
                          <><Check className="h-4 w-4" /> Owned</>
                        ) : isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <><img src={gemIcon} alt="" className="h-5 w-5" /><span className="tabular-nums">{giftPriceGems.toLocaleString()}</span></>
                        )}
                      </button>
                    </div>
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
