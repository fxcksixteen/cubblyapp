import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeName = "default" | "onyx" | "white" | "cubbly";

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "default",
  setTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    return (localStorage.getItem("cubbly-theme") as ThemeName) || "default";
  });

  const setTheme = (t: ThemeName) => {
    setThemeState(t);
    localStorage.setItem("cubbly-theme", t);
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
