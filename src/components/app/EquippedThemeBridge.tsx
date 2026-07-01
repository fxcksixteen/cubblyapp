import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";
import { removeChannelByTopic } from "@/lib/realtimeReconnect";

/** Maps a shop theme item id → theme key in ThemeContext. */
const THEME_MAP: Record<string, ThemeName> = {
  theme_midnight_aurora: "onyx",
  theme_sunset_cozy: "cubbly",
  theme_space: "space",
  theme_ocean_depths: "ocean",
  theme_cherry_blossom: "blossom",
  theme_evergreen: "forest",
  theme_synthwave: "synthwave",
  theme_lava_flow: "lava",
  theme_borealis: "borealis",
  theme_sky_dusk: "sky",
  theme_snowy_drift: "snowy",
  theme_moonlit_hills: "hills",
  // Premium gem-only themes
  theme_cosmic_nebula: "nebula",
  theme_cyber_grid: "cyber",
  theme_volcanic: "volcanic",
  theme_bioluminescent: "abyss",
  theme_aurora_borealis: "aurora",
  theme_sakura_storm: "sakura",
};

const VALID_LOCAL_THEMES: ThemeName[] = ["default", "onyx", "white", "cubbly"];

function readLocalTheme(): ThemeName {
  try {
    const saved = localStorage.getItem("cubbly-theme");
    if (saved && VALID_LOCAL_THEMES.includes(saved as ThemeName)) {
      return saved as ThemeName;
    }
  } catch {}
  return "default";
}

/**
 * Watches the current user's equipped *shop* theme and applies it.
 *
 * IMPORTANT: when the user has NO shop theme equipped, we must NOT overwrite
 * their locally-selected built-in theme (default / onyx / white / cubbly).
 * Falling through to setTheme("default") here was clobbering "cubbly" on every
 * login.
 */
const EquippedThemeBridge = () => {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!user) {
      // Signed-out: strip any equipped shop theme so the login/landing pages
      // never inherit Space/Ocean/etc. from the previous session.
      setTheme(readLocalTheme());
      return;
    }
    let alive = true;

    const apply = async () => {
      const { data } = await supabase
        .from("user_equipped")
        .select("item_id")
        .eq("user_id", user.id)
        .eq("category", "theme")
        .maybeSingle();
      if (!alive) return;
      const id = data?.item_id;
      const mapped = id ? THEME_MAP[id] : null;
      if (mapped) {
        setTheme(mapped);
      } else {
        // No shop theme equipped — keep whatever the user picked locally.
        setTheme(readLocalTheme());
      }
    };

    apply();

    // Drop any cached channel for this topic — supabase-js otherwise returns
    // an already-subscribed instance and rejects new .on() handlers.
    removeChannelByTopic(`equipped-theme:${user.id}`);
    const ch = supabase
      .channel(`equipped-theme:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_equipped", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (row?.category === "theme") apply();
        }
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [user, setTheme]);

  return null;
};

export default EquippedThemeBridge;
