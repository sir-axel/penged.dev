import { Link, NavLink, Outlet } from "react-router-dom";
import { Trophy, Plus, Swords, User, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";

export const NAV_ITEMS = [
  {
    to: "/leaderboard",
    label: "Leaderboard",
    short: "Ladder",
    icon: Trophy,
  },
  {
    to: "/matches/new",
    label: "Record a match",
    short: "Record",
    icon: Plus,
  },
  {
    to: "/challenges",
    label: "Challenges",
    short: "Challenges",
    icon: Swords,
  },
];
export function Layout() {
  let { isAuthenticated } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b-2 border-foreground/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Penged.dev home" className="rounded-none py-1">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map(({ to: e, label: t }) => (
              <NavLink
                to={e}
                className={({ isActive: e }) =>
                  `px-3 py-2 font-display text-[0.58rem] uppercase tracking-[0.14em] transition-colors ${e ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
                }
                key={e}
              >
                {t}
              </NavLink>
            ))}
          </nav>
          {isAuthenticated ? (
            <Link
              to="/profile"
              className="inline-flex min-h-10 items-center gap-1.5 border border-foreground bg-card px-3 py-1.5 font-display sm:min-h-0 sm:px-2.5 text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary"
            >
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              My profile
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex min-h-10 items-center gap-1.5 border border-foreground bg-card px-3 py-1.5 font-display sm:min-h-0 sm:px-2.5 text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>
      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo showWordmark />
          <p className="font-mono uppercase tracking-[0.14em]">penged.dev — verified match play</p>
        </div>
      </footer>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-foreground/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-3">
          {NAV_ITEMS.map(({ to, short, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex min-h-[58px] flex-col items-center justify-center gap-1 font-display text-[0.5rem] uppercase tracking-[0.12em] ${isActive ? "text-brand" : "text-muted-foreground"}`
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {short}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
