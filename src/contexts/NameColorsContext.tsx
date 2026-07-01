import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * NameColorsContext — looks up each user's currently-equipped name color
 * (joined to the shop_items.config) and caches it across the app. Components
 * call useNameColor(userId) to render colored names.
 *
 * Color shape:
 *   { kind: "static",   color: string }
 *   { kind: "gradient", from: string, to: string }
 *   { kind: "animated", stops: string[], duration: string }
 */

export type AnimatedNameStyle = "sweep" | "hueshift" | "conic" | "pulse";

export type NameColor =
  | { kind: "static"; color: string }
  | { kind: "gradient"; from: string; to: string }
  | { kind: "animated"; stops: string[]; duration: string; style?: AnimatedNameStyle; bow?: boolean; iconUrl?: string };

interface Ctx {
  get: (userId: string | null | undefined) => NameColor | null;
  request: (userId: string) => void;
}

const NameColorsContext = createContext<Ctx>({ get: () => null, request: () => {} });
export const useNameColors = () => useContext(NameColorsContext);

function rowToColor(item: any): NameColor | null {
  if (!item) return null;
  const sub = item.subcategory as string | null;
  const cfg = item.config ?? {};
  if (sub === "static" && cfg.color) return { kind: "static", color: cfg.color };
  if (sub === "gradient" && cfg.from && cfg.to)
    return { kind: "gradient", from: cfg.from, to: cfg.to };
  if (sub === "animated" && Array.isArray(cfg.stops))
    return {
      kind: "animated",
      stops: cfg.stops,
      duration: cfg.duration ?? "6s",
      style: (cfg.style as AnimatedNameStyle) ?? "sweep",
      bow: !!cfg.bow,
      iconUrl: typeof cfg.icon_url === "string" ? cfg.icon_url : undefined,
    };
  return null;
}

export const NameColorsProvider = ({ children }: { children: ReactNode }) => {
  const [colors, setColors] = useState<Map<string, NameColor | null>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  const fetchTimerRef = useRef<number | null>(null);

  const fetchPending = useCallback(async () => {
    const ids = Array.from(pendingRef.current);
    pendingRef.current.clear();
    if (ids.length === 0) return;

    const { data } = await supabase
      .from("user_equipped")
      .select("user_id, item_id, shop_items(subcategory, config, category)")
      .eq("category", "name_color")
      .in("user_id", ids);

    setColors((prev) => {
      const next = new Map(prev);
      for (const id of ids) if (!next.has(id)) next.set(id, null);
      for (const row of (data ?? []) as any[]) {
        next.set(row.user_id, rowToColor(row.shop_items));
      }
      return next;
    });
  }, []);

  const request = useCallback(
    (userId: string) => {
      if (!userId || colors.has(userId) || pendingRef.current.has(userId)) return;
      pendingRef.current.add(userId);
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = window.setTimeout(fetchPending, 80);
    },
    [colors, fetchPending]
  );

  const get = useCallback(
    (userId: string | null | undefined) => (userId ? colors.get(userId) ?? null : null),
    [colors]
  );

  // Realtime: when anyone updates their equipped name color, drop & refetch
  useEffect(() => {
    const existing = supabase.getChannels().find((c: any) => c.topic === "realtime:name-colors-global");
    if (existing) supabase.removeChannel(existing);
    const ch = supabase
      .channel("name-colors-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_equipped" },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (!row || row.category !== "name_color") return;
          setColors((prev) => {
            if (!prev.has(row.user_id)) return prev;
            const next = new Map(prev);
            next.delete(row.user_id);
            return next;
          });
          // Re-request so it repopulates
          pendingRef.current.add(row.user_id);
          if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
          fetchTimerRef.current = window.setTimeout(fetchPending, 80);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchPending]);

  return (
    <NameColorsContext.Provider value={{ get, request }}>
      {children}
    </NameColorsContext.Provider>
  );
};
