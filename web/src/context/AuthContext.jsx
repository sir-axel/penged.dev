import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  const checkUserAuth = useCallback(async () => {
    try {
      setUser(await api.auth.me());
    } catch {
      setUser(null);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  // Patch the cached user after a preference change so effects don't re-apply a stale server value.
  const setUserTheme = useCallback((theme) => setUser((u) => (u ? { ...u, theme } : u)), []);
  const patchUser = useCallback((fields) => setUser((u) => (u ? { ...u, ...fields } : u)), []);

  const logout = useCallback(async (redirect = true) => {
    setUser(null);
    await api.auth.logout();
    if (redirect) window.location.href = "/";
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, isLoadingAuth, logout, checkUserAuth, setUserTheme, patchUser }),
    [user, isLoadingAuth, logout, checkUserAuth, setUserTheme, patchUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
