import { useState } from "react";
import { useGems } from "@/contexts/GemsContext";
import gemIcon from "@/assets/gems/gem.png";
import giftIcon from "@/assets/icons/gift.svg";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, ShoppingBag, Gift, CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Compact gem balance pill — clicking opens the purchase modal. */
const GemPill = ({ size = "md" }: { size?: "sm" | "md" }) => {
  const { balance, loading } = useGems();
  const [open, setOpen] = useState(false);
  const [buying, setBuying] = useState<number | null>(null);
  const isSm = size === "sm";

  const bundles: { gems: number; price: string; bonus?: string }[] = [
    { gems: 100, price: "$0.99" },
    { gems: 500, price: "$4.99" },
    { gems: 1200, price: "$9.99", bonus: "+20%" },
    { gems: 2500, price: "$19.99", bonus: "+25%" },
    { gems: 6500, price: "$49.99", bonus: "+30%" },
  ];

  const buyBundle = async (gems: number) => {
    setBuying(gems);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-gems-purchase", {
        body: { gems },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("Couldn't open checkout");
    } catch (e: any) {
      toast.error(e?.message || "Checkout failed");
    } finally {
      setBuying(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Buy gems"
        className={`group flex items-center gap-1.5 rounded-full transition-all hover:brightness-110 ${
          isSm ? "px-1.5 py-0.5" : "px-2 py-1"
        }`}
        style={{
          backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
          border: "1px solid var(--app-border, #3f4147)",
        }}
      >
        <img
          src={gemIcon}
          alt=""
          className={`shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform group-hover:scale-110 ${
            isSm ? "h-4 w-4" : "h-5 w-5"
          }`}
        />
        <span
          className={`font-extrabold tabular-nums ${isSm ? "text-[11px]" : "text-[13px]"}`}
          style={{ color: "#60a5fa" }}
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
              background: "linear-gradient(135deg, rgba(96,165,250,0.14), rgba(96,165,250,0.02))",
              borderBottom: "1px solid var(--app-border)",
            }}
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.3)" }}
            >
              <img src={gemIcon} alt="" className="h-10 w-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
            </div>
            <DialogHeader className="space-y-1 text-center sm:text-center">
              <DialogTitle className="text-xl font-bold" style={{ color: "var(--app-text-primary)" }}>
                Cubbly Gems
              </DialogTitle>
              <DialogDescription className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
                The premium currency for gifts &amp; exclusive items
              </DialogDescription>
            </DialogHeader>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tabular-nums" style={{ color: "#60a5fa" }}>
                {loading ? "—" : balance.toLocaleString()}
              </span>
              <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--app-text-secondary)" }}>
                balance
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 px-5 py-4">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--app-text-secondary)" }}>
              Top up
            </div>
            {bundles.map((b) => {
              const isBuying = buying === b.gems;
              return (
                <button
                  key={b.gems}
                  onClick={() => buyBundle(b.gems)}
                  disabled={!!buying}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-60"
                  style={{
                    backgroundColor: "var(--app-bg-tertiary)",
                    border: "1px solid var(--app-border)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--app-bg-tertiary)"; }}
                >
                  <img src={gemIcon} alt="" className="h-9 w-9 shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" style={{ color: "var(--app-text-primary)" }}>
                      {b.gems.toLocaleString()} gems
                      {b.bonus && (
                        <span className="ml-2 text-[10px] font-extrabold rounded-full px-1.5 py-0.5 align-middle"
                              style={{ backgroundColor: "rgba(96,165,250,0.18)", color: "#60a5fa" }}>
                          {b.bonus}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>One-time purchase</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{b.price}</span>
                    {isBuying ? (
                      <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--app-text-secondary)" }} />
                    ) : (
                      <CreditCard className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 px-6 pb-5 pt-1">
            <InfoRow icon={<Gift className="h-4 w-4" />} title="Gift friends" text="Send themes, badges, and name colors straight to a friend's inventory." />
            <InfoRow icon={<ShoppingBag className="h-4 w-4" />} title="Exclusive shop items" text="Some premium items are gem-only and can't be bought with coins." />
            <InfoRow icon={<Sparkles className="h-4 w-4" />} title="Never expire" text="Your gems stay in your account forever — spend them whenever." />
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
      style={{ backgroundColor: "var(--app-bg-tertiary)", color: "#60a5fa" }}
    >
      {icon}
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{title}</div>
      <div className="text-xs leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>{text}</div>
    </div>
  </div>
);

export { giftIcon };
export default GemPill;
