import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { removeChannelByTopic } from "@/lib/realtimeReconnect";
import { useEntitlements } from "@/hooks/useEntitlements";
import { toast } from "sonner";

/**
 * GemsContext — single source of truth for the user's gem balance.
 * Gems are the *premium* (paid) currency. They are purchased in real money
 * via Stripe (see `stripe-create-gems-purchase`) and spent on gifts and
 * select shop items priced with `price_gems`.
 */

interface GemsContextValue {
  balance: number;
  loading: boolean;
  refreshBalance: () => Promise<void>;
}

const GemsContext = createContext<GemsContextValue>({
  balance: 0,
  loading: true,
  refreshBalance: async () => {},
});

export const useGems = () => useContext(GemsContext);

export const GemsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const ent = useEntitlements();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshBalance = useCallback(async () => {
    if (!user) {
      setBalance(0);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("gems_balances")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();
    setBalance(data?.balance ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  // Standard Honey gets 500 gems/month. The RPC is idempotent for the current
  // calendar month, so it is safe to call after every app update/login.
  useEffect(() => {
    if (!user || !ent.loaded || !ent.isHoney) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("claim_honey_monthly_gems");
      if (cancelled || error) return;
      const payload = data as any;
      if (payload?.granted) {
        setBalance(Number(payload.balance ?? 0));
        toast.success("Honey added 500 gems to your balance");
      } else {
        await refreshBalance();
      }
    })();
    return () => { cancelled = true; };
  }, [user, ent.loaded, ent.isHoney, refreshBalance]);

  useEffect(() => {
    if (!user) return;
    removeChannelByTopic(`gems:${user.id}`);
    const channel = supabase
      .channel(`gems:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gems_balances", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new as any)?.balance;
          if (typeof next === "number") setBalance(next);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <GemsContext.Provider value={{ balance, loading, refreshBalance }}>
      {children}
    </GemsContext.Provider>
  );
};
