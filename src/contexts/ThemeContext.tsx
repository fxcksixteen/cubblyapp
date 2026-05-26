import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeName =
  | "default"
  | "onyx"
  | "white"
  | "cubbly"
  | "space"
  | "sky"
  | "snowy"
  | "hills"
  | "ocean"
  | "blossom"
  | "forest"
  | "synthwave"
  | "lava"
  | "borealis";

const VALID_THEMES: ThemeName[] = [
  "default",
  "onyx",
  "white",
  "cubbly",
  "space",
  "sky",
  "snowy",
  "hills",
  "ocean",
  "blossom",
  "forest",
  "synthwave",
  "lava",
  "borealis",
];

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "default",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function loadSavedTheme(): ThemeName {
  try {
    const saved = localStorage.getItem("cubbly-theme");
    if (saved && VALID_THEMES.includes(saved as ThemeName)) {
      return saved as ThemeName;
    }
  } catch (e) {
    console.warn("Failed to load theme preference:", e);
  }
  return "default";
}

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeName>(loadSavedTheme);

  // Apply data-theme synchronously alongside the React state update so the
  // CSS variables flip in the SAME paint. The previous useEffect-only path
  // raced with the EquippedThemeBridge re-asserting the saved theme, which
  // is why some themes needed multiple clicks to "stick".
  const setTheme = (t: ThemeName) => {
    if (!VALID_THEMES.includes(t)) t = "default";
    try { document.documentElement.setAttribute("data-theme", t); } catch {}
    try { localStorage.setItem("cubbly-theme", t); } catch (e) { console.warn("Failed to save theme preference:", e); }
    setThemeState(t);
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
