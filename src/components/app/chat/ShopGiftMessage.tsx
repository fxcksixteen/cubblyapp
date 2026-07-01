import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Gift } from "lucide-react";
import gemIcon from "@/assets/gems/gem.png";

const MARKER = "[[cubbly:shop-gift:v1]]";

export interface ShopGiftPayload {
  giftId: string;
  itemId: string;
  itemName: string;
  category: string;
  priceGems: number;
  message?: string | null;
}

export function parseShopGift(text: string): ShopGiftPayload | null {
  if (!text || !text.startsWith(MARKER)) return null;
  try {
    const raw = text.slice(MARKER.length);
    const p = JSON.parse(raw);
    if (!p?.giftId || !p?.itemId || !p?.itemName) return null;
    return p as ShopGiftPayload;
  } catch {
    return null;
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  name_color: "Name Color",
  theme: "Theme",
  badge: "Badge",
};

const CATEGORY_GRADIENT: Record<string, string> = {
  name_color: "linear-gradient(135deg,#4c1d95 0%,#7c3aed 40%,#ec4899 100%)",
  theme: "linear-gradient(135deg,#0f172a 0%,#1e293b 40%,#334155 100%)",
  badge: "linear-gradient(135deg,#0ea5e9 0%,#38bdf8 40%,#a5f3fc 100%)",
};

interface Props {
  payload: ShopGiftPayload;
  isOwn: boolean;
}

interface GiftRow {
  status: "pending" | "claimed" | "refunded" | "canceled";
  recipient_id: string;
  sender_id: string;
  message: string | null;
}

const ShopGiftMessage = ({ payload, isOwn }: Props) => {
  const { user } = useAuth();
  const [row, setRow] = useState<GiftRow | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let alive = true;
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase
        .from("gift_transactions")
        .select("status, recipient_id, sender_id, message")
        .eq("id", payload.giftId)
        .maybeSingle();
      if (!alive) return;
      setRow((data as GiftRow) ?? null);
      ch = supabase
        .channel(`shop-gift-${payload.giftId}-${suffix}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "gift_transactions", filter: `id=eq.${payload.giftId}` },
          (p) => { if (alive) setRow(p.new as GiftRow); },
        )
        .subscribe();
    })();
    return () => {
      alive = false;
      if (ch) supabase.removeChannel(ch);
    };
  }, [payload.giftId]);

  const state = row?.status ?? "pending";
  const isRecipient = !!user && row?.recipient_id === user.id;
  const canClaim = state === "pending" && isRecipient;

  const handleClaim = async () => {
    setClaiming(true);
    const { error } = await supabase.rpc("claim_gift", { _gift_id: payload.giftId });
    setClaiming(false);
    if (error) {
      const m = error.message || "";
      if (m.includes("ALREADY_HANDLED")) toast.info("Already claimed");
      else if (m.includes("NOT_RECIPIENT")) toast.error("This gift isn't for you");
      else toast.error("Couldn't claim gift");
      return;
    }
    toast.success(`${payload.itemName} added to your inventory ✨`);
  };

  const gradient = CATEGORY_GRADIENT[payload.category] ?? CATEGORY_GRADIENT.theme;
  const label = CATEGORY_LABEL[payload.category] ?? "Shop Item";

  return (
    <div
      className="relative w-full max-w-[380px] rounded-2xl overflow-hidden shadow-lg"
      style={{ background: gradient, border: "1px solid rgba(255,255,255,0.15)" }}
    >
      <div className="absolute inset-0 pointer-events-none opacity-40"
           style={{
             background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)",
             backgroundSize: "200% 100%",
             animation: "shopGiftShine 6s linear infinite",
           }} />
      <style>{`@keyframes shopGiftShine{0%{background-position:200% 0}100%{background-position:-100% 0}}`}</style>

      <div className="relative px-4 py-4 flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center ring-1 ring-white/20">
          <Gift className="h-7 w-7 text-white" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-white/80">
            A gift · {label}
          </div>
          <div className="text-[17px] font-black text-white leading-tight mt-0.5 truncate">
            {payload.itemName}
          </div>
          <div className="flex items-center gap-1 text-[12px] font-semibold text-white/90 mt-0.5">
            <img src={gemIcon} alt="" className="h-3.5 w-3.5" />
            <span className="tabular-nums">{payload.priceGems.toLocaleString()}</span>
            <span className="opacity-80">gems paid</span>
          </div>
          {row?.message && (
            <div className="mt-2 text-[13px] italic text-white/90 leading-snug">
              "{row.message}"
            </div>
          )}
        </div>
      </div>

      <div className="relative px-4 pb-4">
        {state === "pending" ? (
          isOwn ? (
            <div className="rounded-md bg-black/25 text-white/90 text-[12px] font-semibold px-3 py-2 text-center">
              Waiting for them to open it…
            </div>
          ) : isRecipient ? (
            <button
              onClick={handleClaim}
              disabled={claiming || !canClaim}
              className="w-full rounded-md bg-white text-slate-900 font-extrabold text-[14px] py-2.5 flex items-center justify-center gap-2 hover:bg-white/90 transition-colors disabled:opacity-60"
            >
              {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              Open your gift
            </button>
          ) : (
            <div className="rounded-md bg-black/25 text-white/80 text-[12px] font-semibold px-3 py-2 text-center">
              Waiting to be opened…
            </div>
          )
        ) : (
          <div className="rounded-md bg-black/30 text-white text-[12px] font-bold px-3 py-2 text-center">
            {isRecipient ? `Added to your inventory ✨` : `Gift opened`}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopGiftMessage;
