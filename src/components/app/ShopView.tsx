import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCoins } from "@/contexts/CoinsContext";
import { useGems } from "@/contexts/GemsContext";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";
import { useEntitlements } from "@/hooks/useEntitlements";
import { toast } from "sonner";
import { playSound } from "@/lib/sounds";
import heartIcon from "@/assets/icons/heart.svg";
import heartFilledIcon from "@/assets/icons/heart-filled.svg";
import giftIcon from "@/assets/icons/gift.svg";
import GiftSendModal from "@/components/app/GiftSendModal";
import shopIcon from "@/assets/icons/shop.svg";
import coinStack from "@/assets/coins/coin-stack.png";
import coinNotEnough from "@/assets/coins/coin-not-enough.png";
import gemIcon from "@/assets/gems/gem.png";
import imgChatChampion from "@/assets/badges/chat_champion.svg";
import imgEarlySupporter from "@/assets/badges/early_supporter.svg";
import imgFriendly from "@/assets/badges/friendly.svg";
import imgGamer from "@/assets/badges/gamer.png";
import imgLegend from "@/assets/badges/legend.svg";
import imgNightOwl from "@/assets/badges/night_owl.svg";
import imgOg from "@/assets/badges/og.png";
import imgPetite from "@/assets/badges/petite.svg";
import imgVoiceVeteran from "@/assets/badges/voice_veteran.svg";

const BADGE_ART: Record<string, string> = {
  badge_chat_champ: imgChatChampion,
  badge_early_supporter: imgEarlySupporter,
  badge_friendly: imgFriendly,
  badge_gamer: imgGamer,
  badge_legend: imgLegend,
  badge_night_owl: imgNightOwl,
  badge_og: imgOg,
  badge_petite: imgPetite,
  badge_voice_veteran: imgVoiceVeteran,
};

const THEME_ITEM_MAP: Record<string, ThemeName> = {
  theme_midnight_aurora: "onyx",
  theme_sunset_cozy: "cubbly",
  theme_space: "space",
  theme_ocean_depths: "ocean",
  theme_cherry_blossom: "blossom",
  theme_evergreen: "forest",
  theme_synthwave: "synthwave",
  theme_lava_flow: "lava",
  theme_borealis: "borealis",
  theme_sky_dusk: "sky",
  theme_snowy_drift: "snowy",
  theme_moonlit_hills: "hills",
  theme_cosmic_nebula: "nebula",
  theme_cyber_grid: "cyber",
  theme_volcanic: "volcanic",
  theme_bioluminescent: "abyss",
  theme_aurora_borealis: "aurora",
  theme_sakura_storm: "sakura",
};

type Category = "name_color" | "theme" | "badge";

interface ShopItem {
  id: string;
  category: Category;
  subcategory: string | null;
  name: string;
  description: string | null;
  price: number;
  price_gems: number | null;
  config: any;
  sort_order: number;
}

const TABS: { id: Category | "all" | "wishlist"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "name_color", label: "Name Colors" },
  { id: "theme", label: "Themes" },
  { id: "badge", label: "Badges" },
  { id: "wishlist", label: "Wishlist" },
];

