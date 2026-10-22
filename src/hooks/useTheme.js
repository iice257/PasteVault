import { useCallback, useEffect, useState } from "react";
import { darkModeEnabled } from "../lib/flags";

const THEME_KEY = "pastevault-theme";

function getPreferredTheme() {
  if (!darkModeEnabled || typeof window === "undefined") {
    return "light";
  }
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  if (!window.matchMedia) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function useTheme() {
  const [theme, setThemeState] = useState(getPreferredTheme);

  useEffect(() => {
    if (darkModeEnabled) window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // With dark mode switched off the theme is always light, including when another device asks for dark.
  const setTheme = useCallback((next) => {
    if (darkModeEnabled) setThemeState(next);
  }, []);
  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return {
    isDark: theme === "dark",
    theme,
    setTheme,
    toggleTheme
  };
}
