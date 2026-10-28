import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { HeroDecor } from "@/components/home/HeroDecor";
import { Button } from "@/components/ui/button";
import { HeroMatchCard } from "@/components/home/HeroMatchCard";

export function Hero({ players = 0, verified = 0, pending = 0, match = null }) {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="arcade-grid absolute inset-0" aria-hidden="true" />
      <div
        className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background"
        aria-hidden="true"
      />
      <HeroDecor />
      <div className="relative mx-auto grid max-w-5xl gap-10 px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="font-display text-[0.58rem] uppercase tracking-[0.18em] text-brand">
            Penged.dev · office table tennis
          </p>
          <h1 className="mt-4 font-heading text-[2rem] font-bold leading-[1.02] tracking-[-0.01em] sm:text-[2.85rem]">
            Settle it on the table.
            <br />
            <span className="mt-1.5 inline-block bg-foreground px-1.5 pb-0.5 text-background">
              Rank it on the board.
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
            Singles and doubles. Everyone who played confirms the score. Elo settles who owns the
            table.
          </p>
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-none font-display text-[0.68rem] uppercase tracking-[0.12em]"
            >
              <Link to="/matches/new">
                Record a match
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-none border-foreground/70 bg-card font-display text-[0.68rem] uppercase tracking-[0.12em]"
            >
              <Link to="/leaderboard">View leaderboard</Link>
            </Button>
          </div>
          <dl className="mt-9 grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
            {[
              {
                label: "Players rated",
                value: players,
              },
              {
                label: "Verified matches",
                value: verified,
              },
              {
                label: "Awaiting confirmation",
                value: pending,
              },
            ].map((e) => (
              <div
                className="pixel-frame-soft rounded-none border border-border bg-card px-3 py-3"
                key={e.label}
              >
                <dd className="font-display text-lg tabular-nums leading-none sm:text-xl">
                  {String(e.value).padStart(2, "0")}
                </dd>
                <dt className="mt-2 text-[9px] uppercase leading-tight tracking-[0.12em] text-muted-foreground">
                  {e.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
        <HeroMatchCard match={match} />
      </div>
    </section>
  );
}
