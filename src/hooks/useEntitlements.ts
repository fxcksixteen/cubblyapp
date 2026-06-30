import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type SubscriptionTier = "free" | "basic" | "honey";

export interface Entitlements {
  tier: SubscriptionTier;
  isHoney: boolean;             // honey (top tier) only
  isHoneyMember: boolean;       // basic OR honey
  coinMultiplier: number;       // 1 or 2
  maxEquippedBadges: number;    // 1 | 2 | 3
  maxNotes: number | null;      // null = unlimited
  attachmentCapMB: number;      // 25 | 100 | 250
  messageCapChars: number;      // 2000 | 4000 | 8000
  canUseMotionNameColors: boolean;
  canUseAnimatedThemes: boolean;
  canShareNoteAdvanced: boolean; // live edit, allow-save
  monthlyGems: number;           // 0 | 0 | 500
  loaded: boolean;
}

const FREE: Entitlements = {
  tier: "free",
  isHoney: false,
  isHoneyMember: false,
  coinMultiplier: 1,
  maxEquippedBadges: 1,
  maxNotes: 10,
  attachmentCapMB: 25,
  messageCapChars: 2000,
  canUseMotionNameColors: false,
  canUseAnimatedThemes: false,
  canShareNoteAdvanced: false,
  monthlyGems: 0,
  loaded: false,
};

function fromTier(tier: SubscriptionTier): Entitlements {
  if (tier === "honey") {
    return {
      tier, isHoney: true, isHoneyMember: true,
      coinMultiplier: 2, maxEquippedBadges: 3, maxNotes: null,
      attachmentCapMB: 250, messageCapChars: 8000,
      canUseMotionNameColors: true, canUseAnimatedThemes: true,
      canShareNoteAdvanced: true, monthlyGems: 500, loaded: true,
    };
  }
  if (tier === "basic") {
    return {
      tier, isHoney: false, isHoneyMember: true,
      coinMultiplier: 2, maxEquippedBadges: 2, maxNotes: null,
      attachmentCapMB: 100, messageCapChars: 4000,
      canUseMotionNameColors: true, canUseAnimatedThemes: true,
      canShareNoteAdvanced: true, monthlyGems: 0, loaded: true,
    };
  }
  return { ...FREE, loaded: true };
}

export function useEntitlements(): Entitlements {
  const { user } = useAuth();
  const [ent, setEnt] = useState<Entitlements>(FREE);

  useEffect(() => {
    if (!user) { setEnt({ ...FREE, loaded: true }); return; }
    let cancelled = false;

    const fetchTier = async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("tier, status, current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const active = data && ["active", "trialing"].includes(data.status as string)
        && (!data.current_period_end || new Date(data.current_period_end as string) > new Date());
      setEnt(fromTier(active ? (data!.tier as SubscriptionTier) : "free"));
    };

    fetchTier();

    const channel = supabase
      .channel(`subs-${user.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` }, fetchTier)
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user]);

  return ent;
}
