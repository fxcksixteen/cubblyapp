import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";

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
};

/**
 * Watches the current user's equipped theme item and applies it to the live
 * ThemeContext. Unequipping resets to the default theme.
 */
const EquippedThemeBridge = () => {
  const { user } = useAuth();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!user) return;
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
      const theme = (id && THEME_MAP[id]) || "default";
      setTheme(theme);
    };

    apply();

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
