import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCoins } from "@/contexts/CoinsContext";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { playSound } from "@/lib/sounds";
import shopIcon from "@/assets/icons/shop.svg";
import coinStack from "@/assets/coins/coin-stack.png";
import coinNotEnough from "@/assets/coins/coin-not-enough.png";
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
};

type Category = "name_color" | "theme" | "badge";

interface ShopItem {
  id: string;
  category: Category;
  subcategory: string | null;
  name: string;
  description: string | null;
  price: number;
  config: any;
  sort_order: number;
}

const TABS: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "name_color", label: "Name Colors" },
  { id: "theme", label: "Themes" },
  { id: "badge", label: "Badges" },
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
      return (
        <div className="flex h-20 w-full items-center justify-center rounded-lg bg-[#1e1f22] px-3">
          <span
            className="text-lg font-extrabold bg-clip-text text-transparent shop-animated-name truncate"
            style={{
              backgroundImage: `linear-gradient(90deg, ${stops.join(",")})`,
              backgroundSize: "300% 100%",
            }}
          >
            {name}
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

const ShopView = () => {
  const { user } = useAuth();
  const { balance } = useCoins();
  const { setTheme } = useTheme();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Category | "all">(() => {
    if (typeof window === "undefined") return "all";
    const m = window.location.hash.match(/tab=(name_color|theme|badge|all)/);
    return (m?.[1] as any) || "all";
  });

  // React to hash changes (deep-links from Settings)
  useEffect(() => {
    const onHash = () => {
      const m = window.location.hash.match(/tab=(name_color|theme|badge|all)/);
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
      const [{ data: catalog }, { data: inv }, { data: eq }] = await Promise.all([
        supabase.from("shop_items").select("*").order("price", { ascending: true }).order("sort_order", { ascending: true }),
        user
          ? supabase.from("user_inventory").select("item_id").eq("user_id", user.id)
          : Promise.resolve({ data: [] as { item_id: string }[] }),
        user
          ? supabase.from("user_equipped").select("item_id").eq("user_id", user.id)
          : Promise.resolve({ data: [] as { item_id: string }[] }),
      ]);
      if (!alive) return;
      setItems((catalog as ShopItem[]) ?? []);
      setOwned(new Set((inv ?? []).map((r: any) => r.item_id)));
      setEquipped(new Set((eq ?? []).map((r: any) => r.item_id)));
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
      .channel(`inv:${user.id}`)
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
    () => (activeTab === "all" ? items : items.filter((i) => i.category === activeTab)),
    [items, activeTab]
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
    if (activeTab === "all") return null;
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
      `}</style>

      {/* Banner ads */}
      <div className="px-6 sm:px-10 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setActiveTab("theme")}
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

          <button
            onClick={() => setActiveTab("name_color")}
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
            const canAfford = balance >= item.price;
            const isBusy = purchasing === item.id;
            return (
              <div
                key={item.id}
                className="group rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                style={{
                  backgroundColor: "var(--app-bg-secondary, #2b2d31)",
                  border: `1px solid ${isEq ? "#5865f2" : "var(--app-border, #3f4147)"}`,
                }}
              >
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
                  <button
                    onClick={() => buy(item)}
                    disabled={isBusy}
                    className="mt-3 w-full rounded-lg py-2 text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: canAfford ? "#5865f2" : "var(--app-bg-tertiary, #1e1f22)",
                      color: "white",
                    }}
                  >
                    <img src={canAfford ? coinStack : coinNotEnough} alt="" className="h-6 w-6 -my-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                    <span>{item.price.toLocaleString()}</span>
                  </button>
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
    </div>
  );
};

export default ShopView;