/** Renders a small visual preview matching the item type. */
function ItemPreview({ item, displayName }: { item: ShopItem; displayName: string }) {
  const name = displayName || "YourName";
  if (item.category === "name_color") {
    if (item.subcategory === "static") {
      return (
        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-[#1e1f22] px-3">
          <span className="text-lg font-extrabold truncate" style={{ color: item.config?.color }}>
            {name}
          </span>
        </div>
      );
    }
    if (item.subcategory === "gradient") {
      return (
        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-[#1e1f22] px-3">
          <span
            className="text-lg font-extrabold bg-clip-text text-transparent truncate"
            style={{
              backgroundImage: `linear-gradient(90deg, ${item.config?.from}, ${item.config?.to})`,
            }}
          >
            {name}
          </span>
        </div>
      );
    }
    if (item.subcategory === "animated") {
      const stops = (item.config?.stops as string[]) ?? ["#22d3ee", "#a855f7", "#ec4899", "#22d3ee"];
      const style = (item.config?.style as string) ?? "sweep";
      const dur = (item.config?.duration as string) ?? "6s";
      const bg = style === "conic"
        ? `conic-gradient(from 0deg, ${stops.join(",")})`
        : `linear-gradient(90deg, ${stops.join(",")})`;
      const anim =
        style === "conic"
          ? `cb-animated-name-hue ${dur} linear infinite`
          : style === "hueshift"
          ? `cb-animated-name-hue ${dur} linear infinite, cb-animated-name ${dur} ease-in-out infinite`
          : style === "pulse"
          ? `cb-animated-name ${dur} ease-in-out infinite, cb-animated-name-pulse ${dur} ease-in-out infinite`
          : `cb-animated-name ${dur} ease-in-out infinite`;
      const hasBow = !!(item.config as any)?.bow;
      return (
        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-[#1e1f22] px-3 overflow-hidden">
          <span
            className={`text-lg font-extrabold bg-clip-text text-transparent relative inline-block ${hasBow ? "" : "truncate"}`}
            style={{
              backgroundImage: bg,
              backgroundSize: style === "conic" ? "100% 100%" : "300% 100%",
              animation: anim,
              overflow: "visible",
              paddingTop: hasBow ? "0.35em" : undefined,
            }}
          >
            {name}
            {hasBow && (
              <img
                src={imgPetite}
                alt=""
                aria-hidden="true"
                draggable={false}
                style={{ position: "absolute", top: "0.32em", left: "-0.25em", height: "0.75em", width: "auto", pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))", transform: "rotate(-18deg)", transformOrigin: "bottom left" }}
              />
            )}
          </span>
        </div>
      );
    }
  }

  if (item.category === "theme") {
    if (item.id === "theme_space") {
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "radial-gradient(ellipse at 30% 0%, #0d1224, #07080c 60%, #04050a)" }}>
          <div className="absolute inset-0 shop-space-preview-stars" />
          <div className="absolute inset-0 shop-space-preview-shoot" />
        </div>
      );
    }
    if (item.id === "theme_sky_dusk") {
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "linear-gradient(180deg,#1a3a6e 0%,#3a5a8e 35%,#6b7fa8 65%,#d4a373 100%)" }}>
          <div className="shop-sky-cloud" style={{ top: "22%", animationDuration: "18s" }} />
          <div className="shop-sky-cloud" style={{ top: "48%", animationDuration: "26s", animationDelay: "-8s", transform: "scale(0.7)", opacity: 0.7 }} />
          <div className="shop-sky-cloud" style={{ top: "68%", animationDuration: "22s", animationDelay: "-14s", transform: "scale(1.1)" }} />
        </div>
      );
    }
    if (item.id === "theme_snowy_drift") {
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "linear-gradient(180deg,#1a2735 0%,#243a52 60%,#3a5470 100%)" }}>
          <div className="absolute inset-0 shop-snow-layer" />
          <div className="absolute inset-0 shop-snow-layer" style={{ animationDuration: "5s", opacity: 0.55, backgroundSize: "140px 160px" }} />
        </div>
      );
    }
    if (item.id === "theme_moonlit_hills") {
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "linear-gradient(180deg,#050818 0%,#0d1426 35%,#1a2244 70%,#2a3358 100%)" }}>
          <div className="absolute inset-0 shop-hills-stars" />
          <div className="absolute" style={{ top: "12%", right: "14%", width: 18, height: 18, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #fef9e7, #e8dcb8 60%, #c9b78a)", boxShadow: "0 0 14px rgba(255,240,200,0.55), 0 0 28px rgba(255,240,200,0.25)" }} />
          <div className="absolute left-0 right-0 bottom-0" style={{ height: "55%", background: "#1f2a4a", clipPath: "polygon(0 60%, 12% 45%, 25% 55%, 40% 30%, 55% 50%, 70% 35%, 85% 55%, 100% 45%, 100% 100%, 0 100%)", opacity: 0.9 }} />
          <div className="absolute left-0 right-0 bottom-0" style={{ height: "38%", background: "#141a36", clipPath: "polygon(0 70%, 15% 50%, 30% 65%, 48% 40%, 62% 60%, 78% 45%, 92% 65%, 100% 55%, 100% 100%, 0 100%)" }} />
          <div className="absolute left-0 right-0 bottom-0" style={{ height: "22%", background: "#08091a", clipPath: "polygon(0 80%, 20% 60%, 40% 75%, 60% 55%, 80% 70%, 100% 65%, 100% 100%, 0 100%)" }} />
        </div>
      );
    }
    if (item.id === "theme_cosmic_nebula") {
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "radial-gradient(ellipse at 30% 20%, #4c1d95 0%, #1e0b3b 50%, #05030f 100%)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 70% 70%, rgba(236,72,153,0.45), transparent 55%), radial-gradient(circle at 25% 40%, rgba(168,85,247,0.4), transparent 55%)", mixBlendMode: "screen", animation: "cb-nebula-pulse 6s ease-in-out infinite" }} />
          <div className="absolute inset-0 shop-preview-stars" style={{ opacity: 0.9 }} />
        </div>
      );
    }
    if (item.id === "theme_cyber_grid") {
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "linear-gradient(180deg,#05010f 0%,#200a55 45%,#ff2fbf 82%,#ffb15c 100%)" }}>
          <div className="absolute" style={{ left: "50%", bottom: "50%", width: 90, height: 45, marginLeft: -45, background: "radial-gradient(ellipse at 50% 100%, #fde68a 0%, #ff2fbf 45%, #7c1d8e 80%, transparent 100%)", borderRadius: "90px 90px 0 0", boxShadow: "0 0 24px rgba(255,47,191,0.55)" }} />
          <div className="absolute left-0 right-0" style={{ bottom: "50%", height: 1.5, background: "linear-gradient(90deg, transparent, #fff 50%, transparent)", boxShadow: "0 0 8px #ff2fbf" }} />
          <div className="absolute overflow-hidden" style={{ left: 0, right: 0, bottom: 0, top: "50%" }}>
            <div className="absolute" style={{ left: "-60%", right: "-60%", top: "-20%", bottom: "-40%", background: "linear-gradient(rgba(0,240,255,0.9) 1px, transparent 1px) 0 0/100% 10px, linear-gradient(90deg, rgba(0,240,255,0.8) 1px, transparent 1px) 0 0/14px 100%", transform: "perspective(140px) rotateX(62deg)", transformOrigin: "50% 0", animation: "cb-cyber-scroll 3s linear infinite" }} />
          </div>
        </div>
      );
    }
    if (item.id === "theme_volcanic") {
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 110%, #ff5b1f 0%, #7a1502 35%, #1a0503 100%)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(255,140,40,0.6), transparent 65%)", mixBlendMode: "screen", animation: "cb-volcanic-heat 4s ease-in-out infinite" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(2px 2px at 20% 80%,#ffb050,transparent),radial-gradient(1.5px 1.5px at 45% 65%,#ff8030,transparent),radial-gradient(2px 2px at 70% 75%,#ffc060,transparent),radial-gradient(1.5px 1.5px at 30% 40%,#ffb050,transparent),radial-gradient(2px 2px at 85% 55%,#ff9040,transparent)", backgroundSize: "100% 200%", filter: "drop-shadow(0 0 4px rgba(255,140,40,0.8))", animation: "cb-volcanic-embers 5s linear infinite" }} />
        </div>
      );
    }
    if (item.id === "theme_bioluminescent") {
      // Real jellyfish: translucent bell with scalloped bottom and wispy tentacles.
      const jelly = (leftPct: number, delay: string, scale: number, tint: string, dur: string) => (
        <div
          className="absolute"
          style={{
            left: `${leftPct}%`,
            bottom: "-30%",
            width: 22 * scale,
            height: 34 * scale,
            animation: `cb-jelly-rise-preview ${dur} linear infinite`,
            animationDelay: delay,
            filter: `drop-shadow(0 0 4px ${tint})`,
          }}
        >
          {/* Bell */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "55%",
              borderRadius: "50% 50% 42% 42% / 78% 78% 22% 22%",
              background: `radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.9), ${tint} 45%, rgba(56,189,248,0.35) 80%, transparent)`,
              transformOrigin: "50% 100%",
              animation: `cb-jelly-pulse 2.2s ease-in-out infinite`,
              animationDelay: delay,
            }}
          />
          {/* Tentacles */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              right: 0,
              bottom: 0,
              transformOrigin: "50% 0%",
              animation: `cb-jelly-sway 2.6s ease-in-out infinite`,
              animationDelay: delay,
            }}
          >
            {[15, 32, 50, 68, 85].map((lp, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: 0,
                  left: `${lp}%`,
                  width: 1,
                  height: `${70 + (i % 2) * 20}%`,
                  background: `linear-gradient(180deg, ${tint} 0%, transparent 100%)`,
                  opacity: 0.75,
                  borderRadius: 1,
                }}
              />
            ))}
          </div>
        </div>
      );
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "radial-gradient(ellipse at 50% 15%, #063a75 0%, #021640 55%, #01081c 100%)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 40%, rgba(56,189,248,0.35), transparent 55%), radial-gradient(ellipse at 75% 65%, rgba(94,234,212,0.3), transparent 55%)", mixBlendMode: "screen", animation: "cb-nebula-pulse 5s ease-in-out infinite" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(1px 1px at 12% 30%,#a5f3fc,transparent),radial-gradient(1px 1px at 78% 55%,#7dd3fc,transparent),radial-gradient(1px 1px at 45% 20%,#bae6fd,transparent)", opacity: 0.7 }} />
          {jelly(15, "0s", 1, "rgba(125,211,252,0.9)", "5.5s")}
          {jelly(45, "-2s", 0.75, "rgba(110,231,183,0.9)", "7s")}
          {jelly(72, "-4s", 1.1, "rgba(165,243,252,0.9)", "6.2s")}
        </div>
      );
    }

    if (item.id === "theme_aurora_borealis") {
      const curtain = (top: string, height: string, delay: string, dur: string, hueA: string, hueB: string, opacity: number) => (
        <div
          className="absolute left-[-20%] right-[-20%]"
          style={{
            top,
            height,
            opacity,
            filter: "blur(10px) saturate(1.6)",
            mixBlendMode: "screen",
            background: `linear-gradient(90deg, transparent 0%, ${hueA} 25%, ${hueB} 55%, ${hueA} 80%, transparent 100%)`,
            maskImage: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.95) 40%, rgba(0,0,0,0.3) 90%, transparent)",
            WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.95) 40%, rgba(0,0,0,0.3) 90%, transparent)",
            animation: `cb-aurora-preview ${dur} ease-in-out infinite`,
            animationDelay: delay,
          }}
        />
      );
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "linear-gradient(180deg,#01102a 0%,#03215a 55%,#042038 100%)" }}>
          {/* Stars */}
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(1px 1px at 12% 18%,#fff,transparent),radial-gradient(1px 1px at 44% 10%,#e0f2fe,transparent),radial-gradient(1px 1px at 78% 22%,#fff,transparent)", opacity: 0.9 }} />
          {curtain("2%", "70%", "0s", "6s", "rgba(52,211,153,0.75)", "rgba(59,130,246,0.6)", 0.95)}
          {curtain("6%", "60%", "-2s", "8s", "rgba(168,85,247,0.55)", "rgba(52,211,153,0.5)", 0.8)}
          {curtain("0%", "78%", "-4s", "11s", "rgba(94,234,212,0.5)", "rgba(147,197,253,0.45)", 0.65)}
          {/* Horizon glow */}
          <div className="absolute left-0 right-0" style={{ bottom: "35%", height: "22%", background: "radial-gradient(ellipse at 50% 100%, rgba(52,211,153,0.55), transparent 70%)", filter: "blur(6px)", mixBlendMode: "screen" }} />
          {/* Mountains */}
          <div className="absolute left-0 right-0 bottom-0" style={{ height: "40%", background: "#031225", clipPath: "polygon(0 55%, 20% 40%, 40% 55%, 60% 30%, 80% 55%, 100% 45%, 100% 100%, 0 100%)" }} />
        </div>
      );
    }
    if (item.id === "theme_sakura_storm") {
      return (
        <div className="relative h-20 w-full rounded-lg overflow-hidden" style={{ background: "linear-gradient(180deg,#2a0e30 0%,#5c1846 40%,#c86e94 80%,#f4c1a6 100%)" }}>
          <div className="absolute" style={{ right: "18%", top: "18%", width: 22, height: 22, borderRadius: "50%", background: "radial-gradient(circle at 40% 40%, #fff0d5, #f8a488 60%, transparent)", boxShadow: "0 0 20px rgba(255,180,140,0.6)" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(3px 4px at 15% 20%,#fbcfe8,transparent 70%),radial-gradient(2.5px 3.5px at 40% 55%,#f9a8d4,transparent 70%),radial-gradient(3px 4px at 70% 30%,#fbcfe8,transparent 70%),radial-gradient(2px 3px at 85% 65%,#f472b6,transparent 70%)", backgroundSize: "100% 180%", animation: "cb-sakura-fall 6s linear infinite" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(2px 3px at 25% 40%,#fbcfe8,transparent 70%),radial-gradient(3px 4px at 55% 15%,#f9a8d4,transparent 70%),radial-gradient(2px 3px at 90% 50%,#fbcfe8,transparent 70%)", backgroundSize: "100% 180%", animation: "cb-sakura-fall 10s linear infinite", animationDelay: "-2s", opacity: 0.7 }} />
        </div>
      );
    }
    const cfg = item.config || {};
    const bg: string = cfg.preview || "linear-gradient(135deg, #f59e0b, #ef4444, #ec4899)";
    const animated: boolean = !!cfg.animated;
    return (
      <div
        className={`h-20 w-full rounded-lg ${animated ? "shop-theme-aurora" : ""}`}
        style={{
          backgroundImage: bg,
          backgroundSize: animated ? "300% 300%" : undefined,
        }}
      />
    );
  }

  if (item.category === "badge") {
    const cfg = item.config || {};
    const art = BADGE_ART[item.id];
    return (
      <div className="flex h-20 w-full items-center justify-center gap-3 rounded-lg bg-[#1e1f22] px-3">
        {art ? (
          <img
            src={art}
            alt={item.name}
            draggable={false}
            className="h-14 w-14 object-contain shrink-0"
            style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.4))" }}
          />
        ) : (
          <span
            className="inline-flex items-center justify-center rounded-md shrink-0"
            style={{
              width: 30, height: 30,
              backgroundColor: cfg.bg ?? "#3f4147",
              color: cfg.fg ?? "#fff",
              boxShadow: cfg.glow ? `0 0 10px ${cfg.glow}66` : undefined,
              fontWeight: 800, fontSize: 16,
            }}
          >★</span>
        )}
        <span className="text-base font-extrabold truncate" style={{ color: "#fff" }}>
          {name}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-20 w-full items-center justify-center rounded-lg bg-gradient-to-br from-[#5865f2] to-[#a855f7]">
      <span className="text-3xl font-black text-white drop-shadow">{item.name[0]}</span>
    </div>
  );
}

type TabSetter = (t: Category | "all" | "wishlist") => void;

/** Featured cards strip — shifts one card at a time with arrow buttons. */
function BannerCarousel({ onTab }: { onTab: TabSetter }) {
  const [emblaRef, embla] = useEmblaCarousel({ align: "start", slidesToScroll: 1, containScroll: "trimSnaps" });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const update = useCallback(() => {
    if (!embla) return;
    setCanPrev(embla.canScrollPrev());
    setCanNext(embla.canScrollNext());
  }, [embla]);
  useEffect(() => {
    if (!embla) return;
    update();
    embla.on("select", update);
    embla.on("reInit", update);
  }, [embla, update]);

  const slide = "min-w-0 shrink-0 grow-0 basis-full sm:basis-1/2 lg:basis-1/3 pl-4";
  return (
    <div className="relative">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex -ml-4">
          {/* 1. Space */}
          <div className={slide}>
            <button
              onClick={() => onTab("theme")}
              className="group relative aspect-video w-full rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5 hover:shadow-2xl"
              style={{ background: "radial-gradient(ellipse at 30% 0%, #0d1224, #07080c 60%, #04050a)", border: "1px solid #1a1e2a" }}
            >
              <div className="absolute inset-0 shop-space-preview-stars" />
              <div className="absolute inset-0 shop-space-preview-shoot" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">New · Premium</span>
                <h3 className="text-lg font-extrabold text-white drop-shadow">Space Theme</h3>
                <p className="text-[11px] text-white/80 line-clamp-2">A grok-styled charcoal sky with drifting stars and shooting stars.</p>
              </div>
            </button>
          </div>
          {/* 2. Motion Name Colors */}
          <div className={slide}>
            <button
              onClick={() => onTab("name_color")}
              className="group relative aspect-video w-full rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5 hover:shadow-2xl"
              style={{ background: "linear-gradient(135deg,#1a0b2e,#3a0e5e,#7c1d8e,#3a0e5e,#1a0b2e)", backgroundSize: "300% 300%", border: "1px solid #2a1455" }}
            >
              <div className="absolute inset-0 shop-theme-aurora" style={{ backgroundImage: "linear-gradient(135deg,#22d3ee,#a855f7,#ec4899,#22d3ee)", backgroundSize: "300% 300%", opacity: 0.55, mixBlendMode: "screen" }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">Featured</span>
                <h3 className="text-lg font-extrabold text-white drop-shadow">Motion Name Colors</h3>
                <p className="text-[11px] text-white/85 line-clamp-2">Living gradients that shimmer next to your name in chat.</p>
              </div>
            </button>
          </div>
          {/* 3. Earn Coins */}
          <div className={slide}>
            <div
              className="relative aspect-video w-full rounded-2xl overflow-hidden"
              style={{ background: "linear-gradient(135deg,#3b2a08,#7a5712,#facc15,#7a5712,#3b2a08)", backgroundSize: "300% 300%", border: "1px solid #6b4f10" }}
            >
              <div className="absolute inset-0 shop-theme-aurora" style={{ opacity: 0.7 }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <img src={coinStack} alt="" className="absolute -right-3 -bottom-3 h-28 w-28 opacity-90 drop-shadow-2xl rotate-[-8deg]" />
              <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Daily</span>
                <h3 className="text-lg font-extrabold text-white drop-shadow">Earn Coins</h3>
                <p className="text-[11px] text-white/85 line-clamp-2">Chat, call, and game with friends to stack up coins.</p>
              </div>
            </div>
          </div>
          {/* 4. Cosmic Nebula */}
          <div className={slide}>
            <button
              onClick={() => onTab("theme")}
              className="group relative aspect-video w-full rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5 hover:shadow-2xl"
              style={{ background: "radial-gradient(ellipse at 30% 20%, #4c1d95 0%, #1e0b3b 55%, #05030f 100%)", border: "1px solid #2a1455" }}
            >
              <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 70% 70%, rgba(236,72,153,0.45), transparent 55%), radial-gradient(circle at 25% 40%, rgba(168,85,247,0.4), transparent 55%)", mixBlendMode: "screen", animation: "cb-nebula-pulse 6s ease-in-out infinite" }} />
              <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(1px 1px at 20px 24px,#fff,transparent),radial-gradient(1px 1px at 90px 60px,#fbcfe8,transparent),radial-gradient(1px 1px at 160px 30px,#fff,transparent),radial-gradient(1px 1px at 240px 80px,#fff,transparent)", backgroundSize: "300px 140px", opacity: .85 }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">Premium · Gems</span>
                <h3 className="text-lg font-extrabold text-white drop-shadow">Cosmic Nebula</h3>
                <p className="text-[11px] text-white/85 line-clamp-2">Swirling purple gas clouds with a starfield that never sleeps.</p>
              </div>
            </button>
          </div>
          {/* 5. Aurora Borealis */}
          <div className={slide}>
            <button
              onClick={() => onTab("theme")}
              className="group relative aspect-video w-full rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5 hover:shadow-2xl"
              style={{ background: "linear-gradient(180deg,#01102a 0%,#03215a 55%,#042038 100%)", border: "1px solid #08325b" }}
            >
              <div className="absolute" style={{ inset: "0 -20% 30% -20%", background: "linear-gradient(180deg, transparent, rgba(52,211,153,0.75) 40%, rgba(59,130,246,0.6) 70%, transparent)", filter: "blur(14px)", mixBlendMode: "screen", animation: "cb-aurora-wave 8s ease-in-out infinite" }} />
              <div className="absolute left-0 right-0 bottom-0" style={{ height: "36%", background: "#031225", clipPath: "polygon(0 55%, 20% 40%, 40% 55%, 60% 30%, 80% 55%, 100% 45%, 100% 100%, 0 100%)" }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/70">Premium · Gems</span>
                <h3 className="text-lg font-extrabold text-white drop-shadow">Northern Lights</h3>
                <p className="text-[11px] text-white/85 line-clamp-2">Dancing green and violet curtains over quiet mountains.</p>
              </div>
            </button>
          </div>
          {/* 6. Premium Motion Names (Bow) */}
          <div className={slide}>
            <button
              onClick={() => onTab("name_color")}
              className="group relative aspect-video w-full rounded-2xl overflow-hidden text-left transition-transform hover:-translate-y-0.5 hover:shadow-2xl"
              style={{ background: "linear-gradient(135deg,#3a0e5e,#a855f7,#ec4899,#f9a8d4,#a855f7,#3a0e5e)", backgroundSize: "300% 300%", border: "1px solid #6b1a7a", animation: "cb-animated-name 6s ease-in-out infinite" }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
              <div className="absolute inset-0 p-4 flex flex-col justify-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/80">Ultra · 1,500 Gems</span>
                <h3 className="text-lg font-extrabold text-white drop-shadow">Bow — Motion Name</h3>
                <p className="text-[11px] text-white/85 line-clamp-2">Pink-to-purple shimmer with a tiny bow tucked beside your name.</p>
              </div>
            </button>
          </div>
        </div>
      </div>

      {canPrev && (
        <button
          onClick={() => embla?.scrollPrev()}
          aria-label="Previous"
          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/10 hover:bg-black/80 transition"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {canNext && (
        <button
          onClick={() => embla?.scrollNext()}
          aria-label="Next"
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/10 hover:bg-black/80 transition"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}



const ShopView = () => {
  const { user } = useAuth();
  const { balance } = useCoins();
  const { balance: gemBalance } = useGems();
  const { setTheme } = useTheme();
  const ent = useEntitlements();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<Set<string>>(new Set());
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());
  const [giftItem, setGiftItem] = useState<ShopItem | null>(null);
  const [activeTab, setActiveTab] = useState<Category | "all" | "wishlist">(() => {
    if (typeof window === "undefined") return "all";
    const m = window.location.hash.match(/tab=(name_color|theme|badge|all|wishlist)/);
    return (m?.[1] as any) || "all";
  });

  // React to hash changes (deep-links from Settings)
  useEffect(() => {
    const onHash = () => {
      const m = window.location.hash.match(/tab=(name_color|theme|badge|all|wishlist)/);
      if (m?.[1]) setActiveTab(m[1] as any);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [displayName, setDisplayName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // Load catalog + inventory
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: catalog }, { data: inv }, { data: eq }, { data: wish }] = await Promise.all([
        supabase.from("shop_items").select("*").order("sort_order", { ascending: true }).order("price", { ascending: true }),
        user
          ? supabase.from("user_inventory").select("item_id").eq("user_id", user.id)
          : Promise.resolve({ data: [] as { item_id: string }[] }),
        user
          ? supabase.from("user_equipped").select("item_id").eq("user_id", user.id)
          : Promise.resolve({ data: [] as { item_id: string }[] }),
        user
          ? supabase.from("wishlist_items").select("item_id").eq("user_id", user.id)
          : Promise.resolve({ data: [] as { item_id: string }[] }),
      ]);
      if (!alive) return;
      // v0.3.17: "Petite" badge is publicly rebranded to "Cute" with a new
      // shop description. Aria keeps the original via UserBadgesContext.
      const remapped = ((catalog as ShopItem[]) ?? []).map((it) =>
        it.id === "badge_petite"
          ? { ...it, name: "Cute", description: "Adorable through and through." }
          : it,
      );
      setItems(remapped);
      setOwned(new Set((inv ?? []).map((r: any) => r.item_id)));
      setEquipped(new Set((eq ?? []).map((r: any) => r.item_id)));
      setWishlist(new Set((wish ?? []).map((r: any) => r.item_id)));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // Realtime — keep inventory in sync
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`inv:${user.id}:${Math.random().toString(36).slice(2, 10)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_inventory", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const id = (payload.new as any)?.item_id;
          if (id) setOwned((prev) => new Set(prev).add(id));
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_equipped", filter: `user_id=eq.${user.id}` },
        async () => {
          const { data } = await supabase.from("user_equipped").select("item_id").eq("user_id", user.id);
          setEquipped(new Set((data ?? []).map((r: any) => r.item_id)));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  // Load current user's display name for previews
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setDisplayName(data?.display_name || ""));
  }, [user]);

  const visible = useMemo(
    () => {
      if (activeTab === "all") return items;
      if (activeTab === "wishlist") return items.filter((i) => wishlist.has(i.id));
      return items.filter((i) => i.category === activeTab);
    },
    [items, activeTab, wishlist]
  );


  const SUBCATEGORY_LABELS: Record<string, Record<string, { title: string; subtitle?: string }>> = {
    name_color: {
      static: { title: "Static Colors", subtitle: "Solid, single-tone name colors" },
      gradient: { title: "Gradient Colors", subtitle: "Two-tone blended name colors" },
      animated: { title: "Motion Gradients", subtitle: "Animated, shifting name colors" },
    },
    theme: {
      static: { title: "Classic Themes", subtitle: "Curated palettes for everyday vibes" },
      animated: { title: "Animated Themes", subtitle: "Living backgrounds with subtle motion" },
      premium: { title: "Premium Themes", subtitle: "Exclusive, high-end atmospheres" },
    },
    badge: {
      profile: { title: "Profile Badges", subtitle: "Show off next to your name" },
    },
  };

  const grouped = useMemo(() => {
    if (activeTab === "all" || activeTab === "wishlist") return null;
    const groups = new Map<string, ShopItem[]>();
    for (const it of visible) {
      const key = it.subcategory || "other";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(it);
    }
    return Array.from(groups.entries());
  }, [visible, activeTab]);

  const buy = async (item: ShopItem) => {
    if (purchasing) return;
    if (owned.has(item.id)) {
      toast.info("You already own this");
      return;
    }
    if (balance < item.price) {
      toast.custom(
        () => (
          <div className="flex items-center gap-3 rounded-xl bg-[#2b2d31] border border-[#3f4147] px-3 py-2.5 shadow-2xl shadow-black/40 min-w-[260px]">
            <img src={coinNotEnough} alt="" className="h-11 w-11 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold text-white">Not enough coins</div>
              <div className="text-[11px] text-[#b5bac1] mt-0.5">
                You need {(item.price - balance).toLocaleString()} more.
              </div>
            </div>
          </div>
        ),
        { duration: 3500, position: "bottom-right" }
      );
      return;
    }
    setPurchasing(item.id);
    const { error } = await supabase.rpc("purchase_shop_item", { _item_id: item.id });
    setPurchasing(null);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("INSUFFICIENT_COINS")) toast.error("Not enough coins");
      else if (msg.includes("ALREADY_OWNED")) toast.info("Already owned");
      else toast.error("Purchase failed");
      return;
    }
    playSound("coinsSpend", { volume: 0.55 });
    toast.success(`Unlocked: ${item.name}`);
  };

  const toggleEquip = async (item: ShopItem) => {
    const isEq = equipped.has(item.id);
    if (!isEq && item.category === "badge") {
      const equippedBadgeCount = items.filter((i) => i.category === "badge" && equipped.has(i.id)).length;
      if (equippedBadgeCount >= ent.maxEquippedBadges) {
        const upsell = ent.isHoney
          ? ""
          : ent.isHoneyMember
            ? " — upgrade to Honey for 3 slots"
            : " — Honey members get up to 3";
        toast.error(`You can equip up to ${ent.maxEquippedBadges} badge${ent.maxEquippedBadges === 1 ? "" : "s"}${upsell}`);
        return;
      }
    }
    if (!isEq && item.category === "theme" && !ent.canUseAnimatedThemes && /animated|motion|aurora|nebula/i.test(item.name)) {
      // Animated themes are Honey-tier only. Static themes remain available to all.
      toast.error("Animated themes are a Honey perk");
      return;
    }
    const { error } = await supabase.rpc(isEq ? "unequip_shop_item" : "equip_shop_item", { _item_id: item.id });
    if (error) { toast.error("Couldn't update equipped item"); return; }
    setEquipped((prev) => {
      const next = new Set(prev);
      if (isEq) next.delete(item.id);
      else {
        if (item.category === "theme" || item.category === "name_color") {
          items.filter((i) => i.category === item.category).forEach((i) => next.delete(i.id));
        }
        next.add(item.id);
      }
      return next;
    });
    if (item.category === "theme") setTheme(isEq ? "default" : (THEME_ITEM_MAP[item.id] || "default"));
    toast.success(isEq ? `Unequipped ${item.name}` : `Equipped ${item.name}`);
  };

  const toggleWishlist = async (item: ShopItem) => {
    if (!user) return;
    const isWished = wishlist.has(item.id);
    setWishlist((prev) => {
      const next = new Set(prev);
      if (isWished) next.delete(item.id); else next.add(item.id);
      return next;
    });
    if (isWished) {
      const { error } = await supabase.from("wishlist_items").delete().eq("user_id", user.id).eq("item_id", item.id);
      if (error) toast.error("Couldn't update wishlist");
    } else {
      const { error } = await supabase.from("wishlist_items").insert({ user_id: user.id, item_id: item.id });
      if (error) toast.error("Couldn't update wishlist");
    }
  };

  const buyWithGems = async (item: ShopItem) => {
    if (purchasing || !item.price_gems) return;
    if (owned.has(item.id)) { toast.info("You already own this"); return; }
    if (gemBalance < item.price_gems) { toast.error(`Need ${item.price_gems - gemBalance} more gems`); return; }
    setPurchasing(item.id);
    const { error } = await supabase.rpc("purchase_shop_item_gems", { _item_id: item.id });
    setPurchasing(null);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("INSUFFICIENT_GEMS")) toast.error("Not enough gems");
      else if (msg.includes("ALREADY_OWNED")) toast.info("Already owned");
      else toast.error("Purchase failed");
      return;
    }
    toast.success(`Unlocked: ${item.name}`);
  };


  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      <style>{`
        @keyframes shopAnimatedName { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .shop-animated-name { animation: shopAnimatedName 6s ease-in-out infinite; }
        @keyframes shopThemeAurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .shop-theme-aurora { animation: shopThemeAurora 10s ease infinite; }
        .shop-space-preview-stars { background-image: radial-gradient(1px 1px at 20px 12px,#fff,transparent), radial-gradient(1px 1px at 60px 30px,#fff,transparent), radial-gradient(0.5px 0.5px at 100px 50px,#fff,transparent), radial-gradient(1px 1px at 140px 18px,#fff,transparent), radial-gradient(0.5px 0.5px at 180px 60px,#fff,transparent); background-size: 200px 80px; animation: shopSpaceDrift 25s linear infinite; opacity:0.85; }
        @keyframes shopSpaceDrift { from{background-position:0 0} to{background-position:-200px 0} }
        .shop-space-preview-shoot::after { content:""; position:absolute; top:18%; left:-30%; width:70px; height:1.5px; background:linear-gradient(90deg, transparent, rgba(255,255,255,.95)); border-radius:999px; transform:rotate(-22deg); filter: drop-shadow(0 0 4px rgba(255,255,255,.8)); animation: shopSpaceShoot 4.5s ease-in infinite; }
        @keyframes shopSpaceShoot { 0%{opacity:0; transform:translate(0,0) rotate(-22deg);} 10%{opacity:1;} 60%{opacity:1;} 100%{opacity:0; transform:translate(180%, 60%) rotate(-22deg);} }

        /* Sky preview clouds */
        .shop-sky-cloud { position:absolute; left:-40%; width:60%; height:14px; border-radius:999px;
          background: radial-gradient(ellipse at 30% 60%, rgba(255,255,255,0.85), rgba(255,255,255,0.25) 60%, transparent 75%);
          filter: blur(3px); animation: shopSkyDrift linear infinite; }
        @keyframes shopSkyDrift { from { transform: translateX(0) } to { transform: translateX(260%) } }

        /* Snowy preview falling flakes */
        .shop-snow-layer { background-image:
            radial-gradient(1.5px 1.5px at 12px 18px,#fff,transparent),
            radial-gradient(1px 1px at 48px 60px,#fff,transparent),
            radial-gradient(1.5px 1.5px at 90px 30px,#fff,transparent),
            radial-gradient(1px 1px at 130px 80px,#fff,transparent),
            radial-gradient(2px 2px at 60px 100px,#fff,transparent);
          background-size: 160px 120px; opacity: 0.9; animation: shopSnowFall 3.2s linear infinite; }
        @keyframes shopSnowFall { from { background-position: 0 -120px } to { background-position: 0 0 } }

        /* Hills preview stars */
        .shop-hills-stars { background-image:
            radial-gradient(0.8px 0.8px at 18px 10px,#fff,transparent),
            radial-gradient(0.8px 0.8px at 60px 22px,#fff,transparent),
            radial-gradient(1px 1px at 110px 8px,#fff,transparent),
            radial-gradient(0.6px 0.6px at 160px 26px,rgba(200,210,255,.9),transparent),
            radial-gradient(0.8px 0.8px at 200px 14px,#fff,transparent);
          background-size: 240px 60px; opacity: 0.85; animation: shopHillsTwinkle 4s ease-in-out infinite; }
        @keyframes shopHillsTwinkle { 0%,100%{opacity:.55} 50%{opacity:.95} }

        /* Twinkling starfield for cosmic/bio previews */
        .shop-preview-stars { background-image:
            radial-gradient(1px 1px at 15px 12px,#fff,transparent),
            radial-gradient(1px 1px at 60px 30px,#fff,transparent),
            radial-gradient(0.8px 0.8px at 100px 50px,#fbcfe8,transparent),
            radial-gradient(1px 1px at 140px 18px,#fff,transparent),
            radial-gradient(0.8px 0.8px at 180px 60px,#fff,transparent),
            radial-gradient(1px 1px at 40px 70px,#fff,transparent),
            radial-gradient(0.6px 0.6px at 200px 30px,#e9d5ff,transparent);
          background-size: 220px 90px; animation: shopSpaceDrift 20s linear infinite, shopHillsTwinkle 3s ease-in-out infinite; }
      `}</style>

      {/* Banner ads (carousel — shifts by one card) */}
      <div className="px-6 sm:px-10 pt-6">
        <BannerCarousel onTab={setActiveTab} />
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 px-6 sm:px-10 py-3 flex gap-2 backdrop-blur"
           style={{ backgroundColor: "color-mix(in srgb, var(--app-bg-primary) 85%, transparent)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="rounded-full px-4 py-1.5 text-sm font-semibold transition-all"
            style={{
              backgroundColor: activeTab === t.id ? "var(--app-active, #404249)" : "transparent",
              color: activeTab === t.id ? "white" : "var(--app-text-secondary)",
              border: `1px solid ${activeTab === t.id ? "var(--app-border, #3f4147)" : "transparent"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="px-6 sm:px-10 py-6 pb-12">
        {loading ? (
          <div className="text-center text-sm py-12" style={{ color: "var(--app-text-secondary)" }}>
            Loading shop…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center text-sm py-12" style={{ color: "var(--app-text-secondary)" }}>
            More items coming soon to this tab.
          </div>
        ) : (() => {
          const renderCard = (item: ShopItem) => {
            const isOwned = owned.has(item.id);
            const isEq = equipped.has(item.id);
            const isWished = wishlist.has(item.id);
            const gemsOnly = !!(item.config as any)?.gems_only;
            const canAfford = balance >= item.price;
            const isBusy = purchasing === item.id;
            const canBuyGems = item.price_gems !== null && item.price_gems > 0;
            return (
              <div
                key={item.id}
                className="group relative rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                style={{
                  backgroundColor: "var(--app-bg-secondary, #2b2d31)",
                  border: `1px solid ${isEq ? "#5865f2" : "var(--app-border, #3f4147)"}`,
                }}
              >
                {!isOwned && (
                  <button
                    onClick={() => toggleWishlist(item)}
                    className={`absolute top-2 right-2 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-all hover:scale-110 ${
                      isWished ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                    }`}
                    style={{
                      backgroundColor: isWished ? "rgba(236,72,153,0.18)" : "rgba(0,0,0,0.55)",
                      border: `1px solid ${isWished ? "rgba(236,72,153,0.55)" : "rgba(255,255,255,0.08)"}`,
                      backdropFilter: "blur(4px)",
                    }}
                    title={isWished ? "Remove from wishlist" : "Add to wishlist"}
                  >
                    <img
                      src={isWished ? heartFilledIcon : heartIcon}
                      alt=""
                      className="h-4 w-4"
                      style={{
                        filter: isWished
                          ? "invert(60%) sepia(82%) saturate(2500%) hue-rotate(295deg) brightness(101%) contrast(95%)"
                          : "invert(100%)",
                      }}
                    />
                  </button>
                )}
                <ItemPreview item={item} displayName={displayName} />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate" style={{ color: "var(--app-text-primary)" }}>
                      {item.name}
                    </div>
                    {item.description && (
                      <div className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--app-text-secondary)" }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                </div>
                {isOwned ? (
                  <button
                    onClick={() => toggleEquip(item)}
                    className="mt-3 w-full rounded-lg py-2 text-sm font-bold transition-all"
                    style={{
                      backgroundColor: isEq ? "#3ba55c" : "var(--app-bg-tertiary, #1e1f22)",
                      color: "white",
                    }}
                  >
                    {isEq ? "Equipped" : "Equip"}
                  </button>
                ) : (
                  <div className="mt-3 flex items-stretch gap-2">
                    {!gemsOnly && (
                      <button
                        onClick={() => buy(item)}
                        disabled={isBusy}
                        className="flex-1 rounded-lg py-2 text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: canAfford ? "#5865f2" : "var(--app-bg-tertiary, #1e1f22)",
                          color: "white",
                        }}
                      >
                        <img src={canAfford ? coinStack : coinNotEnough} alt="" className="h-6 w-6 -my-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                        <span>{item.price.toLocaleString()}</span>
                      </button>
                    )}
                    {canBuyGems && (
                      <button
                        onClick={() => buyWithGems(item)}
                        disabled={isBusy}
                        title={gemsOnly ? "Premium — gems only" : "Buy with gems"}
                        className={`${gemsOnly ? "flex-1" : ""} rounded-lg px-3 py-2 text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed`}
                        style={{
                          backgroundColor: gemsOnly
                            ? "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(139,92,246,0.18))" as any
                            : "var(--app-bg-tertiary, #1e1f22)",
                          background: gemsOnly
                            ? "linear-gradient(135deg, rgba(96,165,250,0.18), rgba(139,92,246,0.22))"
                            : undefined,
                          border: `1px solid ${gemsOnly ? "rgba(139,92,246,0.55)" : "rgba(96,165,250,0.4)"}`,
                          color: "#a5b8ff",
                        }}
                      >
                        <img src={gemIcon} alt="" className="h-5 w-5" />
                        <span>{item.price_gems!.toLocaleString()}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setGiftItem(item)}
                      disabled={isBusy}
                      title="Send as a gift (gems)"
                      aria-label="Send as a gift"
                      className="rounded-lg px-2.5 py-2 transition-all flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5"
                      style={{
                        backgroundColor: "var(--app-bg-tertiary, #1e1f22)",
                        border: "1px solid rgba(244,114,182,0.4)",
                      }}
                    >
                      <img
                        src={giftIcon}
                        alt=""
                        className="h-[18px] w-[18px]"
                        style={{
                          filter: "invert(72%) sepia(46%) saturate(2200%) hue-rotate(295deg) brightness(105%) contrast(92%)",
                        }}
                      />
                    </button>
                  </div>
                )}
              </div>
            );
          };

          if (activeTab === "all" || !grouped) {
            return (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map(renderCard)}
              </div>
            );
          }

          const labels = SUBCATEGORY_LABELS[activeTab as string] || {};
          return (
            <div className="space-y-8">
              {grouped.map(([sub, list]) => {
                const meta = labels[sub] || { title: sub.charAt(0).toUpperCase() + sub.slice(1) };
                return (
                  <section key={sub}>
                    <div className="mb-3 flex items-baseline gap-3">
                      <h2 className="text-lg font-extrabold tracking-tight" style={{ color: "var(--app-text-primary)" }}>
                        {meta.title}
                      </h2>
                      {meta.subtitle && (
                        <span className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
                          {meta.subtitle}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)", color: "var(--app-text-secondary)" }}>
                        {list.length}
                      </span>
                    </div>
                    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map(renderCard)}
                    </div>
                  </section>
                );
              })}
            </div>
          );
        })()}
      </div>
      <GiftSendModal
        open={!!giftItem}
        onClose={() => setGiftItem(null)}
        item={giftItem}
        onSent={(item) => {
          setOwned((prev) => prev); // refresh trigger no-op
          toast.success(`Gift sent: ${item.name}`);
        }}
      />
    </div>
  );
};

export default ShopView;
