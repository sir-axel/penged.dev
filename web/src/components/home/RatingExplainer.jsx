import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

import { RATING_POINTS, RATING_FORMULA, XP_POINTS, CHALLENGE_POINTS, WORKED_EXAMPLE } from "@/lib/ratingCopy";

// The copy lives in lib/ratingCopy.js (api/test/explainer.test.js asserts its numbers); re-exported for Rules.jsx.
export { SEPARATE_RATINGS, RATING_POINTS, RATING_FORMULA, XP_POINTS, CHALLENGE_POINTS, WORKED_EXAMPLE } from "@/lib/ratingCopy";
const storeKey = (page) => `penged:ratings-open:${page}`;
function readOpen(page, fallback) {
  try {
    const v = window.localStorage.getItem(storeKey(page));
    return v === "1" ? true : v === "0" ? false : fallback;
  } catch {
    return fallback;
  }
}

/** "How ratings work": heading is a toggle. Collapsed by default (home); pass defaultOpen where the page is about the rules. Choice is remembered per page. */
export function RatingExplainer({ defaultOpen = false, page = "home", alwaysOpen = false }) {
  const panelId = useId();
  const [openState, setOpen] = useState(() => readOpen(page, defaultOpen));
  const open = alwaysOpen || openState;
  const toggle = () => {
    if (alwaysOpen) return;
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(storeKey(page), next ? "1" : "0");
    } catch {
      /* private mode etc.: the choice just is not remembered */
    }
  };
  return (
    <section id={alwaysOpen ? undefined : "ratings"} className={alwaysOpen ? "" : "border-t border-border"}>
      <div className={alwaysOpen ? "px-1 py-2" : "mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16"}>
        <h2 className="m-0">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={alwaysOpen ? undefined : open}
            aria-controls={panelId}
            className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <span className="min-w-0">
              <span className="block font-display text-[0.58rem] uppercase tracking-[0.2em] text-brand">Ratings</span>
              <span className="mt-3 block font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                How ratings work
              </span>
            </span>
            {!alwaysOpen && <ChevronDown
              className={`h-6 w-6 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />}
          </button>
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Glicko-2, a chess-style rating that also tracks how sure it is about you, plus margins, upsets, rematch recency and new rivals. Your rating moves only once everyone who
          played has confirmed the result, so nobody can award themselves a win.
        </p>
        <div
          id={panelId}
          className={`grid transition-[grid-template-rows,visibility] duration-300 motion-reduce:transition-none ${open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"}`}
        >
          <div className="min-h-0 overflow-hidden">
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <article className="min-w-0 border border-foreground bg-card p-5">
            <h3 className="font-heading text-base font-semibold">The short version</h3>
            <ul className="mt-3 space-y-2">
              {RATING_POINTS.map((e) => (
                <li
                  className="flex gap-2 text-[13px] leading-relaxed text-muted-foreground"
                  key={e}
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 bg-brand" aria-hidden="true" />
                  {e}
                </li>
              ))}
            </ul>
          </article>
          <div className="min-w-0 space-y-3">
            <article className="min-w-0 border border-foreground bg-card p-5">
              <h3 className="font-display text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
                The maths
              </h3>
              <pre className="mt-3 overflow-x-auto bg-secondary p-3 font-mono text-[11px] leading-relaxed text-foreground">
                {RATING_FORMULA}
              </pre>
            </article>
            <article className="border border-foreground bg-card p-5">
              <h3 className="font-heading text-base font-semibold">Level is not rating</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                Level counts the work you put in. Rating counts who you beat — so grinding easy
                games never buys rank. Bonus xp:
              </p>
              <ul className="mt-3 space-y-1.5">
                {XP_POINTS.map((e) => (
                  <li
                    className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
                    key={e}
                  >
                    {e}
                  </li>
                ))}
              </ul>
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                level = floor(sqrt(xp / 40)) + 1 · level 5 opens at 640 xp
              </p>
            </article>
          </div>
        </div>
        <article className="mt-3 border border-border bg-card p-5">
          <h3 className="font-display text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
            Worked example
          </h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{WORKED_EXAMPLE}</p>
          <Link
            to="/rules"
            className="mt-1 inline-flex min-h-10 items-center py-2 font-display text-[0.55rem] uppercase tracking-[0.16em] text-brand hover:underline"
          >
            Full house rules
          </Link>
        </article>
          </div>
        </div>
      </div>
    </section>
  );
}
