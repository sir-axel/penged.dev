import { BackButton } from "@/components/BackButton";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { TIERS } from "@/lib/tiers";
import { RATING_POINTS, XP_POINTS, CHALLENGE_POINTS } from "@/components/home/RatingExplainer";
import { MATCHUP_POINTS } from "@/lib/ratingCopy";

export const RULE_SECTIONS = [
  {
    title: "Verification",
    items: [
      "Every player in a match must confirm the submitted result. Singles needs both players; doubles needs all four.",
      "A result stays pending until the last sign-off arrives. Anyone can decline or dispute it instead.",
      "Pick Ranked or Unranked when you record. Both earn XP; only Ranked moves elo and your record.",
      "Declined and disputed matches never touch ratings, levels, records or ranks.",
      "Only verified matches appear in public stats and match history.",
    ],
  },
  {
    title: "Rating",
    items: [
      ...RATING_POINTS,
    ],
  },
  {
    title: "Tiers",
    items: [
      ...TIERS.map((t, i) =>
        i === 0 ? `${t.name}: 100 (the floor)–${TIERS[1].min - 1}` : i === TIERS.length - 1 ? `${t.name}: ${t.min} and up` : `${t.name}: ${t.min}–${TIERS[i + 1].min - 1}`,
      ),
      "Singles and doubles each have their own tier, from their own rating. The Overall board shows the tier of its blended score, for display only.",
      "Placement until you've played 3 matches in that format. Your rating, and the rating change on each placement match, stays hidden until then; it shows once the 3rd match is in.",
      "Tiers follow your rating — they go down as well as up.",
    ],
  },
  {
    title: "Level",
    items: [
      "Level is earned by playing: every verified match gives experience, with bonuses for winning and for how you win.",
      ...XP_POINTS,
      "Level grows without limit and never affects rating, rank or matchmaking. It is a record of activity, not a shortcut.",
    ],
  },
  {
    title: "Ranking",
    items: [
      "Rank is your place in the rating order. New players start at 1400 but are unranked (shown as nil, at the bottom of the board) until their first verified match in that format, then slot in by rating.",
      "Win and your rating rises, so you pass everyone you now out-rate. Ties go to whoever has played more, then whoever joined first.",
      "Stay active: with no verified match of a format in 30 days you move to that format's Inactive list (singles and doubles are tracked separately), keeping your rating, and are ranked again when you next play it. Under 3 matches is placement: the rating stays hidden.",
      "Beating someone far below you earns little rating, so it barely moves you.",
      "Doubles is ranked the same way, on its own: by doubles rating, then doubles matches played.",
      "Overall blends both ratings, weighted by how many matches you have played in each. It is shown on the Overall board only and is never used in any rating, rank or challenge.",
    ],
  },
  {
    title: "Challenges and inactivity",
    items: [
      ...CHALLENGE_POINTS,
      "Two unanswered challenges, or a player inactive for 30 days with an open dispute, puts a 'review' badge next to their name on the ladder.",
    ],
  },
  {
    title: "This week's match",
    items: [...MATCHUP_POINTS],
  },
];
export function Rules() {
  return (
    <>
      <BackButton fallback="/" />
      <PageHeader
        eyebrow="House rules"
        title="How rating, level and challenges work"
        description="Short version: only verified results count, rating measures who you beat, level measures how much you play, and rank is your place in the rating order."
      />
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
        {RULE_SECTIONS.map((e) => (
          <section key={e.title}>
            <h2 className="font-heading text-lg font-semibold tracking-tight">{e.title}</h2>
            <ul className="mt-3 space-y-2">
              {e.items.map((e) => (
                <li className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground" key={e}>
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                    aria-hidden="true"
                  />
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="flex flex-wrap gap-2 border-t border-border pt-6">
          <Link
            to="/leaderboard"
            className="rounded-sm border border-border bg-card px-4 py-2.5 text-sm font-medium hover:border-foreground/40"
          >
            View the ladder
          </Link>
          <Link
            to="/matches/new"
            className="rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Record a match
          </Link>
        </div>
      </div>
    </>
  );
}
