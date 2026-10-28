import { Link } from "react-router-dom";

export const SEPARATE_RATINGS =
  "Singles and doubles are two separate ratings and ladders — a doubles result never moves your singles rating, and vice versa. Overall is just a blend of the two for the Overall board.";
export const RATING_POINTS = [
  SEPARATE_RATINGS,
  "Everyone starts at 1400. No rating ever drops below 700.",
  "Margins matter. Win 11-2 and you gain far more than winning 11-9 — up to double.",
  "Upsets pay. Beat someone rated above you and the win is boosted; crushing someone far below you is damped.",
  "You lose points the same way you win them. Get crushed and you lose big; lose narrowly to someone better and it barely stings. In singles, what the winner gains the loser drops.",
  "K-factor (per format): 48 for your first 10 matches, 32 until 30, then 24 for good.",
  "One result moves you at most 80 points.",
  "Rematches are worth less. Each earlier meeting with the same opponent in the last 180 days scales the swing by 1 / (1 + 0.75 × meetings). After six, neither of you moves.",
  "Paddles count. A paid paddle is treated as +50 rating when working out who was expected to win: win with one and you gain a little less, beat one and you gain a little more.",
  "Doubles uses each team's average rating. Each format has its own games played (K-factor, provisional), rematch count, time away, streaks and rank: nothing is shared.",
];
export const RATING_FORMULA =
  "edge      = 50 * share of paid paddles on your side  (0, 25 or 50)\nexpected  = 1 / (1 + 10 ^ (((opponent + their edge) - (you + your edge)) / 400))\ndominance = (winnerPoints - loserPoints) / (winnerPoints + loserPoints)\nmargin    = 0.75 + 1.25 * sqrt(dominance)         (0.75 to 2.0)\nupset     = 2.2 / (2.2 + 0.001 * (winner - loser))  (0.6 to 1.6, edges included)\nchange    = K * (result - expected) * repeat * margin * upset   (max 80)\n\nresult = 1 for a win, 0 for a loss (the loser gets the same margin and upset factors)\nK      = 48 (first 10) / 32 (next 20) / 24 (after)\nrepeat = 1 / (1 + 0.75 * earlier meetings)";
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
export function RatingExplainer() {
  return (
    <section id="ratings" className="border-t border-border">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="font-display text-[0.58rem] uppercase tracking-[0.2em] text-brand">Ratings</p>
        <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
          How ratings work
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Elo, like chess ratings, plus margins and upsets. Your rating moves only once everyone who
          played has confirmed the result, so nobody can award themselves a win.
        </p>
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
            Two regulars (10 matches each, free paddles): 1400 beats 1600, expected score 0.24. A 3-0
            blowout (11-2, 11-3, 11-1) is margin ×1.79 and upset ×1.10, so the winner gains 58 and the
            loser drops 58. The same win, narrowly (11-9, 9-11, 12-10), is margin ×0.97: +32 and −32.
            If the winner played with a paid paddle the blowout is +53 and −53; if the loser did, +64
            and −64. If the winner had been away for 81 days, they gain 80 (the cap) while the loser
            still drops 58. Rank simply follows rating.
          </p>
          <Link
            to="/rules"
            className="mt-1 inline-flex min-h-10 items-center py-2 font-display text-[0.55rem] uppercase tracking-[0.16em] text-brand hover:underline"
          >
            Full house rules
          </Link>
        </article>
      </div>
    </section>
  );
}
