import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";

export const SEPARATE_RATINGS =
  "Singles and doubles are two separate ratings and ladders — a doubles result never moves your singles rating, and vice versa. Overall is just a blend of the two for the Overall board.";
export const RATING_POINTS = [
  SEPARATE_RATINGS,
  "Everyone starts at 1400. No rating ever drops below 700.",
  "Every game counts. Each game in a match is rated on its own, in order — a 3-0 sweep earns three wins, a 2-1 grind earns two wins and a loss.",
  "Margins matter. Win a game 11-2 and you gain far more than winning it 11-9 — up to double.",
  "Upsets pay. Beat someone rated above you and the win is boosted; crushing someone far below you is damped.",
  "You lose points the same way you win them. Get crushed in a game and you lose big; lose narrowly to someone better and it barely stings. In singles, what the winner gains the loser drops.",
  "K-factor (per format): 48 for a brand-new player, easing to 32 as you play games. One game counts half a K, so a single game moves you less than a whole match used to.",
  "One game moves you at most 40 points, and one match (all its games together) at most 80.",
  "Rematches count, just a little less. Each earlier match against the same opponent in the last 180 days (matches, not games; older than 30 days counts half) shrinks the swing: ×0.70 after one, ×0.52 after three, ×0.43 after six, and never below ×0.30, so regulars keep moving.",
  "Games to 21 count 10% more than games to 11. Coming back after a long break boosts K on the first game of your return match.",
  "Paddles count. A paid paddle is treated as +50 rating when working out who was expected to win: win with one and you gain a little less, beat one and you gain a little more.",
  "Doubles uses each team's average rating. Each format has its own games played (K-factor), matches played (provisional under 5), rematch count, time away, streaks and rank: nothing is shared.",
  "Records show both: Matches (match wins and losses) and Games (every game you won and lost).",
];
export const RATING_FORMULA =
  "Each game, in order (game 2 starts from the ratings game 1 left):\n\nedge      = 50 * share of paid paddles on your side  (0, 25 or 50)\nexpected  = 1 / (1 + 10 ^ (((opponent + their edge) - (you + your edge)) / 400))\ndominance = (winnerPoints - loserPoints) / (winnerPoints + loserPoints)   of THAT game\nmargin    = 0.75 + 1.25 * sqrt(dominance)         (0.75 to 2.0)\nupset     = 2.2 / (2.2 + 0.001 * (winner - loser))  (0.6 to 1.6, edges included)\nchange    = 0.5 * K * (result - expected) * repeat * margin * upset   (max 40 per game)\n\nresult = 1 for a win, 0 for a loss (the loser gets the same margin and upset factors)\nK      = 32 + 16 * e ^ (-games played / 30)   (48 brand new, 32 seasoned)\nrepeat = 0.3 + 0.7 / (1 + 0.75 * earlier MATCHES with this opponent)   (1.0 down to 0.3, never 0)\nmatch total = sum of its games, never more than 80";
export const XP_POINTS = [
  "+25 xp for playing, +25 for winning",
  "+5 xp per game you take (five games max)",
  "Upset: +10 xp per full 50 rating points you were behind (max +60)",
  "Streak: +10 xp x (wins in a row - 1) from your second straight win in the format you are playing (max +50)",
  "Skunk: +15 xp for every game you win 11-0",
  "Comeback: +15 xp for winning after losing game 1",
  "First verified match of the day: +10 xp",
];
export const CHALLENGE_POINTS = [
  "Challenges are singles-only: you can challenge a player up to three singles ranks above you. One open challenge at a time.",
  "The defender has 72 hours to accept. Ducking a challenge costs rating, and rank follows rating.",
  "Decline: the defender loses rating.",
  "No answer in 72 hours: the defender loses twice as much, the challenger gains the same points as a walkover and earns 15 xp.",
  "The cost peaks when you are evenly rated and close in rank. Ducking someone far below you costs little (at least 5 for silence, 3 for a decline). Rematches cost less.",
  "Played that challenger in the last 7 days? Declining is free. Played 3 or more matches this week? A decline costs half.",
  "After a decline or no answer, the same challenger cannot challenge you again for 7 days.",
  "Penalised unfairly? Ask for a review; an admin can reverse it and give back your rating.",
  "An accepted challenge that never gets played expires with no penalty.",
];
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
export function RatingExplainer({ defaultOpen = false, page = "home" }) {
  const panelId = useId();
  const [open, setOpen] = useState(() => readOpen(page, defaultOpen));
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(storeKey(page), next ? "1" : "0");
    } catch {
      /* private mode etc.: the choice just is not remembered */
    }
  };
  return (
    <section id="ratings" className="border-t border-border">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="m-0">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            <span className="min-w-0">
              <span className="block font-display text-[0.58rem] uppercase tracking-[0.2em] text-brand">Ratings</span>
              <span className="mt-3 block font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                How ratings work
              </span>
            </span>
            <ChevronDown
              className={`h-6 w-6 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Elo, like chess ratings, plus margins and upsets. Your rating moves only once everyone who
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
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            Two regulars (25 games each, free paddles): 1400 beats 1600, expected 0.24 a game. A 3-0
            blowout (11-2, 11-3, 11-1) is three wins: +29, +24, +24 = +77, and the loser drops 77. The same
            match played narrowly (11-9, 9-11, 12-10) is two wins and a loss: +19, −6, +17 = +30. With a paid
            paddle the blowout is +70 for the winner; if the loser had it, +80. Between two evenly rated
            players (1400 each, 20 games), a 3-0 sweep is +41, a 2-1 grind +10, a close 2-0 +22. Rank simply
            follows rating.
          </p>
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
