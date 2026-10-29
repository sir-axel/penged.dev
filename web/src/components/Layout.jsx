import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Trophy, Plus, Swords, User, LogIn, Rss, ClipboardCheck, MessageSquare, Sun, Moon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Logo } from "@/components/Logo";
import { CountBadge, UnreadDot, useNewFeedbackCount, useUnreadReplyCount } from "@/hooks/useFeedbackCount";
import { useQueueCount } from "@/hooks/useQueueCount";
import { useChatUnread } from "@/hooks/useChat";
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
// Desktop header only: the mobile bottom nav keeps exactly the five items above (chat lives in the mobile header).
const DESKTOP_NAV = [...NAV_ITEMS, { to: "/chat", label: "Chat", short: "Chat", chat: true }];

export function Layout() {
  let { isAuthenticated } = useAuth();
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const queueCount = useQueueCount();
  const chatUnread = useChatUnread();
  const chatCount = chatUnread.dms + chatUnread.mentions;
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
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:border focus:border-foreground focus:bg-background focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b-2 border-foreground/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4 sm:gap-3 sm:px-6">
          <Link to="/" aria-label="Penged.dev home" className="inline-flex min-h-10 items-center rounded-none py-1">
            <Logo showWordmark={false} className="min-[340px]:hidden" />
            <Logo className="hidden min-[340px]:inline-flex" />
          </Link>
          <nav aria-label="Main" className="hidden min-w-0 items-center gap-1.5 md:flex lg:gap-2">
            {DESKTOP_NAV.map(({ to: e, short: t, badge, chat }) => (
              <NavLink
                to={e}
                className={({ isActive: e }) =>
                  `relative inline-flex h-9 items-center whitespace-nowrap rounded-sm border px-2.5 font-display text-[0.55rem] uppercase tracking-[0.1em] transition-colors lg:px-3 lg:text-[0.58rem] lg:tracking-[0.12em] ${e ? "border-foreground bg-foreground text-background" : "border-border bg-secondary text-foreground hover:bg-accent"}`
                }
                key={e}
              >
                {t}
                {badge && <CountBadge n={queueCount} className="absolute -right-2 -top-2 rounded-full" />}
                {chat && <CountBadge n={chatCount} className="absolute -right-2 -top-2 rounded-full" />}
              </NavLink>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={dark}
            className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-secondary hover:bg-accent md:h-9 md:w-9"
          >
            {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
          <Link
            to="/chat"
            aria-label={chatCount > 0 ? `Chat, ${chatCount} new` : "Chat"}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-secondary hover:bg-accent md:hidden"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            <CountBadge n={chatCount} className="absolute -right-2 -top-2" />
          </Link>
          {isAuthenticated ? (
            <Link
              to="/profile"
              className="relative inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-secondary px-3 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-accent md:h-9 md:min-h-0 md:px-2.5 lg:px-3"
            >
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">My </span>
              profile
              <CountBadge n={newFeedback} className="absolute -right-2 -top-2 rounded-full sm:static sm:rounded-full" />
              <UnreadDot n={unreadReplies} className="absolute -right-1 -top-1 sm:static" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="relative inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-secondary px-3 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-accent md:h-9 md:min-h-0 md:px-2.5 lg:px-3"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Sign in
            </Link>
          )}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      {/* Grey band (light theme) so the footer reads as a footer: logo on the left, vertically centred;
          links stacked on the right. Extra bottom padding on phones keeps it clear of the fixed bottom nav. */}
      <footer className="border-t border-border bg-accent px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 text-foreground sm:px-6 md:pb-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <Logo showWordmark className="shrink-0" />
          <div className="flex min-w-0 flex-col items-end font-mono text-[11px] uppercase tracking-[0.12em] sm:text-xs sm:tracking-[0.14em]">
            <Link to={feedbackHref(location.pathname + location.search)} className="inline-flex min-h-10 items-center justify-end whitespace-nowrap text-right text-foreground/80 underline underline-offset-4 hover:text-foreground">
              Feedback
              <UnreadDot n={unreadReplies} className="ml-1.5" />
            </Link>
            <a
              href="https://github.com/sir-axel/penged.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center justify-end text-right text-foreground/80 underline underline-offset-4 hover:text-foreground"
            >
              <span className="sm:hidden">Contribute on GitHub</span>
              <span className="hidden sm:inline">Open source · contribute on GitHub</span>
            </a>
            <p className="mt-1 text-right text-[10px] text-muted-foreground sm:text-[11px]">
              <span className="sm:hidden">Verified match play</span>
              <span className="hidden sm:inline">penged.dev — verified match play</span>
            </p>
          </div>
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
