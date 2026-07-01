import { useEffect, useMemo, useState } from "react";
import { Lock, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import imgChatChampion from "@/assets/badges/chat_champion.svg";
import imgEarlySupporter from "@/assets/badges/early_supporter.svg";
import imgFriendly from "@/assets/badges/friendly.svg";
import imgGamer from "@/assets/badges/gamer.png";
import imgLegend from "@/assets/badges/legend.svg";
import imgNightOwl from "@/assets/badges/night_owl.svg";
import imgOg from "@/assets/badges/og.png";
import imgPetite from "@/assets/badges/petite.svg";
import imgVoiceVeteran from "@/assets/badges/voice_veteran.svg";

/**
 * Shows every shop item in a category — owned items are interactive and can
 * be equipped/unequipped, while locked items render blurred with a lock badge
 * and route to the shop on click.
 *
 * Used inside Settings → Appearance (themes) and Settings → My Account
 * (name colors + badges) so users can preview the entire catalog without
 * jumping to the shop, and equip anything they already own straight from
 * the same place.
 */
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

function ItemPreview({ item, displayName }: { item: ShopItem; displayName: string }) {
  const name = displayName || "YourName";
  if (item.category === "name_color") {
    if (item.subcategory === "static") {
      return (
        <div className="flex h-16 w-full items-center justify-center rounded-lg bg-[#1e1f22] px-3">
          <span className="text-base font-extrabold truncate" style={{ color: item.config?.color }}>{name}</span>
        </div>
      );
    }
    if (item.subcategory === "gradient") {
      return (
        <div className="flex h-16 w-full items-center justify-center rounded-lg bg-[#1e1f22] px-3">
          <span
            className="text-base font-extrabold bg-clip-text text-transparent truncate"
            style={{ backgroundImage: `linear-gradient(90deg, ${item.config?.from}, ${item.config?.to})` }}
          >
            {name}
          </span>
        </div>
      );
    }
    if (item.subcategory === "animated") {
      const stops = (item.config?.stops as string[]) ?? ["#22d3ee", "#a855f7", "#ec4899", "#22d3ee"];
      const rawIconUrl = typeof item.config?.icon_url === "string" ? item.config.icon_url : undefined;
      // v0.4.2: Electron file:// self-heal — rewrite "/assets/..." to "./assets/..."
      const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI;
      const iconUrl = rawIconUrl && isElectron && rawIconUrl.startsWith("/")
        ? `.${rawIconUrl}`
        : rawIconUrl;
      const hasBow = !!item.config?.bow;
      const iconSrc = iconUrl || (hasBow ? imgPetite : null);
      const hasIcon = !!iconSrc;
      return (
        <div className="flex h-16 w-full items-center justify-center rounded-lg bg-[#1e1f22] px-3 overflow-hidden">
          <span
            className={`text-base font-extrabold bg-clip-text text-transparent shop-animated-name relative inline-block ${hasIcon ? "" : "truncate"}`}
            style={{
              backgroundImage: `linear-gradient(90deg, ${stops.join(",")})`,
              backgroundSize: "300% 100%",
              overflow: "visible",
              paddingTop: hasIcon ? (iconUrl ? "0.45em" : "0.35em") : undefined,
            }}
          >
            {name}
            {iconSrc && (
              <img
                src={iconSrc}
                alt=""
                aria-hidden="true"
                draggable={false}
                style={{ position: "absolute", top: iconUrl ? "-0.06em" : "0.32em", left: iconUrl ? "-0.58em" : "-0.25em", height: iconUrl ? "1.08em" : "0.75em", width: "auto", pointerEvents: "none", filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))", transform: iconUrl ? "none" : "rotate(-18deg)", transformOrigin: "bottom left" }}
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
        <div className="relative h-16 w-full rounded-lg overflow-hidden" style={{ background: "radial-gradient(ellipse at 30% 0%, #0d1224, #07080c 60%, #04050a)" }}>
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
        className={`h-16 w-full rounded-lg ${animated ? "shop-theme-aurora" : ""}`}
        style={{ backgroundImage: bg, backgroundSize: animated ? "300% 300%" : undefined }}
      />
    );
  }

  if (item.category === "badge") {
    const art = BADGE_ART[item.id];
    if (art) {
      return (
        <div className="flex h-16 w-full items-center justify-center rounded-lg bg-[#1e1f22]">
          <img src={art} alt={item.name} className="h-12 w-12 object-contain" draggable={false} />
        </div>
      );
    }
    const cfg = item.config || {};
    return (
      <div className="flex h-16 w-full items-center justify-center rounded-lg bg-[#1e1f22]">
        <span
          className="inline-flex items-center justify-center rounded-md"
          style={{
            width: 30, height: 30,
            backgroundColor: cfg.bg ?? "#3f4147",
            color: cfg.fg ?? "#fff",
            boxShadow: cfg.glow ? `0 0 10px ${cfg.glow}66` : undefined,
            fontWeight: 800, fontSize: 16,
          }}
        >★</span>
      </div>
    );
  }

  return (
    <div className="flex h-16 w-full items-center justify-center rounded-lg bg-gradient-to-br from-[#5865f2] to-[#a855f7]">
      <span className="text-2xl font-black text-white">{item.name[0]}</span>
    </div>
  );
}

interface Props {
  category: Category;
  /** Empty-state message when the catalog has no items in this category. */
  emptyLabel?: string;
}

const ShopItemsGrid = ({ category, emptyLabel = "No items yet" }: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [equipped, setEquipped] = useState<Set<string>>(new Set());
  const [displayName, setDisplayName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      const [{ data: catalog }, { data: inv }, { data: eq }, { data: prof }] = await Promise.all([
        supabase
          .from("shop_items")
          .select("*")
          .eq("category", category)
          .order("price", { ascending: true })
          .order("sort_order", { ascending: true }),
        user
          ? supabase.from("user_inventory").select("item_id").eq("user_id", user.id)
          : Promise.resolve({ data: [] as any[] }),
        user
          ? supabase.from("user_equipped").select("item_id").eq("user_id", user.id)
          : Promise.resolve({ data: [] as any[] }),
        user
          ? supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!alive) return;
      // v0.3.17: rebrand "Petite" → "Cute" globally in the shop UI.
      const remapped = ((catalog as ShopItem[]) ?? []).map((it) =>
        it.id === "badge_petite"
          ? { ...it, name: "Cute", description: "Adorable through and through." }
          : it,
      );
      setItems(remapped);
      setOwned(new Set((inv ?? []).map((r: any) => r.item_id)));
      setEquipped(new Set((eq ?? []).map((r: any) => r.item_id)));
      setDisplayName((prof as any)?.display_name || "");
      setLoading(false);
    };
    load();
    const onEquippedChanged = () => load();
    window.addEventListener("cubbly:shop-equipped-changed", onEquippedChanged);
    return () => { alive = false; window.removeEventListener("cubbly:shop-equipped-changed", onEquippedChanged); };
  }, [user, category]);

  // Live-sync owned + equipped sets so equipping in Shop reflects here too.
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`settings-shop:${category}:${user.id}`)
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
    return () => { supabase.removeChannel(ch); };
  }, [user, category]);

  const groups = useMemo(() => {
    const map = new Map<string, ShopItem[]>();
    for (const it of items) {
      const key = it.subcategory || "other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries());
  }, [items]);

  const toggleEquip = async (item: ShopItem) => {
    const isEq = equipped.has(item.id);
    // Client-side guard for the 3-badge cap so users get a clear toast
    // instead of a silent unique-constraint failure on slot 0.
    if (!isEq && item.category === "badge") {
      const equippedBadges = items.filter((i) => i.category === "badge" && equipped.has(i.id)).length;
      if (equippedBadges >= 3) {
        toast.error("You can only equip 3 badges. Unequip one first.");
        return;
      }
    }
    const { error } = await supabase.rpc(isEq ? "unequip_shop_item" : "equip_shop_item", { _item_id: item.id });
    if (error) { toast.error("Couldn't update equipped item"); return; }
    if (item.category === "theme" || item.category === "name_color") {
      setEquipped((prev) => {
        const next = new Set(prev);
        items.filter((i) => i.category === item.category).forEach((i) => next.delete(i.id));
        if (!isEq) next.add(item.id);
        return next;
      });
      window.dispatchEvent(new CustomEvent("cubbly:shop-equipped-changed", { detail: { category: item.category } }));
    }
    toast.success(isEq ? `Unequipped ${item.name}` : `Equipped ${item.name}`);
  };

  const goToShop = () => {
    navigate(`/@me/shop#tab=${category}`);
  };

  if (loading) {
    return <div className="text-sm" style={{ color: "var(--app-text-secondary)" }}>Loading…</div>;
  }
  if (items.length === 0) {
    return <div className="text-sm" style={{ color: "var(--app-text-secondary)" }}>{emptyLabel}</div>;
  }

  return (
    <div className="space-y-6">
      {groups.map(([sub, list]) => (
        <div key={sub} className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
            {sub === "other" ? "Items" : sub.replace(/_/g, " ")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((item) => {
              const isOwned = owned.has(item.id);
              const isEquipped = equipped.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => (isOwned ? toggleEquip(item) : goToShop())}
                  className="group relative overflow-hidden rounded-2xl border p-3 text-left transition-all duration-150 hover:-translate-y-0.5"
                  style={{
                    backgroundColor: "var(--app-bg-secondary)",
                    borderColor: isEquipped ? "#5865f2" : "var(--app-border)",
                    boxShadow: isEquipped ? "0 0 0 2px rgba(88,101,242,0.25)" : "none",
                  }}
                  title={isOwned ? (isEquipped ? "Click to unequip" : "Click to equip") : "Locked — click to view in Shop"}
                >
                  <div className={isOwned ? "" : "blur-[2px] saturate-50 opacity-70"}>
                    <ItemPreview item={item} displayName={displayName} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {isOwned ? (
                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${isEquipped ? "border-[#5865f2] bg-[#5865f2]" : "border-[#72767d]"}`}>
                        {isEquipped && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                    ) : (
                      <Lock className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
                    )}
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{item.name}</p>
                  </div>
                  {!isOwned && (
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
                      {item.config?.gems_only && item.price_gems ? `${item.price_gems.toLocaleString()} gems` : `${item.price.toLocaleString()} coins`} · Tap to unlock
                    </p>
                  )}
                  {!isOwned && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full bg-black/55 p-2 backdrop-blur-sm">
                        <Lock className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ShopItemsGrid;
