import { useState } from "react";
import { useCoins } from "@/contexts/CoinsContext";
import coinStack from "@/assets/coins/coin-stack.png";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, ShoppingBag, Gift, MessageSquare } from "lucide-react";

/** Compact coin balance pill — clicking opens an info modal. */
const CoinPill = ({ size = "md" }: { size?: "sm" | "md" }) => {
  const { balance, loading } = useCoins();
  const [open, setOpen] = useState(false);
  const isSm = size === "sm";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="About Cubbly Coins"
        className={`group flex items-center gap-1.5 rounded-full transition-all hover:brightness-110 ${
          isSm ? "px-1.5 py-0.5" : "px-2 py-1"
        }`}
        style={{
          backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
          border: "1px solid var(--app-border, #3f4147)",
        }}
      >
        <img
          src={coinStack}
          alt=""
          className={`shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform group-hover:scale-110 ${
            isSm ? "h-4 w-4" : "h-5 w-5"
          }`}
        />
        <span
          className={`font-extrabold tabular-nums ${isSm ? "text-[11px]" : "text-[13px]"}`}
          style={{ color: "#facc15" }}
        >
          {loading ? "—" : balance.toLocaleString()}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="app-themed max-w-md rounded-2xl border-0 p-0 overflow-hidden"
          style={{ backgroundColor: "var(--app-bg-secondary, #2b2d31)", boxShadow: "0 24px 48px rgba(0,0,0,0.4)" }}
        >
          <div
            className="flex flex-col items-center gap-3 px-6 pt-7 pb-5"
            style={{
              background: "linear-gradient(135deg, rgba(250,204,21,0.12), rgba(250,204,21,0.02))",
              borderBottom: "1px solid var(--app-border)",
            }}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "rgba(250,204,21,0.15)", border: "1px solid rgba(250,204,21,0.3)" }}
            >
              <img src={coinStack} alt="" className="h-9 w-9 drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
            </div>
            <DialogHeader className="space-y-1 text-center sm:text-center">
              <DialogTitle className="text-xl font-bold" style={{ color: "var(--app-text-primary)" }}>
                Cubbly Coins
              </DialogTitle>
              <DialogDescription className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
                Your in-app currency for unlocking goodies
              </DialogDescription>
            </DialogHeader>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tabular-nums" style={{ color: "#facc15" }}>
                {loading ? "—" : balance.toLocaleString()}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--app-text-secondary)" }}>
                balance
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-6 py-5">
            <InfoRow
              icon={<MessageSquare className="h-4 w-4" />}
              title="Earn by chatting"
              text="Stay active in conversations to gradually earn coins over time."
            />
            <InfoRow
              icon={<Gift className="h-4 w-4" />}
              title="Daily rewards"
              text="Open Cubbly each day to collect bonus coins and streak rewards."
            />
            <InfoRow
              icon={<ShoppingBag className="h-4 w-4" />}
              title="Spend in the Shop"
              text="Use coins to buy themes, badges, profile effects and more."
            />
            <InfoRow
              icon={<Sparkles className="h-4 w-4" />}
              title="More ways soon"
              text="New ways to earn and spend coins are coming in future updates."
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const InfoRow = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
  <div className="flex items-start gap-3">
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: "var(--app-bg-tertiary)", color: "#facc15" }}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{title}</div>
      <div className="text-xs leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>{text}</div>
    </div>
  </div>
);

export default CoinPill;
