import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * UserBadgesContext — fetches each user's currently-equipped badges (joined to
 * the shop_items.config) and caches them across the app. Components call
 * useUserBadges().request(userId) to lazily load, then read with .get(userId).
 */

export interface BadgeData {
  id: string;
  icon: string;
  bg: string;
  fg: string;
  glow?: string;
  label: string;
  description?: string;
}

interface Ctx {
  get: (userId: string | null | undefined) => BadgeData[];
  request: (userId: string) => void;
}

const UserBadgesContext = createContext<Ctx>({ get: () => [], request: () => {} });
export const useUserBadges = () => useContext(UserBadgesContext);

function rowsToBadges(rows: any[]): BadgeData[] {
  return rows
    .map((r) => {
      const item = r.shop_items;
      if (!item || item.category !== "badge") return null;
      const cfg = item.config ?? {};
      return {
        id: r.item_id,
        icon: cfg.icon ?? "star",
        bg: cfg.bg ?? "#3f4147",
        fg: cfg.fg ?? "#ffffff",
        glow: cfg.glow,
        label: cfg.label ?? item.name ?? "Badge",
        description: item.description ?? cfg.description ?? undefined,
      } as BadgeData;
    })
    .filter(Boolean) as BadgeData[];
}

export const UserBadgesProvider = ({ children }: { children: ReactNode }) => {
  const [badges, setBadges] = useState<Map<string, BadgeData[]>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  const fetchPending = useCallback(async () => {
    const ids = Array.from(pendingRef.current);
    pendingRef.current.clear();
    if (ids.length === 0) return;

    const { data } = await supabase
      .from("user_equipped")
      .select("user_id, item_id, slot, shop_items(category, config, name)")
      .eq("category", "badge")
      .in("user_id", ids)
      .order("slot", { ascending: true });

    setBadges((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.set(id, []);
      const grouped = new Map<string, any[]>();
      for (const row of (data ?? []) as any[]) {
        if (!grouped.has(row.user_id)) grouped.set(row.user_id, []);
        grouped.get(row.user_id)!.push(row);
      }
      grouped.forEach((rows, uid) => next.set(uid, rowsToBadges(rows)));
      return next;
    });
  }, []);

  const request = useCallback(
    (userId: string) => {
      if (!userId || badges.has(userId) || pendingRef.current.has(userId)) return;
      pendingRef.current.add(userId);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(fetchPending, 80);
    },
    [badges, fetchPending]
  );

  const get = useCallback(
    (userId: string | null | undefined) => (userId ? badges.get(userId) ?? [] : []),
    [badges]
  );

  // Realtime: any badge equip/unequip drops & refetches that user
  useEffect(() => {
    // Drop any pre-existing channel with this topic (HMR / strict mode)
    const existing = supabase.getChannels().find((c: any) => c.topic === "realtime:badges-global");
    if (existing) supabase.removeChannel(existing);
    const ch = supabase
      .channel("badges-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_equipped" },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (!row || row.category !== "badge") return;
          setBadges((prev) => {
            if (!prev.has(row.user_id)) return prev;
            const next = new Map(prev);
            next.delete(row.user_id);
            return next;
          });
          pendingRef.current.add(row.user_id);
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(fetchPending, 80);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchPending]);

  return (
    <UserBadgesContext.Provider value={{ get, request }}>{children}</UserBadgesContext.Provider>
  );
};
