import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { LadderRow } from "@/components/LadderRow";

export function TopLadder({ players = [] }) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground">
            Singles ladder
          </h2>
          <p className="mt-2 font-heading text-2xl font-semibold tracking-tight">
            Top of the table
          </p>
        </div>
        <Link
          to="/leaderboard"
          className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-sm py-2 text-sm font-medium text-brand hover:underline"
        >
          Full ladder
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-5 overflow-hidden rounded-sm border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span className="w-7">#</span>
          <span className="w-[30px]" />
          <span className="flex-1">Player</span>
          <span className="w-12 text-right">Rating</span>
        </div>
        {players.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="font-heading text-sm font-semibold">The ladder is empty</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The first profile created takes spot one.
            </p>
            <Link
              to="/register"
              className="mt-3 inline-flex rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Join the ladder
            </Link>
          </div>
        ) : (
          <ul>
            {players.map((e) => (
              <LadderRow
                rank={e.singles_rank}
                player={e}
                rating={e.singles_rating || 1400}
                wins={e.singles_wins || 0}
                losses={e.singles_losses || 0}
                key={e.id}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
