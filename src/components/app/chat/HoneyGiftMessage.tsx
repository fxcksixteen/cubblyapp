import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import honeyBadge from "@/assets/badges/honey.png";

const MARKER = "[[cubbly:honey-gift:v1]]";

export interface HoneyGiftPayload {
  giftId: string;
  tier: "basic" | "honey";
  interval: "month" | "year";
  message?: string | null;
}

export function parseHoneyGift(text: string): HoneyGiftPayload | null {
  if (!text || !text.startsWith(MARKER)) return null;
  try {
    const raw = text.slice(MARKER.length);
    const p = JSON.parse(raw);
    if (!p?.giftId || !p?.tier || !p?.interval) return null;
    return p as HoneyGiftPayload;
  } catch {
    return null;
  }
}

const TIER_LABEL: Record<HoneyGiftPayload["tier"], string> = {
  basic: "Cubbly Honey Basic",
  honey: "Cubbly Honey",
};

interface Props {
  payload: HoneyGiftPayload;
  isOwn: boolean;
}

interface GiftRow {
  status: "pending" | "claimed" | "refunded" | "canceled";
  claimed_by: string | null;
  claimed_at: string | null;
  sender_id: string;
  message: string | null;
}

const HoneyGiftMessage = ({ payload, isOwn }: Props) => {
  const { user } = useAuth();
  const [row, setRow] = useState<GiftRow | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimerName, setClaimerName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("honey_gifts")
        .select("status, claimed_by, claimed_at, sender_id, message")
        .eq("id", payload.giftId)
        .maybeSingle();
      if (alive) setRow((data as GiftRow) ?? null);
    })();
    const ch = supabase
      .channel(`honey-gift-${payload.giftId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "honey_gifts", filter: `id=eq.${payload.giftId}` },
        (p) => setRow(p.new as GiftRow),
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [payload.giftId]);

  useEffect(() => {
    if (!row?.claimed_by) return setClaimerName(null);
    let alive = true;
    supabase
      .from("profiles")
      .select("display_name, username")
      .eq("user_id", row.claimed_by)
      .maybeSingle()
      .then(({ data }) => {
        if (alive && data) setClaimerName((data as any).display_name || (data as any).username);
      });
    return () => {
      alive = false;
    };
  }, [row?.claimed_by]);

  const state = row?.status ?? "pending";
  const isClaimedByMe = row?.claimed_by && user?.id === row.claimed_by;
  const canClaim = state === "pending" && !isOwn;

  const durationLabel = payload.interval === "year" ? "1 year" : "1 month";

  const handleClaim = async () => {
    setClaiming(true);
    const { error } = await supabase.rpc("claim_honey_gift", { _gift_id: payload.giftId });
    setClaiming(false);
    if (error) {
      const m = error.message || "";
      if (m.includes("ALREADY_CLAIMED")) toast.info("Someone else already claimed this gift");
      else if (m.includes("CANT_CLAIM_OWN_GIFT")) toast.info("You can't claim your own gift");
      else toast.error("Couldn't claim gift");
      return;
    }
    toast.success(`Honey activated — enjoy your ${durationLabel} of ${TIER_LABEL[payload.tier]}! ✨`);
  };

  const gradient = useMemo(
    () =>
      payload.tier === "honey"
        ? "linear-gradient(135deg,#f59e0b 0%,#fbbf24 30%,#fde68a 55%,#fbbf24 80%,#d97706 100%)"
        : "linear-gradient(135deg,#f59e0b 0%,#fcd34d 45%,#fef3c7 70%,#fcd34d 100%)",
    [payload.tier],
  );

  return (
    <div
      className="relative w-full max-w-[380px] rounded-2xl overflow-hidden shadow-lg"
      style={{ background: gradient, border: "1px solid rgba(180,120,20,0.35)" }}
    >
      {/* Shimmer sweep */}
      <div className="absolute inset-0 pointer-events-none opacity-40"
           style={{
             background:
               "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
             backgroundSize: "200% 100%",
             animation: "honeyGiftShine 5s linear infinite",
           }} />
      <style>{`@keyframes honeyGiftShine{0%{background-position:200% 0}100%{background-position:-100% 0}}`}</style>

      <div className="relative px-4 py-4 flex items-start gap-3">
        <img
          src={honeyBadge}
          alt=""
          className="h-14 w-14 shrink-0 drop-shadow-md"
          style={{ filter: "drop-shadow(0 2px 6px rgba(120,60,0,0.35))" }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-amber-950/80 flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> A gift of Honey
          </div>
          <div className="text-[17px] font-black text-amber-950 leading-tight mt-0.5">
            {TIER_LABEL[payload.tier]}
          </div>
          <div className="text-[12px] font-semibold text-amber-950/85 mt-0.5">
            {durationLabel} on the house
          </div>
          {row?.message && (
            <div className="mt-2 text-[13px] italic text-amber-950/90 leading-snug">
              "{row.message}"
            </div>
          )}
        </div>
      </div>

      <div className="relative px-4 pb-4">
        {state === "pending" ? (
          isOwn ? (
            <div className="rounded-md bg-amber-950/15 text-amber-950 text-[12px] font-semibold px-3 py-2 text-center">
              Waiting for someone to claim…
            </div>
          ) : (
            <button
              onClick={handleClaim}
              disabled={claiming || !canClaim}
              className="w-full rounded-md bg-amber-950 text-amber-100 font-extrabold text-[14px] py-2.5 flex items-center justify-center gap-2 hover:bg-amber-900 transition-colors disabled:opacity-60"
            >
              {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Claim your Honey
            </button>
          )
        ) : (
          <div className="rounded-md bg-amber-950/20 text-amber-950 text-[12px] font-bold px-3 py-2 text-center">
            {isClaimedByMe
              ? `Claimed by you · Enjoy ${durationLabel} of Honey ✨`
              : claimerName
                ? `Claimed by ${claimerName}`
                : "Already claimed"}
          </div>
        )}
      </div>
    </div>
  );
};

export default HoneyGiftMessage;
