import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { THEME_KEY, currentTheme, isTheme, paintTheme, storeTheme, storedTheme, systemTheme } from "@/lib/theme";

const ThemeContext = createContext(null);

/**
 * Theme precedence: the signed-in account's choice wins (and is mirrored to localStorage so the next load
 * paints correctly before the session arrives); signed out it is localStorage, then the device preference.
 */
export function ThemeProvider({ children }) {
  const { user, isLoadingAuth, setUserTheme } = useAuth();
  const [theme, setThemeState] = useState(currentTheme);

  const apply = useCallback((t) => {
    paintTheme(t);
    storeTheme(t);
    setThemeState(t);
  }, []);

  // Account value wins on page load / sign-in (and when it changes from the server).
  const accountTheme = user?.theme;
  useEffect(() => {
    if (isLoadingAuth || !isTheme(accountTheme)) return;
    apply(accountTheme);
  }, [accountTheme, isLoadingAuth, user?.id, apply]);

  // Another tab changed it.
  useEffect(() => {
    const on = (e) => {
      if (e.key !== THEME_KEY || !isTheme(e.newValue)) return;
      paintTheme(e.newValue);
      setThemeState(e.newValue);
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const setTheme = useCallback(
    (t) => {
      if (!isTheme(t)) return;
      apply(t); // optimistic: instant, no waiting on the network
      if (user) {
        setUserTheme(t);
        api.functions.invoke("setTheme", { theme: t }).catch(() => {
          /* the device keeps the choice; the account catches up on the next toggle */
        });
      }
    },
    [apply, user, setUserTheme],
  );
  const toggleTheme = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [setTheme, theme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
