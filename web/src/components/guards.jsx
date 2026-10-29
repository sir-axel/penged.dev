import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { getReturnTo } from "@/lib/returnTo";

const Spinner = () => (
  <div className="flex min-h-[50vh] items-center justify-center">
    <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
  </div>
);

/** Requires a signed-in user; otherwise sends them to /login and back afterwards. */
export function RequireAuth() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();
  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAuthenticated) {
    const returnTo = location.pathname + location.search;
    const search = returnTo === "/" ? "" : `?returnTo=${encodeURIComponent(returnTo)}`;
    return <Navigate to={`/login${search}`} replace />;
  }
  return <Outlet />;
}

/** Requires the signed-in user to have claimed a username (a Player record). */
export function RequirePlayer() {
  const { player, isLoading } = useMyPlayer();
  if (isLoading) return <Spinner />;
  return player ? <Outlet /> : <Navigate to="/welcome" replace />;
}

/** Login / register / forgot-password make no sense once signed in: send them on to where they were headed. */
export function RedirectIfSignedIn({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate to={getReturnTo()} replace /> : children;
}
