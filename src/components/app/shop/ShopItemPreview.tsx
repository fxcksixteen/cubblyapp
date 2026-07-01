import imgChatChampion from "@/assets/badges/chat_champion.svg";
import imgEarlySupporter from "@/assets/badges/early_supporter.svg";
import imgFriendly from "@/assets/badges/friendly.svg";
import imgGamer from "@/assets/badges/gamer.png";
import imgLegend from "@/assets/badges/legend.svg";
import imgNightOwl from "@/assets/badges/night_owl.svg";
import imgOg from "@/assets/badges/og.png";
import imgPetite from "@/assets/badges/petite.svg";
import imgVoiceVeteran from "@/assets/badges/voice_veteran.svg";

export const BADGE_ART: Record<string, string> = {
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

export interface ShopItemLike {
  id: string;
  category: string;
  subcategory: string | null;
  name: string;
  config: any;
}

interface ShopItemPreviewProps {
  item: ShopItemLike;
  displayName: string;
  /** Tailwind classes controlling the outer preview box. Defaults to shop-grid size. */
  sizeClass?: string;
  /** When true, hides secondary text in previews so only the essential visual shows. */
  compact?: boolean;
}

/** Renders a small visual preview matching the item type. Shared by shop grid and wishlist. */
export function ShopItemPreview({ item, displayName, sizeClass = "h-20 w-full rounded-lg", compact = false }: ShopItemPreviewProps) {
  const name = displayName || "YourName";
  if (item.category === "name_color") {
    if (item.subcategory === "static") {
      return (
        <div className={`flex items-center justify-center bg-[#1e1f22] px-3 ${sizeClass}`}>
          <span className={`${compact ? "text-sm" : "text-lg"} font-extrabold truncate`} style={{ color: item.config?.color }}>
            {name}
          </span>
        </div>
      );
    }
    if (item.subcategory === "gradient") {
      return (
        <div className={`flex items-center justify-center bg-[#1e1f22] px-3 ${sizeClass}`}>
          <span
            className={`${compact ? "text-sm" : "text-lg"} font-extrabold bg-clip-text text-transparent truncate`}
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
        <div className={`flex items-center justify-center bg-[#1e1f22] px-3 overflow-hidden ${sizeClass}`}>
          <span
            className={`${compact ? "text-sm" : "text-lg"} font-extrabold bg-clip-text text-transparent relative inline-block ${hasBow ? "" : "truncate"}`}
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
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "radial-gradient(ellipse at 30% 0%, #0d1224, #07080c 60%, #04050a)" }}>
          <div className="absolute inset-0 shop-space-preview-stars" />
          <div className="absolute inset-0 shop-space-preview-shoot" />
        </div>
      );
    }
    if (item.id === "theme_sky_dusk") {
      return (
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "linear-gradient(180deg,#1a3a6e 0%,#3a5a8e 35%,#6b7fa8 65%,#d4a373 100%)" }}>
          <div className="shop-sky-cloud" style={{ top: "22%", animationDuration: "18s" }} />
          <div className="shop-sky-cloud" style={{ top: "48%", animationDuration: "26s", animationDelay: "-8s", transform: "scale(0.7)", opacity: 0.7 }} />
          <div className="shop-sky-cloud" style={{ top: "68%", animationDuration: "22s", animationDelay: "-14s", transform: "scale(1.1)" }} />
        </div>
      );
    }
    if (item.id === "theme_snowy_drift") {
      return (
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "linear-gradient(180deg,#1a2735 0%,#243a52 60%,#3a5470 100%)" }}>
          <div className="absolute inset-0 shop-snow-layer" />
          <div className="absolute inset-0 shop-snow-layer" style={{ animationDuration: "5s", opacity: 0.55, backgroundSize: "140px 160px" }} />
        </div>
      );
    }
    if (item.id === "theme_moonlit_hills") {
      return (
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "linear-gradient(180deg,#050818 0%,#0d1426 35%,#1a2244 70%,#2a3358 100%)" }}>
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
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "radial-gradient(ellipse at 30% 20%, #4c1d95 0%, #1e0b3b 50%, #05030f 100%)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 70% 70%, rgba(236,72,153,0.45), transparent 55%), radial-gradient(circle at 25% 40%, rgba(168,85,247,0.4), transparent 55%)", mixBlendMode: "screen", animation: "cb-nebula-pulse 6s ease-in-out infinite" }} />
          <div className="absolute inset-0 shop-preview-stars" style={{ opacity: 0.9 }} />
        </div>
      );
    }
    if (item.id === "theme_cyber_grid") {
      return (
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "linear-gradient(180deg,#05010f 0%,#200a55 45%,#ff2fbf 82%,#ffb15c 100%)" }}>
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
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "radial-gradient(ellipse at 50% 110%, #ff5b1f 0%, #7a1502 35%, #1a0503 100%)" }}>
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(255,140,40,0.6), transparent 65%)", mixBlendMode: "screen", animation: "cb-volcanic-heat 4s ease-in-out infinite" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(2px 2px at 20% 80%,#ffb050,transparent),radial-gradient(1.5px 1.5px at 45% 65%,#ff8030,transparent),radial-gradient(2px 2px at 70% 75%,#ffc060,transparent),radial-gradient(1.5px 1.5px at 30% 40%,#ffb050,transparent),radial-gradient(2px 2px at 85% 55%,#ff9040,transparent)", backgroundSize: "100% 200%", filter: "drop-shadow(0 0 4px rgba(255,140,40,0.8))", animation: "cb-volcanic-embers 5s linear infinite" }} />
        </div>
      );
    }
    if (item.id === "theme_bioluminescent") {
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
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "radial-gradient(ellipse at 50% 15%, #063a75 0%, #021640 55%, #01081c 100%)" }}>
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
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "linear-gradient(180deg,#01102a 0%,#03215a 55%,#042038 100%)" }}>
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(1px 1px at 12% 18%,#fff,transparent),radial-gradient(1px 1px at 44% 10%,#e0f2fe,transparent),radial-gradient(1px 1px at 78% 22%,#fff,transparent)", opacity: 0.9 }} />
          {curtain("2%", "70%", "0s", "6s", "rgba(52,211,153,0.75)", "rgba(59,130,246,0.6)", 0.95)}
          {curtain("6%", "60%", "-2s", "8s", "rgba(168,85,247,0.55)", "rgba(52,211,153,0.5)", 0.8)}
          {curtain("0%", "78%", "-4s", "11s", "rgba(94,234,212,0.5)", "rgba(147,197,253,0.45)", 0.65)}
          <div className="absolute left-0 right-0" style={{ bottom: "35%", height: "22%", background: "radial-gradient(ellipse at 50% 100%, rgba(52,211,153,0.55), transparent 70%)", filter: "blur(6px)", mixBlendMode: "screen" }} />
          <div className="absolute left-0 right-0 bottom-0" style={{ height: "40%", background: "#031225", clipPath: "polygon(0 55%, 20% 40%, 40% 55%, 60% 30%, 80% 55%, 100% 45%, 100% 100%, 0 100%)" }} />
        </div>
      );
    }
    if (item.id === "theme_sakura_storm") {
      return (
        <div className={`relative overflow-hidden ${sizeClass}`} style={{ background: "linear-gradient(180deg,#2a0e30 0%,#5c1846 40%,#c86e94 80%,#f4c1a6 100%)" }}>
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
        className={`${sizeClass} ${animated ? "shop-theme-aurora" : ""}`}
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
      <div className={`flex items-center justify-center gap-3 bg-[#1e1f22] px-3 ${sizeClass}`}>
        {art ? (
          <img
            src={art}
            alt={item.name}
            draggable={false}
            className={`${compact ? "h-10 w-10" : "h-14 w-14"} object-contain shrink-0`}
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
        {!compact && (
          <span className="text-base font-extrabold truncate" style={{ color: "#fff" }}>
            {name}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-[#5865f2] to-[#a855f7] ${sizeClass}`}>
      <span className={`${compact ? "text-xl" : "text-3xl"} font-black text-white drop-shadow`}>{item.name[0]}</span>
    </div>
  );
}

export default ShopItemPreview;
