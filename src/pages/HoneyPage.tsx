import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import honey3d from "@/assets/badges/honey.png";
import { toast } from "sonner";
import { Check, Sparkles } from "lucide-react";

type Interval = "monthly" | "annual";
type Tier = "basic" | "honey";

interface PlanDef {
  tier: Tier;
  name: string;
  tagline: string;
  monthly: number;
  annual: number;        // total billed yearly
  annualMonthly: number; // per-month price when billed annually
  discountPct: number;   // 0 = no discount label
  perks: string[];
  accent: string;
}

const PLANS: PlanDef[] = [
  {
    tier: "basic",
    name: "Honey Basic",
    tagline: "A sweet little upgrade.",
    monthly: 2.99,
    // Slight discount: 2.99 * 12 = 35.88 → 33.99 (~5% off)
    annual: 33.99,
    annualMonthly: 2.83,
    discountPct: 5,
    accent: "from-amber-300 to-amber-500",
    perks: [
      "Honey badge on your profile",
      "Equip 2 profile badges",
      "Unlimited personal notes",
      "100 MB attachments",
      "1,000 character messages",
      "Advanced shared-note controls",
    ],
  },
  {
    tier: "honey",
    name: "Honey",
    tagline: "The full hive.",
    monthly: 7.99,
    // ~20% off: 7.99 * 12 = 95.88 → 76.70
    annual: 76.70,
    annualMonthly: 6.39,
    discountPct: 20,
    accent: "from-amber-400 via-rose-400 to-violet-500",
    perks: [
      "Everything in Honey Basic",
      "2× coin rewards on everything",
      "Motion-gradient name colors",
      "All animated themes",
      "Equip 3 profile badges",
      "Exclusive Honey profile badge",
      "250 MB attachments",
      "4,000 character messages",
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
      {/* Hero — Nitro-style layered background using Honey colors */}
      <div className="relative overflow-hidden pt-20 pb-20">
        {/* Base radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 50% 20%, rgba(244,114,182,0.55), transparent 60%), radial-gradient(ellipse 70% 60% at 50% 60%, rgba(168,85,247,0.55), transparent 65%), linear-gradient(180deg, rgba(245,165,36,0.18) 0%, transparent 45%, rgba(0,0,0,0.55) 100%)",
          }}
        />
        {/* Floating particles */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[
            { top: "18%", left: "12%", size: 14, dur: "6s", delay: "0s", color: "rgba(255,190,120,0.9)" },
            { top: "32%", left: "22%", size: 8,  dur: "7s", delay: "1s", color: "rgba(244,114,182,0.9)" },
            { top: "52%", left: "8%",  size: 10, dur: "8s", delay: "2s", color: "rgba(168,85,247,0.9)" },
            { top: "22%", left: "78%", size: 12, dur: "6.5s", delay: "0.5s", color: "rgba(255,200,140,0.9)" },
            { top: "60%", left: "82%", size: 9,  dur: "7.5s", delay: "1.5s", color: "rgba(244,114,182,0.9)" },
            { top: "70%", left: "40%", size: 7,  dur: "8.5s", delay: "0.8s", color: "rgba(255,220,160,0.85)" },
          ].map((p, i) => (
            <span
              key={i}
              className="absolute rounded-full blur-[2px]"
              style={{
                top: p.top, left: p.left, width: p.size, height: p.size,
                background: p.color,
                animation: `honey-float ${p.dur} ease-in-out ${p.delay} infinite alternate`,
              }}
            />
          ))}
        </div>

        {/* Floating honey jar on the right */}
        <img
          src={honey3d}
          alt=""
          aria-hidden
          className="pointer-events-none absolute right-2 md:right-10 top-6 md:top-10 h-56 w-56 md:h-72 md:w-72 z-10 select-none"
          style={{
            animation: "honey-bob 5s ease-in-out infinite alternate",
            filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.35))",
          }}
        />

        <div className="relative z-10 mx-auto max-w-5xl px-8 text-center">
          {ent.isHoneyMember && (
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white ring-1 ring-white/20">
              <Sparkles className="h-3.5 w-3.5" /> {ent.tier === "honey" ? "Honey Active" : "Honey Basic Active"}
            </div>
          )}
          <h1 className="mt-4 font-heading text-5xl md:text-6xl font-extrabold tracking-tight text-white drop-shadow-[0_4px_20px_rgba(0,0,0,0.4)] leading-[1.05]">
            A little jar of<br /><span className="bg-gradient-to-r from-amber-200 via-rose-200 to-violet-200 bg-clip-text text-transparent">cozy magic</span>
          </h1>

          {/* Interval toggle with sliding thumb */}
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="relative inline-flex rounded-full bg-black/40 p-1 ring-1 ring-white/10 backdrop-blur-md">
              {/* Sliding thumb */}
              <span
                aria-hidden
                className="absolute top-1 bottom-1 w-[110px] rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-out"
                style={{ transform: interval === "monthly" ? "translateX(0)" : "translateX(110px)", left: "4px" }}
              />
              <button
                onClick={() => setInterval("monthly")}
                className="relative z-10 w-[110px] rounded-full py-2 text-sm font-semibold transition-colors"
                style={{ color: interval === "monthly" ? "#000" : "rgba(255,255,255,0.75)" }}
              >Monthly</button>
              <button
                onClick={() => setInterval("annual")}
                className="relative z-10 w-[110px] rounded-full py-2 text-sm font-semibold transition-colors"
                style={{ color: interval === "annual" ? "#000" : "rgba(255,255,255,0.75)" }}
              >Annual</button>
            </div>
            <p className="text-[11px] font-medium text-white/60 tracking-wide">More Features Coming Soon</p>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="mx-auto grid max-w-5xl gap-6 px-6 pb-16 md:grid-cols-2 items-stretch relative z-10">
        {PLANS.map((plan) => {
          const isCurrent = ent.tier === plan.tier;
          const showAnnual = interval === "annual";
          const bigPrice = showAnnual ? plan.annualMonthly : plan.monthly;
          const showStrike = showAnnual && plan.tier === "honey";

          return (
            <div
              key={plan.tier}
              className={`group relative overflow-hidden rounded-3xl p-6 ring-1 ring-white/10 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-2 hover:scale-[1.03] hover:shadow-[0_25px_60px_-15px_rgba(244,114,182,0.4)] hover:ring-white/25 ${
                plan.tier === "honey" ? "bg-gradient-to-br from-white/10 to-white/5 shadow-2xl" : "bg-white/5"
              }`}
            >
              {plan.tier === "honey" && (
                <div className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${plan.accent} opacity-40 blur-3xl`} />
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                {showAnnual && plan.tier === "honey" && (
                  <span className="rounded-full bg-gradient-to-r from-amber-400 to-rose-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                    Save {plan.discountPct}%
                  </span>
                )}
                {showAnnual && plan.tier === "basic" && (
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/85">
                    Save {plan.discountPct}%
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-white/60">{plan.tagline}</p>

              <div className="mt-5">
                <div className="flex items-baseline gap-2">
                  {showStrike && (
                    <span className="text-lg font-semibold text-white/40 line-through">${plan.monthly.toFixed(2)}</span>
                  )}
                  <span className="text-4xl font-extrabold text-white">${bigPrice.toFixed(2)}</span>
                  <span className="text-sm text-white/60">/ mo</span>
                </div>
                {showAnnual && (
                  <p className="mt-1 text-xs text-white/50">Billed annually (${plan.annual.toFixed(2)}/yr)</p>
                )}
              </div>

              <ul className="mt-6 space-y-2.5 flex-1">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm text-white/85">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> {perk}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(plan.tier)}
                disabled={isCurrent || loadingTier !== null}
                className={`mt-7 w-full rounded-full py-3 text-sm font-bold transition disabled:opacity-50 relative overflow-hidden ${
                  plan.tier === "honey"
                    ? "text-black honey-cta-glow"
                    : "bg-white text-black hover:bg-white/90"
                }`}
              >
                <span className="relative z-10">
                  {isCurrent ? "Current plan" : loadingTier === plan.tier ? "Opening checkout…" : `Get ${plan.name}`}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes honey-float {
          0% { transform: translate3d(0,0,0); opacity: 0.7; }
          100% { transform: translate3d(6px,-14px,0); opacity: 1; }
        }
        @keyframes honey-bob {
          0% { transform: translateY(0) rotate(-3deg); }
          100% { transform: translateY(-14px) rotate(3deg); }
        }
        @keyframes honey-cta-shine {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes honey-cta-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(251,191,36,0.5), 0 0 40px rgba(244,114,182,0.35); }
          50%      { box-shadow: 0 0 30px rgba(251,191,36,0.75), 0 0 60px rgba(244,114,182,0.55); }
        }
        .honey-cta-glow {
          background: linear-gradient(90deg, #fbbf24, #f472b6, #a78bfa, #f472b6, #fbbf24);
          background-size: 200% 100%;
          animation: honey-cta-shine 3.5s linear infinite, honey-cta-pulse 2.5s ease-in-out infinite;
        }
        .honey-cta-glow:hover { filter: brightness(1.1); }
      `}</style>
    </div>
  );
}
