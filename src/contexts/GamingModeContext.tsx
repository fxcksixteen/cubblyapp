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
 *  - `features`           → per-feature opt-outs, only meaningful while enabled
 *
 * Persisted to localStorage so settings stick across sessions.
 */

const LS_ENABLED = "cubbly:gamingMode:enabled";
const LS_AFFECT_CALLS = "cubbly:gamingMode:affectCalls";
const LS_FEATURES = "cubbly:gamingMode:features";

export type GamingFeatureKey =
  | "muteSounds"
  | "pauseNotifications"
  | "reduceAnimations"
  | "throttleScanning"
  | "hideToasts";

export type GamingFeatures = Record<GamingFeatureKey, boolean>;

export const GAMING_FEATURE_DEFAULTS: GamingFeatures = {
  muteSounds: true,
  pauseNotifications: true,
  reduceAnimations: true,
  throttleScanning: true,
  hideToasts: false,
};

export const GAMING_FEATURE_META: Array<{
  key: GamingFeatureKey;
  title: string;
  description: string;
}> = [
  {
    key: "muteSounds",
    title: "Mute notification sounds",
    description: "Silences message, mention and friend-request sounds while you're in a game.",
  },
  {
    key: "pauseNotifications",
    title: "Pause desktop notifications",
    description: "Stops OS pop-ups from appearing over your game. They still stack up in Cubbly.",
  },
  {
    key: "reduceAnimations",
    title: "Minimize animations",
    description: "Cuts transitions, theme effects and animated decorations to free up GPU time.",
  },
  {
    key: "throttleScanning",
    title: "Throttle background work",
    description: "Slows process scanning and background refreshes so nothing competes with your game.",
  },
  {
    key: "hideToasts",
    title: "Hide in-app pop-ups",
    description: "Hides Cubbly's own toast messages while gaming. Off by default.",
  },
];

interface GamingModeContextValue {
  /** Master switch (ON by default). */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** Whether suppression should also affect active voice/video/screen calls. OFF by default. */
  affectCallsAndShare: boolean;
  setAffectCallsAndShare: (v: boolean) => void;
  /** Per-feature switches — only take effect while Gaming Mode is enabled. */
  features: GamingFeatures;
  setFeature: (key: GamingFeatureKey, value: boolean) => void;
  resetFeatures: () => void;
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
  features: GAMING_FEATURE_DEFAULTS,
  setFeature: () => {},
  resetFeatures: () => {},
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

const readFeatures = (): GamingFeatures => {
  try {
    const raw = localStorage.getItem(LS_FEATURES);
    if (!raw) return { ...GAMING_FEATURE_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GamingFeatures>;
    return { ...GAMING_FEATURE_DEFAULTS, ...parsed };
  } catch {
    return { ...GAMING_FEATURE_DEFAULTS };
  }
};

export const GamingModeProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { getActivity } = useActivity();

  const [enabled, setEnabledState] = useState<boolean>(() => readBool(LS_ENABLED, true));
  const [affectCallsAndShare, setAffectCallsAndShareState] = useState<boolean>(() =>
    readBool(LS_AFFECT_CALLS, false)
  );
  const [features, setFeatures] = useState<GamingFeatures>(readFeatures);

  const setEnabled = (v: boolean) => {
    setEnabledState(v);
    try { localStorage.setItem(LS_ENABLED, v ? "1" : "0"); } catch {}
  };
  const setAffectCallsAndShare = (v: boolean) => {
    setAffectCallsAndShareState(v);
    try { localStorage.setItem(LS_AFFECT_CALLS, v ? "1" : "0"); } catch {}
  };
  const persistFeatures = (next: GamingFeatures) => {
    setFeatures(next);
    try { localStorage.setItem(LS_FEATURES, JSON.stringify(next)); } catch {}
  };
  const setFeature = (key: GamingFeatureKey, value: boolean) => {
    persistFeatures({ ...features, [key]: value });
  };
  const resetFeatures = () => persistFeatures({ ...GAMING_FEATURE_DEFAULTS });

  // Derive whether *I* am currently gaming based on my own activity row
  const myActivity = user ? getActivity(user.id) : undefined;
  const isGaming = !!myActivity && myActivity.activity_type === "playing" && !!myActivity.name;

  const isSuppressing = enabled && isGaming;
  const isSuppressingCalls = isSuppressing && affectCallsAndShare;

  // Push the suppression flags onto globals so non-React modules (sounds.ts,
  // notifications.ts, ActivityContext) can cheaply check them without
  // subscribing to React.
  useEffect(() => {
    (window as any).__cubblySuppress = isSuppressing;
    (window as any).__cubblySuppressCalls = isSuppressingCalls;
    (window as any).__cubblyGM = isSuppressing ? features : null;
    try {
      const root = document.documentElement;
      root.classList.toggle("cubbly-gaming-mode", isSuppressing && features.reduceAnimations);
      root.classList.toggle("cubbly-gaming-no-toasts", isSuppressing && features.hideToasts);
    } catch {}
  }, [isSuppressing, isSuppressingCalls, features]);

  const value = useMemo<GamingModeContextValue>(
    () => ({
      enabled,
      setEnabled,
      affectCallsAndShare,
      setAffectCallsAndShare,
      features,
      setFeature,
      resetFeatures,
      isGaming,
      isSuppressing,
      isSuppressingCalls,
    }),
    [enabled, affectCallsAndShare, features, isGaming, isSuppressing, isSuppressingCalls]
  );

  return <GamingModeContext.Provider value={value}>{children}</GamingModeContext.Provider>;
};
