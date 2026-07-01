import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ShopItemPreview as ItemPreview } from "@/components/app/shop/ShopItemPreview";

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
  const wishlistBusyRef = useRef<Set<string>>(new Set());

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

  // Effective price for sorting — gems items win on price_gems, coin items on price.
  const effPrice = (it: ShopItem) => (it.price_gems != null ? it.price_gems : it.price);

  const visible = useMemo(
    () => {
      const base = activeTab === "all"
        ? items
        : activeTab === "wishlist"
          ? items.filter((i) => wishlist.has(i.id))
          : items.filter((i) => i.category === activeTab);
      // Cheapest first within each subcategory (stable via sort_order fallback)
      return [...base].sort((a, b) => {
        const ap = effPrice(a);
        const bp = effPrice(b);
        if (ap !== bp) return ap - bp;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
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
    // visible is already cheapest-first, so groups inherit that order.
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
    const isAnimatedCosmetic = (item.category === "theme" || item.category === "name_color") && item.subcategory === "animated";
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
    if (!isEq && isAnimatedCosmetic && !ent.isHoney) {
      toast.error(item.category === "name_color" ? "Motion name colors are a Standard Honey perk" : "Animated themes are a Standard Honey perk");
      return;
    }
    const { error } = await supabase.rpc(isEq ? "unequip_shop_item" : "equip_shop_item", { _item_id: item.id });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("BADGE_LIMIT")) toast.error(`You can equip up to ${ent.maxEquippedBadges} badge${ent.maxEquippedBadges === 1 ? "" : "s"}`);
      else if (msg.includes("HONEY_REQUIRED")) toast.error("That perk requires Standard Honey");
      else toast.error("Couldn't update equipped item");
      return;
    }
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
    if (!isEq && ent.isHoney && isAnimatedCosmetic) {
      setOwned((prev) => new Set(prev).add(item.id));
    }
    if (item.category === "theme") setTheme(isEq ? "default" : (THEME_ITEM_MAP[item.id] || "default"));
    toast.success(isEq ? `Unequipped ${item.name}` : `Equipped ${item.name}`);
  };

  const toggleWishlist = async (item: ShopItem) => {
    if (!user) return;
    // v0.4.0: per-item busy guard so rapid taps can't fire concurrent RPCs.
    if (wishlistBusyRef.current.has(item.id)) return;
    wishlistBusyRef.current.add(item.id);
    const isWished = wishlist.has(item.id);
    setWishlist((prev) => {
      const next = new Set(prev);
      if (isWished) next.delete(item.id); else next.add(item.id);
      return next;
    });
    try {
      if (isWished) {
        const { error } = await supabase.from("wishlist_items").delete().eq("user_id", user.id).eq("item_id", item.id);
        if (error) toast.error("Couldn't update wishlist");
      } else {
        const { error } = await supabase.from("wishlist_items").insert({ user_id: user.id, item_id: item.id });
        if (error) toast.error("Couldn't update wishlist");
      }
    } finally {
      wishlistBusyRef.current.delete(item.id);
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
            const isAnimatedCosmetic = (item.category === "theme" || item.category === "name_color") && item.subcategory === "animated";
            const honeyIncluded = ent.isHoney && isAnimatedCosmetic;
            const canEquip = isOwned || honeyIncluded;
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
                {!canEquip && (
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
                {canEquip ? (
                  <button
                    onClick={() => toggleEquip(item)}
                    className="mt-3 w-full rounded-lg py-2 text-sm font-bold transition-all"
                    style={{
                      backgroundColor: isEq ? "#3ba55c" : "var(--app-bg-tertiary, #1e1f22)",
                      color: "white",
                    }}
                  >
                    {isEq ? "Equipped" : honeyIncluded && !isOwned ? "Use with Honey" : "Equip"}
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
