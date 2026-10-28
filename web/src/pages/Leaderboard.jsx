import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { matchesPlayed, overallRating } from "@/lib/ladder";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LadderRow } from "@/components/LadderRow";
import { api } from "@/api/client";

export const BOARD_TABS = [
  {
    key: "singles",
    label: "Singles",
  },
  {
    key: "doubles",
    label: "Doubles",
  },
  {
    key: "overall",
    label: "Overall",
  },
];
export function Leaderboard() {
  let [view, setView] = useState("singles"),
    { player: me } = useMyPlayer(),
    { data: players = [], isLoading } = useQuery({
      queryKey: ["players"],
      queryFn: async () =>
        (
          await api.entities.Player.list({
            limit: 300,
          })
        ).items || [],
    }),
    rows = useMemo(() => {
      let t = [...players];
      return view === "singles"
        ? t
            .filter((e) => Number(e.singles_rank) > 0)
            .sort((e, t) => e.singles_rank - t.singles_rank)
            .map((e) => ({
              player: e,
              rank: e.singles_rank,
              rating: e.singles_rating || 1400,
              wins: e.singles_wins || 0,
              losses: e.singles_losses || 0,
            }))
        : view === "doubles"
          ? t
              .sort((e, t) => (t.doubles_rating || 1400) - (e.doubles_rating || 1400))
              .map((e, t) => ({
                player: e,
                rank: t + 1,
                rating: e.doubles_rating || 1400,
                wins: e.doubles_wins || 0,
                losses: e.doubles_losses || 0,
              }))
          : t
              .sort((e, t) => overallRating(t) - overallRating(e))
              .map((e, t) => ({
                player: e,
                rank: t + 1,
                rating: overallRating(e),
                wins: (e.singles_wins || 0) + (e.doubles_wins || 0),
                losses: (e.singles_losses || 0) + (e.doubles_losses || 0),
              }));
    }, [players, view]);
  return (
    <>
      <PageHeader
        eyebrow="Ladder"
        title="Leaderboard"
        description="Ranked by rating, on verified matches only."
      />
      <div className="sticky top-14 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div
          className="mx-auto flex max-w-5xl gap-1 px-4 py-2 sm:px-6"
          role="tablist"
          aria-label="Leaderboard view"
        >
          {BOARD_TABS.map((n) => (
            <button
              role="tab"
              aria-selected={view === n.key}
              onClick={() => setView(n.key)}
              className={`min-h-[40px] flex-1 rounded-sm px-3 font-heading text-sm font-medium transition-colors sm:flex-none ${view === n.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
              key={n.key}
            >
              {n.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nobody on the ladder yet"
            body="Create a profile and record the first match to open the table."
            action={
              <Link
                to={me ? "/matches/new" : "/register"}
                className="rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
              >
                {me ? "Record a match" : "Join the ladder"}
              </Link>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-sm border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="w-7">#</span>
              <span className="w-[30px]" />
              <span className="flex-1">Player</span>
              <span className="w-12 text-right">
                {view === "singles" || view === "doubles" ? "Rating" : "Score"}
              </span>
            </div>
            <ul>
              {rows.map((e) => (
                <LadderRow {...e} key={e.player.id} />
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {view === "singles"
            ? "Singles rank is rating order. Ties go to whoever has played more."
            : view === "doubles"
              ? "Doubles rating is a separate pool — it only moves on verified doubles results."
              : "Overall weights your singles and doubles ratings by how much you have played each."}{" "}
          <Link to="/rules" className="inline-block py-3 text-brand underline underline-offset-2 sm:py-0">
            How ranking works
          </Link>
        </p>
        {me && view === "overall" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {"You have played "}
            {matchesPlayed(me, "singles") + matchesPlayed(me, "doubles")}
            {" verified matches."}
          </p>
        )}
      </div>
    </>
  );
}
