import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CustomStatus = { text: string; emoji: string | null };

/**
 * Batch-loads the `custom_statuses` rows for a set of users and keeps them
 * fresh over realtime. Expired statuses are treated as absent.
 *
 * Statuses are readable by any authenticated user, so this is safe to call for
 * friends, DM partners and server members alike.
 */
export function useCustomStatuses(userIds: (string | null | undefined)[]) {
  const [statuses, setStatuses] = useState<Record<string, CustomStatus>>({});
  const idsKey = useMemo(
    () => Array.from(new Set(userIds.filter(Boolean) as string[])).sort().join(","),
    [userIds],
  );
  const idsRef = useRef<string[]>([]);
  idsRef.current = idsKey ? idsKey.split(",") : [];

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (ids.length === 0) { setStatuses({}); return; }
    let alive = true;

    const load = () => {
      supabase
        .from("custom_statuses")
        .select("user_id, text, emoji, expires_at")
        .in("user_id", ids)
        .then(({ data }) => {
          if (!alive) return;
          const next: Record<string, CustomStatus> = {};
          (data || []).forEach((row: any) => {
            if (!row?.user_id) return;
            if (!row.text && !row.emoji) return;
            if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return;
            next[row.user_id] = { text: row.text || "", emoji: row.emoji ?? null };
          });
          setStatuses(next);
        });
    };

    load();
    const channel = supabase
      .channel(`custom-statuses:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "custom_statuses" },
        (payload: any) => {
          const uid = (payload.new || payload.old)?.user_id;
          if (uid && idsRef.current.includes(uid)) load();
        },
      )
      .subscribe();

    return () => { alive = false; supabase.removeChannel(channel); };
  }, [idsKey]);

  return statuses;
}

/** Single-user convenience wrapper. */
export function useCustomStatus(userId: string | null | undefined) {
  const ids = useMemo(() => [userId], [userId]);
  const map = useCustomStatuses(ids);
  return userId ? map[userId] ?? null : null;
}
