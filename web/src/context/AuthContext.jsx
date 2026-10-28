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

  const logout = useCallback(async (redirect = true) => {
    setUser(null);
    await api.auth.logout();
    if (redirect) window.location.href = "/";
  }, []);

  const value = useMemo(
    () => ({ user, isAuthenticated: !!user, isLoadingAuth, logout, checkUserAuth }),
    [user, isLoadingAuth, logout, checkUserAuth],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
