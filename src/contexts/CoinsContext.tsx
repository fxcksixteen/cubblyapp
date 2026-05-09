import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { removeChannelByTopic } from "@/lib/realtimeReconnect";
import { toast } from "sonner";
import { playSound } from "@/lib/sounds";
import coinRewardedIcon from "@/assets/coins/coin-rewarded.png";

/**
 * CoinsContext — single source of truth for the user's coin balance, the
 * earning heartbeat, and the realtime reward toast.
 *
 * Earning rules (server-enforced in `accrue_activity_coins` + the messages
 * trigger):
 *   - 10 coins per 100 messages sent  (DB trigger)
 *   - 10 coins per 30 minutes in voice/calls
 *   - 20 coins per 30 minutes actively PLAYING a game
 */

interface CoinsContextValue {
  balance: number;
  loading: boolean;
  /** Mark voice activity ON/OFF — the heartbeat will accrue seconds while ON. */
  setVoiceActive: (active: boolean) => void;
  /** Mark gaming activity ON/OFF — the heartbeat will accrue seconds while ON. */
  setGamingActive: (active: boolean) => void;
  refreshBalance: () => Promise<void>;
}

const CoinsContext = createContext<CoinsContextValue>({
  balance: 0,
  loading: true,
  setVoiceActive: () => {},
  setGamingActive: () => {},
  refreshBalance: async () => {},
});

export const useCoins = () => useContext(CoinsContext);

const HEARTBEAT_MS = 60_000; // accrue & flush once per minute

const REASON_COPY: Record<string, { label: string; sub: string }> = {
  voice_minutes: { label: "Coins earned!", sub: "From your time in voice chat" },
  messages: { label: "Coins earned!", sub: "From your messages" },
  gaming_minutes: { label: "Coins earned!", sub: "From your gaming time" },
  signup_bonus: { label: "Welcome bonus!", sub: "Thanks for joining Cubbly" },
  admin_grant: { label: "Coins granted!", sub: "From the Cubbly team" },
};

function RewardToast({ amount, reason }: { amount: number; reason: string }) {
  const copy = REASON_COPY[reason] ?? { label: "Coins earned!", sub: "" };
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#2b2d31] border border-[#3f4147] px-3 py-2.5 shadow-2xl shadow-black/40 min-w-[260px]">
      <img src={coinRewardedIcon} alt="" className="h-11 w-11 shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-bold text-white leading-tight">{copy.label}</div>
        {copy.sub && <div className="text-[11px] text-[#b5bac1] mt-0.5 truncate">{copy.sub}</div>}
      </div>
      <div className="flex items-baseline gap-1 shrink-0">
        <span className="text-[15px] font-extrabold text-[#facc15]">+{amount}</span>
      </div>
    </div>
  );
}

export const CoinsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  // Track whether we're currently active so the heartbeat knows to accrue.
  const voiceActiveRef = useRef(false);
  const gamingActiveRef = useRef(false);

  // When was the last heartbeat — used to compute exact seconds since
  // (more accurate than assuming exactly HEARTBEAT_MS elapsed, e.g. if the
  // tab was backgrounded).
  const lastTickRef = useRef<number>(Date.now());

  const setVoiceActive = useCallback((active: boolean) => {
    voiceActiveRef.current = active;
    // Reset the tick timer when activity flips on so we don't accrue stale time.
    if (active) lastTickRef.current = Date.now();
  }, []);

  const setGamingActive = useCallback((active: boolean) => {
    gamingActiveRef.current = active;
    if (active) lastTickRef.current = Date.now();
  }, []);

  // Initial balance load
  const refreshBalance = useCallback(async () => {
    if (!user) {
      setBalance(0);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_coins")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle();
    setBalance(data?.balance ?? 0);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  // Realtime: balance updates + reward toasts.
  useEffect(() => {
    if (!user) return;
    removeChannelByTopic(`coins:${user.id}`);
    const channel = supabase
      .channel(`coins:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_coins", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = (payload.new as any)?.balance;
          if (typeof next === "number") setBalance(next);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "coin_transactions", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { amount: number; reason: string };
          // Only show a toast for *positive* awards. Spends (negative) don't toast.
          if (row.amount > 0 && row.reason !== "signup_bonus") {
            playSound("coinsReceive", { volume: 0.5 });
            toast.custom(() => <RewardToast amount={row.amount} reason={row.reason} />, {
              duration: 4000,
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Heartbeat: every minute, send accrued seconds to the server.
  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(async () => {
      const now = Date.now();
      const elapsed = Math.min(600, Math.max(0, Math.round((now - lastTickRef.current) / 1000)));
      lastTickRef.current = now;
      const voiceSec = voiceActiveRef.current ? elapsed : 0;
      const gameSec = gamingActiveRef.current ? elapsed : 0;
      if (voiceSec === 0 && gameSec === 0) return;
      try {
        await supabase.rpc("accrue_activity_coins", {
          _voice_seconds: voiceSec,
          _gaming_seconds: gameSec,
        });
      } catch (err) {
        // Network blip — drop this tick rather than double-counting.
        console.warn("[coins] accrue failed:", err);
      }
    }, HEARTBEAT_MS);
    return () => window.clearInterval(interval);
  }, [user]);

  return (
    <CoinsContext.Provider value={{ balance, loading, setVoiceActive, setGamingActive, refreshBalance }}>
      {children}
    </CoinsContext.Provider>
  );
};
