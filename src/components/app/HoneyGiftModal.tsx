import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGems } from "@/contexts/GemsContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, CreditCard, Sparkles } from "lucide-react";
import gemIcon from "@/assets/gems/gem.png";
import honeyBadge from "@/assets/badges/honey.png";

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  recipientName: string;
}

type Tier = "basic" | "honey";
type Interval = "month" | "year";
type Pay = "gems" | "card";

const GEMS_PRICE: Record<Tier, Record<Interval, number>> = {
  basic: { month: 800, year: 8500 },
  honey: { month: 2200, year: 21000 },
};
const USD_PRICE: Record<Tier, Record<Interval, string>> = {
  basic: { month: "$2.99", year: "$35.88" },
  honey: { month: "$7.99", year: "$76.70" },
};
const TIER_LABEL: Record<Tier, string> = {
  basic: "Cubbly Honey Basic",
  honey: "Cubbly Honey",
};

const HoneyGiftModal = ({ open, onClose, conversationId, recipientName }: Props) => {
  const { balance } = useGems();
  const [tier, setTier] = useState<Tier>("honey");
  const [interval, setIntervalState] = useState<Interval>("month");
  const [pay, setPay] = useState<Pay>("gems");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const gemsCost = GEMS_PRICE[tier][interval];
  const usd = USD_PRICE[tier][interval];
  const canAffordGems = balance >= gemsCost;

  const handleSend = async () => {
    setSending(true);
    if (pay === "gems") {
      const { error } = await supabase.rpc("send_honey_gift_gems", {
        _conversation_id: conversationId,
        _tier: tier,
        _interval: interval,
        _message: message.trim() || null,
      });
      setSending(false);
      if (error) {
        const m = error.message || "";
        if (m.includes("INSUFFICIENT_GEMS")) toast.error("Not enough gems");
        else toast.error("Couldn't send the gift");
        return;
      }
      toast.success(`Gift dropped in chat — waiting for ${recipientName} to claim 🍯`);
      onClose();
    } else {
      const { data, error } = await supabase.functions.invoke("stripe-create-honey-gift", {
        body: {
          conversation_id: conversationId,
          tier,
          interval,
          message: message.trim() || null,
        },
      });
      setSending(false);
      if (error || !data?.url) {
        toast.error("Couldn't start checkout");
        return;
      }
      window.location.href = data.url as string;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg rounded-lg border-0 p-0 overflow-hidden shadow-2xl"
        style={{ backgroundColor: "#2b2d31" }}
      >
        <div className="px-5 pt-5 pb-4 border-b flex items-center gap-3"
             style={{ borderColor: "#1f2024", backgroundColor: "#2b2d31" }}>
          <img src={honeyBadge} alt="" className="h-10 w-10" />
          <div className="min-w-0 flex-1">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-white">
                Gift Honey to the chat
              </DialogTitle>
              <DialogDescription className="text-[13px]" style={{ color: "#b5bac1" }}>
                Anyone in this chat can claim it once — first come, first Honey.
              </DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4" style={{ backgroundColor: "#313338" }}>
          {/* Tier */}
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wide mb-1.5" style={{ color: "#b5bac1" }}>Tier</div>
            <div className="grid grid-cols-2 gap-2">
              {(["basic", "honey"] as Tier[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className="rounded-md px-3 py-2.5 text-left transition-colors"
                  style={{
                    backgroundColor: tier === t ? "#404249" : "#1e1f22",
                    border: `1px solid ${tier === t ? "#f59e0b" : "#1f2024"}`,
                  }}
                >
                  <div className="text-[13px] font-bold text-white">{TIER_LABEL[t]}</div>
                  <div className="text-[11px]" style={{ color: "#b5bac1" }}>
                    {t === "honey" ? "Full perks" : "Core perks"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Interval */}
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wide mb-1.5" style={{ color: "#b5bac1" }}>Duration</div>
            <div className="grid grid-cols-2 gap-2">
              {(["month", "year"] as Interval[]).map((i) => (
                <button
                  key={i}
                  onClick={() => setIntervalState(i)}
                  className="rounded-md px-3 py-2 text-left transition-colors"
                  style={{
                    backgroundColor: interval === i ? "#404249" : "#1e1f22",
                    border: `1px solid ${interval === i ? "#f59e0b" : "#1f2024"}`,
                  }}
                >
                  <div className="text-[13px] font-bold text-white">{i === "year" ? "Annual" : "Monthly"}</div>
                  <div className="text-[11px]" style={{ color: "#b5bac1" }}>{USD_PRICE[tier][i]}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Payment */}
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wide mb-1.5" style={{ color: "#b5bac1" }}>Pay with</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPay("gems")}
                className="rounded-md px-3 py-2.5 flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: pay === "gems" ? "#404249" : "#1e1f22",
                  border: `1px solid ${pay === "gems" ? "#f59e0b" : "#1f2024"}`,
                }}
              >
                <img src={gemIcon} alt="" className="h-6 w-6" />
                <div className="text-left">
                  <div className="text-[13px] font-bold text-white">Gems</div>
                  <div className="text-[11px] tabular-nums" style={{ color: canAffordGems ? "#b5bac1" : "#f87171" }}>
                    {gemsCost.toLocaleString()} gems
                  </div>
                </div>
              </button>
              <button
                onClick={() => setPay("card")}
                className="rounded-md px-3 py-2.5 flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: pay === "card" ? "#404249" : "#1e1f22",
                  border: `1px solid ${pay === "card" ? "#f59e0b" : "#1f2024"}`,
                }}
              >
                <CreditCard className="h-6 w-6 text-white" />
                <div className="text-left">
                  <div className="text-[13px] font-bold text-white">Card</div>
                  <div className="text-[11px]" style={{ color: "#b5bac1" }}>{usd} via Stripe</div>
                </div>
              </button>
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="text-[10px] uppercase font-bold tracking-wide block mb-1.5" style={{ color: "#b5bac1" }}>
              Add a note (optional)
            </label>
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={140}
              placeholder="Say something sweet…"
              className="w-full rounded-md px-3 py-2 text-sm text-white outline-none focus:ring-2"
              style={{ backgroundColor: "#1e1f22", border: "1px solid #1f2024" }}
            />
          </div>
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-between gap-3"
             style={{ borderColor: "#1f2024", backgroundColor: "#2b2d31" }}>
          <div className="text-[11px]" style={{ color: "#949ba4" }}>
            Balance: <span className="text-white tabular-nums font-bold">{balance.toLocaleString()}</span>
            <img src={gemIcon} alt="" className="inline-block h-3.5 w-3.5 ml-1 -mt-0.5" />
          </div>
          <button
            onClick={handleSend}
            disabled={sending || (pay === "gems" && !canAffordGems)}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: pay === "gems" && !canAffordGems ? "#4e5058" : "#5865f2" }}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {pay === "gems" ? `Send for ${gemsCost.toLocaleString()} gems` : `Pay ${usd} & send`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default HoneyGiftModal;
