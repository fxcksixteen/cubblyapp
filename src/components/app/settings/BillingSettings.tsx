import { useEffect, useState } from "react";
import { CreditCard, Sparkles, Gift, Coins, ExternalLink, Loader2, ArrowUpRight, CheckCircle2, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useCoins } from "@/contexts/CoinsContext";
import { useGems } from "@/contexts/GemsContext";
import { toast } from "sonner";
import honeyIcon from "@/assets/icons/honey.svg";
import gemIcon from "@/assets/gems/gem.png";

type Tab = "subscription" | "payment" | "currency" | "gifts";

interface SubscriptionRow {
  tier: string;
  status: string;
  interval: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

interface GemTx {
  id: string;
  amount: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

interface GiftRow {
  id: string;
  gift_type: string;
  status: string;
  sender_id: string;
  recipient_id: string;
  payload: any;
  message: string | null;
  created_at: string;
  claimed_at: string | null;
}

const tabs: { id: Tab; label: string; icon: any }[] = [
  { id: "subscription", label: "Subscription", icon: Sparkles },
  { id: "payment", label: "Payment Methods", icon: CreditCard },
  { id: "currency", label: "Gems & Coins", icon: Coins },
  { id: "gifts", label: "Gifts", icon: Gift },
];

const BillingSettings = () => {
  const { user } = useAuth();
  const ent = useEntitlements();
  const { balance: coins } = useCoins();
  const { balance: gems } = useGems();
  const [tab, setTab] = useState<Tab>("subscription");
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [gemTxs, setGemTxs] = useState<GemTx[]>([]);
  const [gifts, setGifts] = useState<GiftRow[]>([]);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [s, g, gf] = await Promise.all([
        supabase.from("subscriptions").select("tier,status,interval,current_period_end,cancel_at_period_end,stripe_customer_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("gems_transactions").select("id,amount,balance_after,reason,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(25),
        supabase.from("gift_transactions").select("id,gift_type,status,sender_id,recipient_id,payload,message,created_at,claimed_at").or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`).order("created_at", { ascending: false }).limit(50),
      ]);
      if (cancelled) return;
      setSub((s.data as any) || null);
      setGemTxs((g.data as any) || []);
      setGifts((gf.data as any) || []);
    })();
    return () => { cancelled = true; };
  }, [user, tab]);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-customer-portal", {
        body: { returnUrl: window.location.href },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("No billing account yet — subscribe first");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const tierLabel = sub?.tier === "honey" ? "Cubbly Honey" : sub?.tier === "basic" ? "Honey Basic" : "Free";
  const statusActive = sub && ["active", "trialing"].includes(sub.status);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
        Manage your subscription, payment methods, and currency.
      </p>

      <div className="flex gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--app-bg-tertiary)", border: "1px solid var(--app-border)" }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all"
              style={{
                backgroundColor: active ? "var(--app-bg-secondary)" : "transparent",
                color: active ? "var(--app-text-primary)" : "var(--app-text-secondary)",
                boxShadow: active ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
              }}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tab === "subscription" && (
        <div className="flex flex-col gap-3">
          <Card>
            <div className="flex items-start gap-4 p-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
                   style={{ background: ent.isHoneyMember ? "linear-gradient(135deg,#f5a524,#f472b6)" : "var(--app-bg-tertiary)" }}>
                {ent.isHoneyMember
                  ? <img src={honeyIcon} alt="" className="h-8 w-8 brightness-0 invert" />
                  : <Sparkles className="h-7 w-7" style={{ color: "var(--app-text-secondary)" }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>{tierLabel}</h3>
                  {statusActive && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
                          style={{ backgroundColor: "rgba(59,165,92,0.18)", color: "#3ba55c" }}>
                      Active
                    </span>
                  )}
                  {sub?.cancel_at_period_end && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
                          style={{ backgroundColor: "rgba(248,113,113,0.18)", color: "#f87171" }}>
                      Cancels soon
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--app-text-secondary)" }}>
                  {sub
                    ? `Billed ${sub.interval === "year" ? "annually" : "monthly"}${sub.current_period_end ? ` • Renews ${new Date(sub.current_period_end).toLocaleDateString()}` : ""}`
                    : "You're on the free plan. Upgrade for more badges, bigger uploads, and 500 monthly gems."}
                </p>
              </div>
            </div>

            <div className="flex gap-2 border-t px-5 py-3" style={{ borderColor: "var(--app-border)" }}>
              <button
                onClick={() => window.location.assign("/@me/honey")}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
                style={{ background: "linear-gradient(135deg,#f5a524,#f472b6)" }}
              >
                {ent.isHoneyMember ? "Manage plan" : "Upgrade to Honey"}
              </button>
              {sub && (
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
                  style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
                >
                  {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Billing history
                </button>
              )}
            </div>
          </Card>

          <Card>
            <SectionHeader title="What's included" />
            <div className="grid grid-cols-1 gap-2 px-5 pb-5 sm:grid-cols-2">
              <Perk label="Coin multiplier" value={`${ent.coinMultiplier}×`} />
              <Perk label="Equipped badges" value={String(ent.maxEquippedBadges)} />
              <Perk label="Personal notes" value={ent.maxNotes === null ? "Unlimited" : String(ent.maxNotes)} />
              <Perk label="Attachment cap" value={`${ent.attachmentCapMB} MB`} />
              <Perk label="Message length" value={`${ent.messageCapChars.toLocaleString()} chars`} />
              <Perk label="Monthly gems" value={ent.monthlyGems > 0 ? `+${ent.monthlyGems}` : "—"} />
            </div>
          </Card>
        </div>
      )}

      {tab === "payment" && (
        <Card>
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl"
                 style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
              <CreditCard className="h-7 w-7" style={{ color: "var(--app-text-secondary)" }} />
            </div>
            <div>
              <h3 className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>Payment Methods</h3>
              <p className="mt-1 max-w-sm text-sm" style={{ color: "var(--app-text-secondary)" }}>
                Cards, billing address, and invoices are managed securely in our payment provider's portal.
              </p>
            </div>
            <button
              onClick={openPortal}
              disabled={portalLoading || !sub}
              className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#5865f2" }}
            >
              {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Open Billing Portal
            </button>
            {!sub && (
              <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                You don't have a payment method on file yet.
              </p>
            )}
          </div>
        </Card>
      )}

      {tab === "currency" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card>
              <div className="flex items-center gap-3 p-5">
                <img src={gemIcon} alt="" className="h-10 w-10 drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]" />
                <div className="flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-secondary)" }}>Gems</div>
                  <div className="text-2xl font-extrabold tabular-nums" style={{ color: "#60a5fa" }}>{gems.toLocaleString()}</div>
                </div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center gap-3 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(245,165,36,0.2)" }}>
                  <Coins className="h-6 w-6" style={{ color: "#f5a524" }} />
                </div>
                <div className="flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-secondary)" }}>Coins</div>
                  <div className="text-2xl font-extrabold tabular-nums" style={{ color: "#f5a524" }}>{coins.toLocaleString()}</div>
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <SectionHeader title="Recent gem activity" />
            {gemTxs.length === 0 ? (
              <EmptyState text="No gem transactions yet. Buy a bundle from the gem pill to get started." />
            ) : (
              <ul className="flex flex-col divide-y" style={{ borderColor: "var(--app-border)" }}>
                {gemTxs.map((t) => (
                  <li key={t.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{prettyReason(t.reason)}</div>
                      <div className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>{new Date(t.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-extrabold tabular-nums"
                         style={{ color: t.amount > 0 ? "#3ba55c" : "#f87171" }}>
                      {t.amount > 0 ? "+" : ""}{t.amount.toLocaleString()}
                      <img src={gemIcon} alt="" className="h-3.5 w-3.5" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "gifts" && (
        <Card>
          <SectionHeader title="Sent & received gifts" />
          {gifts.length === 0 ? (
            <EmptyState text="No gifts yet. Send your first one from a friend's profile or right-click any shop item." />
          ) : (
            <ul className="flex flex-col divide-y" style={{ borderColor: "var(--app-border)" }}>
              {gifts.map((g) => {
                const incoming = g.recipient_id === user?.id;
                const StatusIcon = g.status === "claimed" ? CheckCircle2 : g.status === "declined" ? XCircle : Clock;
                const statusColor = g.status === "claimed" ? "#3ba55c" : g.status === "declined" ? "#f87171" : "#f5a524";
                return (
                  <li key={g.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg"
                         style={{ backgroundColor: "rgba(244,114,182,0.15)" }}>
                      <Gift className="h-5 w-5" style={{ color: "#f472b6" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className={`h-3.5 w-3.5 ${incoming ? "rotate-180" : ""}`} style={{ color: "var(--app-text-secondary)" }} />
                        <span className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                          {incoming ? "Received" : "Sent"} • {prettyGiftType(g.gift_type, g.payload)}
                        </span>
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
                        {new Date(g.created_at).toLocaleString()}
                        {g.message ? ` • "${g.message.slice(0, 60)}"` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: statusColor }}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {g.status}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
};

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-2xl border" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}>
    {children}
  </div>
);

const SectionHeader = ({ title }: { title: string }) => (
  <div className="px-5 pt-4 pb-2 text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--app-text-secondary)" }}>
    {title}
  </div>
);

const Perk = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-center justify-between rounded-xl px-4 py-3"
       style={{ backgroundColor: "var(--app-bg-tertiary)", border: "1px solid var(--app-border)" }}>
    <span className="text-sm" style={{ color: "var(--app-text-secondary)" }}>{label}</span>
    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--app-text-primary)" }}>{value}</span>
  </div>
);

const EmptyState = ({ text }: { text: string }) => (
  <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--app-text-secondary)" }}>
    {text}
  </div>
);

function prettyReason(r: string) {
  return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function prettyGiftType(t: string, payload: any) {
  if (t === "honey") return `Honey subscription (${payload?.interval || "monthly"})`;
  if (t === "gems") return `${payload?.amount?.toLocaleString?.() || ""} gems`.trim();
  if (t === "shop_item") return payload?.item_name || "Shop item";
  return t.replace(/_/g, " ");
}

export default BillingSettings;
