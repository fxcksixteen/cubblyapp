import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import honeyIcon from "@/assets/icons/honey.svg";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";

type Interval = "monthly" | "annual";
type Tier = "basic" | "honey";

interface PlanDef {
  tier: Tier;
  name: string;
  tagline: string;
  monthly: number;
  annual: number;
  perks: string[];
  accent: string;
}

const PLANS: PlanDef[] = [
  {
    tier: "basic",
    name: "Honey Basic",
    tagline: "A sweet little upgrade.",
    monthly: 2.99,
    annual: 35.88,
    accent: "from-amber-300 to-amber-500",
    perks: [
      "2× coin rewards on everything",
      "Equip 2 profile badges",
      "Motion-gradient name colors",
      "All animated themes",
      "Unlimited personal notes",
      "100 MB attachments • 4 000 char messages",
      "Advanced shared-note controls",
    ],
  },
  {
    tier: "honey",
    name: "Honey",
    tagline: "The full hive.",
    monthly: 7.99,
    annual: 76.70,
    accent: "from-amber-400 via-rose-400 to-violet-500",
    perks: [
      "Everything in Honey Basic",
      "Equip 3 profile badges",
      "Exclusive Honey profile badge",
      "250 MB attachments • 8 000 char messages",
      "500 gems every month",
      "Early access to new themes & effects",
    ],
  },
];

export default function HoneyPage() {
  const { user } = useAuth();
  const ent = useEntitlements();
  const [interval, setInterval] = useState<Interval>("monthly");
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);

  const handleSubscribe = async (tier: Tier) => {
    if (!user) { toast.error("Sign in first"); return; }
    setLoadingTier(tier);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-subscription", {
        body: { tier, interval },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("No checkout URL");
      window.location.href = url;
    } catch (e: any) {
      console.error("[honey] checkout failed", e);
      toast.error(e?.message || "Couldn't start checkout");
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <div className="relative h-full overflow-y-auto" style={{ backgroundColor: "var(--app-bg-primary, #313338)" }}>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-80"
          style={{
            background:
              "radial-gradient(circle at 20% 30%, rgba(245,165,36,0.45), transparent 50%), radial-gradient(circle at 80% 70%, rgba(244,114,182,0.4), transparent 55%), radial-gradient(circle at 50% 100%, rgba(168,85,247,0.35), transparent 60%)",
            animation: "honey-drift 18s ease-in-out infinite alternate",
          }}
        />
        <div className="relative z-10 mx-auto max-w-5xl px-8 py-16 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 backdrop-blur-md ring-1 ring-white/20">
            <img src={honeyIcon} alt="" className="h-12 w-12" />
          </div>
          <h1 className="bg-gradient-to-r from-amber-200 via-rose-200 to-violet-200 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent">
            Cubbly Honey
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
            Support Cubbly, unlock animated themes, fatter attachments, and a hive full of perks.
          </p>
          {ent.isHoneyMember && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-4 py-2 text-sm font-semibold text-amber-100 ring-1 ring-amber-300/40">
              <Sparkles className="h-4 w-4" /> You're on {ent.tier === "honey" ? "Honey" : "Honey Basic"}
            </div>
          )}

          {/* Interval toggle */}
          <div className="mt-8 inline-flex rounded-full bg-black/30 p-1 ring-1 ring-white/10">
            <button
              onClick={() => setInterval("monthly")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${interval === "monthly" ? "bg-white text-black" : "text-white/70"}`}
            >Monthly</button>
            <button
              onClick={() => setInterval("annual")}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${interval === "annual" ? "bg-white text-black" : "text-white/70"}`}
            >Annual <span className="ml-1 text-xs text-amber-400">save ~20%</span></button>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="mx-auto grid max-w-5xl gap-6 px-6 pb-16 md:grid-cols-2">
        {PLANS.map((plan) => {
          const price = interval === "monthly" ? plan.monthly : plan.annual;
          const isCurrent = ent.tier === plan.tier;
          return (
            <div
              key={plan.tier}
              className={`relative overflow-hidden rounded-3xl p-6 ring-1 ring-white/10 ${
                plan.tier === "honey" ? "bg-gradient-to-br from-white/10 to-white/5 shadow-2xl" : "bg-white/5"
              }`}
            >
              {plan.tier === "honey" && (
                <div className={`absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${plan.accent} opacity-40 blur-3xl`} />
              )}
              <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
              <p className="mt-1 text-sm text-white/60">{plan.tagline}</p>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold text-white">${price.toFixed(2)}</span>
                <span className="text-sm text-white/60">/ {interval === "monthly" ? "mo" : "yr"}</span>
              </div>
              <ul className="mt-6 space-y-2.5">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-white/85">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> {perk}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSubscribe(plan.tier)}
                disabled={isCurrent || loadingTier !== null}
                className={`mt-7 w-full rounded-full py-3 text-sm font-bold transition disabled:opacity-50 ${
                  plan.tier === "honey"
                    ? "bg-gradient-to-r from-amber-400 to-rose-400 text-black hover:brightness-110"
                    : "bg-white text-black hover:bg-white/90"
                }`}
              >
                {isCurrent ? "Current plan" : loadingTier === plan.tier ? "Opening checkout…" : `Get ${plan.name}`}
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes honey-drift {
          0% { transform: translate3d(0,0,0) scale(1); }
          100% { transform: translate3d(-3%, 2%, 0) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
