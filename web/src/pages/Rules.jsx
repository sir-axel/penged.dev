import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { RATING_POINTS, XP_POINTS, CHALLENGE_POINTS } from "@/components/home/RatingExplainer";

export const RULE_SECTIONS = [
  {
    title: "Verification",
    items: [
      "Every player in a match must confirm the submitted result. Singles needs both players; doubles needs all four.",
      "A result stays pending until the last sign-off arrives. Anyone can decline or dispute it instead.",
      "Declined and disputed matches never touch ratings, levels, records or ladder positions.",
      "Only verified matches appear in public stats and match history.",
    ],
  },
  {
    title: "Rating",
    items: [
      "Each format has its own pool: a singles rating and a doubles rating. Doubles results never move your singles rating.",
      ...RATING_POINTS,
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
    title: "The singles ladder",
    items: [
      "Singles is a positional ladder. Everyone has a numbered spot, and new players join at the bottom.",
      "Beat someone above you and you take their spot; everyone between the two of you slides down one place.",
      "Beating someone below you never moves your position — it only affects rating.",
      "Doubles has no positions: it is ranked by doubles rating, so you climb it by beating pairs rated above you.",
      "Overall blends both ratings, weighted by how many matches you have played in each.",
    ],
  },
  {
    title: "Challenges and inactivity",
    items: [
      ...CHALLENGE_POINTS,
      "Two unanswered challenges, or a player inactive for 30 days with an open dispute, puts a 'review' badge next to their name on the ladder.",
    ],
  },
];
export function Rules() {
  return (
    <>
      <PageHeader
        eyebrow="House rules"
        title="How rating, level and challenges work"
        description="Short version: only verified results count, rating measures who you beat, level measures how much you play, and rank is a position you have to take."
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
