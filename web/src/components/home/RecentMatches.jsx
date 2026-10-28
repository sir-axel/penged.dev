import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MatchRow } from "@/components/MatchRow";

export function RecentMatches({ matches = [] }) {
  return (
    <section className="border-t border-border bg-secondary/30">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-[0.6rem] uppercase tracking-[0.22em] text-muted-foreground">
              Match feed
            </h2>
            <p className="mt-2 font-heading text-2xl font-semibold tracking-tight">
              Latest results
            </p>
          </div>
          <Link
            to="/feed"
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-sm py-2 text-sm font-medium text-brand hover:underline"
          >
            All results
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {matches.length === 0 ? (
          <p className="mt-5 rounded-sm border border-dashed border-border bg-card/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No verified matches yet. Record the first one and get everyone to sign off.
          </p>
        ) : (
          <ul className="mt-5 overflow-hidden rounded-sm border border-border bg-card">
            {matches.map((e) => (
              <MatchRow match={e} key={e.id} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
