import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCoins } from "@/contexts/CoinsContext";
import { toast } from "sonner";
import shopIcon from "@/assets/icons/shop.svg";
import coinStack from "@/assets/coins/coin-stack.png";
import coinNotEnough from "@/assets/coins/coin-not-enough.png";

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
    const isAurora = item.id.includes("aurora");
    return (
      <div
        className={`h-20 w-full rounded-lg ${isAurora ? "shop-theme-aurora" : ""}`}
        style={{
          background: isAurora
            ? "linear-gradient(120deg, #0f172a, #1e1b4b, #312e81, #0f172a)"
            : "linear-gradient(135deg, #f59e0b, #ef4444, #ec4899)",
          backgroundSize: isAurora ? "300% 300%" : undefined,
        }}
      />
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
  const [items, setItems] = useState<ShopItem[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Category | "all">("all");
  const [displayName, setDisplayName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  // Load catalog + inventory
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [{ data: catalog }, { data: inv }] = await Promise.all([
        supabase.from("shop_items").select("*").order("sort_order", { ascending: true }),
        user
          ? supabase.from("user_inventory").select("item_id").eq("user_id", user.id)
          : Promise.resolve({ data: [] as { item_id: string }[] }),
      ]);
      if (!alive) return;
      setItems((catalog as ShopItem[]) ?? []);
      setOwned(new Set((inv ?? []).map((r: any) => r.item_id)));
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
    toast.success(`Unlocked: ${item.name}`);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      <style>{`
        @keyframes shopAnimatedName { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .shop-animated-name { animation: shopAnimatedName 6s ease-in-out infinite; }
        @keyframes shopThemeAurora { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .shop-theme-aurora { animation: shopThemeAurora 10s ease infinite; }
      `}</style>

      {/* Hero */}
      <div className="relative px-6 sm:px-10 py-8 border-b" style={{ borderColor: "var(--app-border, #3f4147)" }}>
        <div className="absolute inset-0 opacity-30 pointer-events-none"
             style={{ background: "radial-gradient(circle at 20% 0%, #facc1530, transparent 60%), radial-gradient(circle at 80% 100%, #5865f230, transparent 60%)" }} />
        <div className="relative flex items-center gap-4">
          <img
            src={shopIcon}
            alt=""
            className="h-10 w-10"
            style={{ filter: "brightness(0) saturate(100%) invert(85%) sepia(60%) saturate(900%) hue-rotate(358deg) brightness(102%) contrast(98%)" }}
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ color: "var(--app-text-primary)" }}>
              Cubbly Shop
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--app-text-secondary)" }}>
              Earn coins by chatting, calling, and gaming. Spend them on cosmetics that show off who you are.
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-full px-3 py-2"
               style={{ backgroundColor: "var(--app-bg-tertiary, #1e1f22)", border: "1px solid var(--app-border, #3f4147)" }}>
            <img src={coinStack} alt="" className="h-6 w-6" />
            <span className="font-extrabold text-lg tabular-nums" style={{ color: "#facc15" }}>
              {balance.toLocaleString()}
            </span>
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
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((item) => {
              const isOwned = owned.has(item.id);
              const canAfford = balance >= item.price;
              const isBusy = purchasing === item.id;
              return (
                <div
                  key={item.id}
                  className="group rounded-2xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  style={{
                    backgroundColor: "var(--app-bg-secondary, #2b2d31)",
                    border: "1px solid var(--app-border, #3f4147)",
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
                  <button
                    onClick={() => buy(item)}
                    disabled={isOwned || isBusy}
                    className="mt-3 w-full rounded-lg py-2 text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: isOwned
                        ? "var(--app-bg-tertiary, #1e1f22)"
                        : canAfford
                        ? "#5865f2"
                        : "var(--app-bg-tertiary, #1e1f22)",
                      color: isOwned ? "var(--app-text-secondary)" : "white",
                    }}
                  >
                    {isOwned ? (
                      "Owned"
                    ) : (
                      <>
                        <img src={canAfford ? coinStack : coinNotEnough} alt="" className="h-6 w-6 -my-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
                        <span>{item.price.toLocaleString()}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShopView;
