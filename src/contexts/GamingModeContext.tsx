import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useActivity } from "@/contexts/ActivityContext";

/**
 * Gaming Mode
 * -----------
 * When the user is detected to be in a video game, Cubbly drastically
 * suppresses itself (notification sounds, OS notifications, heavy animations)
 * so it doesn't interfere with the user's gameplay.
 *
 *  - `enabled`            → master toggle (ON by default)
 *  - `affectCallsAndShare`→ if FALSE (default), gaming mode will NOT touch
 *                           active voice calls / screen shares even when active
 *
 * Persisted to localStorage so settings stick across sessions.
 */

const LS_ENABLED = "cubbly:gamingMode:enabled";
const LS_AFFECT_CALLS = "cubbly:gamingMode:affectCalls";

interface GamingModeContextValue {
  /** Master switch (ON by default). */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** Whether suppression should also affect active voice/video/screen calls. OFF by default. */
  affectCallsAndShare: boolean;
  setAffectCallsAndShare: (v: boolean) => void;
  /** True when the current user is detected as actively playing a game. */
  isGaming: boolean;
  /** True when suppression is currently in effect for general app behavior. */
  isSuppressing: boolean;
  /** True when calls/screenshare specifically should also be suppressed. */
  isSuppressingCalls: boolean;
}

const GamingModeContext = createContext<GamingModeContextValue>({
  enabled: true,
  setEnabled: () => {},
  affectCallsAndShare: false,
  setAffectCallsAndShare: () => {},
  isGaming: false,
  isSuppressing: false,
  isSuppressingCalls: false,
});

export const useGamingMode = () => useContext(GamingModeContext);

const readBool = (key: string, fallback: boolean): boolean => {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1" || v === "true";
  } catch {
    return fallback;
  }
};

export const GamingModeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { getActivity } = useActivity();

  const [enabled, setEnabledState] = useState<boolean>(() => readBool(LS_ENABLED, true));
  const [affectCallsAndShare, setAffectCallsAndShareState] = useState<boolean>(() =>
    readBool(LS_AFFECT_CALLS, false)
  );

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(LS_ENABLED, v ? "1" : "0"); } catch {}
  };
  const setAffectCallsAndShare = (v: boolean) => {
    setAffectCallsAndShareState(v);
    try { localStorage.setItem(LS_AFFECT_CALLS, v ? "1" : "0"); } catch {}
  };

  // Derive whether *I* am currently gaming based on my own activity row
  const myActivity = user ? getActivity(user.id) : undefined;
  const isGaming = !!myActivity && myActivity.activity_type === "playing" && !!myActivity.name;

  const isSuppressing = enabled && isGaming;
  const isSuppressingCalls = isSuppressing && affectCallsAndShare;

  // Push the suppression flags onto globals so non-React modules (sounds.ts,
  // notifications.ts) can cheaply check them without subscribing to React.
  useEffect(() => {
    (window as any).__cubblySuppress = isSuppressing;
    (window as any).__cubblySuppressCalls = isSuppressingCalls;
  }, [isSuppressing, isSuppressingCalls]);

  const value = useMemo<GamingModeContextValue>(
    () => ({
      enabled,
      setEnabled,
      affectCallsAndShare,
      setAffectCallsAndShare,
      isGaming,
      isSuppressing,
      isSuppressingCalls,
    }),
    [enabled, affectCallsAndShare, isGaming, isSuppressing, isSuppressingCalls]
  );

  return <GamingModeContext.Provider value={value}>{children}</GamingModeContext.Provider>;
};
