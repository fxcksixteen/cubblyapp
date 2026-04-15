import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeName = "default" | "onyx" | "white" | "cubbly";

const VALID_THEMES: ThemeName[] = ["default", "onyx", "white", "cubbly"];

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

  const setTheme = (t: ThemeName) => {
    if (!VALID_THEMES.includes(t)) t = "default";
    setThemeState(t);
    try {
      localStorage.setItem("cubbly-theme", t);
    } catch (e) {
      console.warn("Failed to save theme preference:", e);
    }
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
