import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Trophy, Plus, Swords, User, LogIn, Rss, ClipboardCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { CountBadge, UnreadDot, useNewFeedbackCount, useUnreadReplyCount } from "@/hooks/useFeedbackCount";
import { useQueueCount } from "@/hooks/useQueueCount";
import { feedbackHref } from "@/pages/Feedback";

export const NAV_ITEMS = [
  {
    to: "/leaderboard",
    label: "Leaderboard",
    short: "Ladder",
    icon: Trophy,
  },
  {
    to: "/feed",
    label: "Feed",
    short: "Feed",
    icon: Rss,
  },
  {
    to: "/matches/new",
    label: "Record a match",
    short: "Record",
    icon: Plus,
  },
  {
    to: "/confirm",
    label: "To confirm",
    short: "Confirm",
    icon: ClipboardCheck,
    badge: true,
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
  const location = useLocation();
  const queueCount = useQueueCount();
  const newFeedback = useNewFeedbackCount();
  const unreadReplies = useUnreadReplyCount();
  // While a text field is focused the on-screen keyboard is (probably) open: drop the bottom nav and
  // let the fixed submit bar sit flush at the bottom so neither covers the field being typed in.
  useEffect(() => {
    const root = document.documentElement;
    const isField = (t) =>
      t instanceof HTMLElement &&
      (t.matches("textarea, select") ||
        (t.matches("input") && !/^(checkbox|radio|file|button|submit|range|color)$/.test(t.type)));
    const on = (e) => isField(e.target) && root.setAttribute("data-kb", "");
    const off = () => root.removeAttribute("data-kb");
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
      off();
    };
  }, []);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b-2 border-foreground/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="Penged.dev home" className="inline-flex min-h-10 items-center rounded-none py-1">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map(({ to: e, label: t, badge }) => (
              <NavLink
                to={e}
                className={({ isActive: e }) =>
                  `inline-flex items-center px-3 py-2 font-display text-[0.58rem] uppercase tracking-[0.14em] transition-colors ${e ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`
                }
                key={e}
              >
                {t}
                {badge && <CountBadge n={queueCount} className="ml-1.5" />}
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
              <CountBadge n={newFeedback} />
              <UnreadDot n={unreadReplies} />
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
      <main className="flex-1 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>
      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo showWordmark />
          <p className="flex flex-wrap items-center gap-x-4 font-mono uppercase tracking-[0.14em]">
            <Link
              to={feedbackHref(location.pathname + location.search)}
              className="inline-flex min-h-10 items-center underline underline-offset-4 hover:text-foreground"
            >
              Feedback
              <UnreadDot n={unreadReplies} className="ml-1.5" />
            </Link>
            <span>penged.dev — verified match play</span>
          </p>
        </div>
      </footer>
      <nav
        aria-label="Primary"
        className="kb-hide fixed inset-x-0 bottom-0 z-30 border-t-2 border-foreground/80 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.map(({ to, short, icon: Icon, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `flex min-h-[58px] flex-col items-center justify-center gap-1 font-display text-[0.45rem] uppercase tracking-[0.06em] ${isActive ? "text-brand" : "text-muted-foreground"}`
                }
              >
                <span className="relative">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {badge && <CountBadge n={queueCount} className="absolute -right-3 -top-2" />}
                </span>
                {short}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
