import { Link } from "react-router-dom";

export const RATING_POINTS = [
  "Everyone starts at 1400.",
  "Beating someone above you gains more than beating someone below you.",
  "Losing to a stronger opponent costs fewer points.",
  "K-factor: 48 for your first 10 matches, 32 until 30, then 24 for good.",
  "One result moves you at most 45 points, and no rating ever drops below 700.",
  "Rematches are worth less — every earlier meeting with the same opponent halves the gain, and after six in six months a win pays nothing.",
  "Margins don't matter: 11-0 and 11-9 count exactly the same.",
];
export const RATING_FORMULA =
  "expected = 1 / (1 + 10 ^ ((opponentRating - yourRating) / 400))\nnewRating = yourRating + K * (result - expected) * repeatFactor\n\nresult       = 1 for a win, 0 for a loss\nK            = 48 (first 10) / 32 (next 20) / 24 (after)\nrepeatFactor = 1 / (1 + 0.75 * earlier meetings)";
export const XP_POINTS = [
  "+25 xp for turning up",
  "+25 xp for winning",
  "+5 xp per game you take (five games max)",
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
          Elo, like chess ratings. Your rating moves only once everyone who played has confirmed the
          result, so nobody can award themselves a win.
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
                games never buys rank.
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
            In your first match, a 1400-rated player beats a 1600-rated one. Expected score is 0.24,
            so the win is worth 48 × (1 − 0.24) = 36 points: the winner moves to 1436 and, because
            the win came against a higher rank, also takes that spot on the ladder.
          </p>
          <Link
            to="/rules"
            className="mt-1 inline-flex py-2 font-display text-[0.55rem] uppercase tracking-[0.16em] text-brand hover:underline"
          >
            Full house rules
          </Link>
        </article>
      </div>
    </section>
  );
}
