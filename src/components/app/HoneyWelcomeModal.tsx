import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements, type SubscriptionTier } from "@/hooks/useEntitlements";
import honeyBg from "@/assets/honey-welcome-bg.png.asset.json";

/**
 * HoneyWelcomeModal
 * ─────────────────
 * Fires once (per tier per user) as soon as the user's active subscription
 * becomes "basic" or "honey" — whether they self-subscribed, accepted a Honey
 * gift, or the tier flipped on for any other reason. State is persisted in
 * localStorage so the modal never repeats for a tier the user has already
 * dismissed.
 */
const STORAGE_KEY = "cubbly:honey-welcome-shown-v1";

function loadShown(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function markShown(userId: string, tier: SubscriptionTier) {
  const map = loadShown();
  map[userId] = tier;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

const PERKS: Record<Exclude<SubscriptionTier, "free">, { title: string; items: string[] }> = {
  basic: {
    title: "What's New for You",
    items: [
      "2× coin earning on every reward",
      "Attachments up to 100 MB",
      "4,000-character messages",
      "Unlimited personal notes",
      "Animated shop themes & motion name colors",
      "Advanced note sharing (live edits + save)",
      "Equip up to 2 badges at once",
    ],
  },
  honey: {
    title: "What's New for You",
    items: [
      "500 Gems delivered every month",
      "2× coin earning on every reward",
      "Attachments up to 250 MB",
      "8,000-character messages",
      "Unlimited personal notes",
      "Animated shop themes & motion name colors",
      "Advanced note sharing (live edits + save)",
      "Equip up to 3 badges at once",
    ],
  },
};

export default function HoneyWelcomeModal() {
  const { user } = useAuth();
  const ent = useEntitlements();
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!user || !ent.loaded) return;
    if (ent.tier === "free") return;
    const shown = loadShown();
    if (shown[user.id] === ent.tier) return;
    setOpen(true);
    setSheetOpen(false);
  }, [user, ent.loaded, ent.tier]);

  if (!open || !user || ent.tier === "free") return null;

  const close = () => {
    markShown(user.id, ent.tier);
    setOpen(false);
    setSheetOpen(false);
  };

  const perks = PERKS[ent.tier];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative overflow-hidden shadow-2xl animate-scale-in"
        style={{
          width: "min(92vw, 460px)",
          aspectRatio: "3 / 4",
          borderRadius: "32px",
          backgroundImage: `url(${honeyBg.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {/* Soft gradient veil so title/button stay legible */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(58,32,20,0.35) 0%, rgba(58,32,20,0) 30%, rgba(58,32,20,0) 60%, rgba(58,32,20,0.55) 100%)",
          }}
        />

        {/* Title */}
        <div className="absolute top-0 left-0 right-0 pt-10 px-6 text-center">
          <h2
            className="font-extrabold leading-tight text-white"
            style={{ fontFamily: "Nunito, sans-serif", fontSize: "clamp(24px, 6.5vw, 34px)" }}
          >
            <div>You Now Have</div>
            <div
              className="cb-honey-gradient-text"
              style={{ fontSize: "clamp(34px, 9vw, 48px)", letterSpacing: "-0.01em" }}
            >
              Honey!
            </div>
          </h2>
        </div>

        {/* CTA */}
        <div className="absolute bottom-6 left-0 right-0 px-6 flex justify-center">
          <button
            onClick={() => setSheetOpen(true)}
            className="rounded-full bg-white px-8 py-3.5 font-bold text-[15px] transition-transform hover:scale-[1.03] active:scale-95"
            style={{
              fontFamily: "Nunito, sans-serif",
              color: "#8a5a2b",
              boxShadow: "0 12px 28px rgba(255,180,80,0.45), 0 4px 10px rgba(0,0,0,0.15)",
            }}
          >
            Start Exploring
          </button>
        </div>

        {/* Slide-up paper sheet */}
        <div
          className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-white overflow-hidden"
          style={{
            height: "72%",
            transform: sheetOpen ? "translateY(0)" : "translateY(105%)",
            transition: "transform 500ms cubic-bezier(0.22, 1, 0.36, 1)",
            boxShadow: "0 -12px 40px rgba(0,0,0,0.25)",
          }}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1.5 w-10 rounded-full bg-black/15" />
          <div className="h-full overflow-y-auto px-6 pt-8 pb-24" style={{ fontFamily: "Nunito, sans-serif" }}>
            <h3 className="text-[22px] font-extrabold mb-1" style={{ color: "#8a5a2b" }}>
              {perks.title}
            </h3>
            <p className="text-[13px] mb-5" style={{ color: "#8a6e56" }}>
              Everything Honey just unlocked on your account.
            </p>
            <ul className="space-y-3">
              {perks.items.map((line, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: "linear-gradient(135deg,#ffcf5c,#ff9a3c)" }}
                  />
                  <span className="text-[15px] leading-snug" style={{ color: "#3a2414" }}>
                    {line}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-white via-white to-transparent">
            <button
              onClick={close}
              className="w-full rounded-full py-3 font-bold text-[15px] text-white transition-transform hover:scale-[1.01] active:scale-95"
              style={{
                fontFamily: "Nunito, sans-serif",
                background: "linear-gradient(135deg,#ffcf5c,#ff9a3c)",
                boxShadow: "0 8px 20px rgba(255,154,60,0.45)",
              }}
            >
              Sweet, let's go
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
