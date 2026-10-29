import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { matchesPlayed, overallRating, playerName, PROVISIONAL_MATCHES, ACTIVE_DAYS, isInactive, rankFor, ratingFor, streakFor } from "@/lib/ladder";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LadderRow } from "@/components/LadderRow";
import { api } from "@/api/client";
import { EloButton } from "@/components/EloButton";

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
    [search, setSearch] = useState(""),
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
    inactiveRows = useMemo(
      () =>
        view === "overall"
          ? []
          : players
              .filter((p) => isInactive(p, view))
              .sort((a, b) => ratingFor(b, view) - ratingFor(a, view))
              .map((e) => ({
                player: e,
                rank: 0,
                rating: ratingFor(e, view),
                wins: e[`${view}_wins`] || 0,
                losses: e[`${view}_losses`] || 0,
                streak: 0,
              })),
      [players, view],
    ),
    // Never played this format (or anything, for Overall): no rank, rating shown as "nil", listed last.
    unratedRows = useMemo(() => {
      const played = (p) => (view === "overall" ? matchesPlayed(p, "singles") + matchesPlayed(p, "doubles") : matchesPlayed(p, view));
      return players
        .filter((p) => played(p) === 0)
        .sort((a, b) => playerName(a).localeCompare(playerName(b)))
        .map((e) => ({ player: e, rank: 0, rating: null, wins: 0, losses: 0, streak: 0 }));
    }, [players, view]),
    rows = useMemo(() => {
      if (view === "overall") {
        // Display-only blend of two independent ratings; computed here, never stored or fed back.
        return players
          .filter((e) => matchesPlayed(e, "singles") + matchesPlayed(e, "doubles") > 0)
          .sort((e, t) => overallRating(t) - overallRating(e))
          .map((e, t) => ({
            player: e,
            rank: t + 1,
            rating: overallRating(e),
            wins: (e.singles_wins || 0) + (e.doubles_wins || 0),
            losses: (e.singles_losses || 0) + (e.doubles_losses || 0),
          }));
      }
      // Singles and doubles ranks both come from the API (own rank SQL per format); no client ranking.
      return players
        .filter((e) => rankFor(e, view) > 0)
        .sort((e, t) => rankFor(e, view) - rankFor(t, view))
        .map((e) => ({
          player: e,
          rank: rankFor(e, view),
          rating: ratingFor(e, view),
          wins: e[`${view}_wins`] || 0,
          losses: e[`${view}_losses`] || 0,
          streak: streakFor(e, view),
        }));
    }, [players, view]);
  // Search keeps everyone's real rank; it only hides the rows that don't match.
  const q = search.trim().toLowerCase();
  const shown = (list) =>
    q ? list.filter((e) => playerName(e.player).toLowerCase().includes(q) || String(e.player.username || "").toLowerCase().includes(q)) : list;
  return (
    <>
      <PageHeader
        eyebrow="Ladder"
        title="Leaderboard"
        description="Ranked by rating, on verified matches only."
        action={<EloButton format={view} />}
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
        <div className="mb-4 flex gap-1" aria-label="Leaderboards">
          <span aria-current="page" className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-sm bg-primary px-3 font-heading text-sm font-medium text-primary-foreground sm:flex-none">
            Players
          </span>
          <Link to="/guilds" className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-sm px-3 font-heading text-sm font-medium text-muted-foreground hover:bg-secondary sm:flex-none">
            Guilds
          </Link>
        </div>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a player"
            aria-label="Find a player on the leaderboard"
            className="h-11 w-full rounded-sm border border-input bg-card pl-9 pr-3 text-base outline-none focus:border-foreground/40 lg:text-sm"
            data-testid="ladder-search"
          />
        </div>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : rows.length === 0 && unratedRows.length === 0 ? (
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
              {shown(rows).map((e) => (
                <LadderRow {...e} format={view} provisional={e.wins + e.losses < PROVISIONAL_MATCHES} key={e.player.id} />
              ))}
              {shown(unratedRows).map((e) => (
                <LadderRow {...e} format={view} unrated key={e.player.id} />
              ))}
            </ul>
            {q && shown(rows).length + shown(unratedRows).length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{`Nobody on this ladder matches "${search.trim()}".`}</p>
            )}
          </div>
        )}
        {view !== "overall" && shown(inactiveRows).length > 0 && (
          <section className="mt-6" aria-label="Inactive players">
            <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
              Inactive
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {`No verified ${view} match in ${ACTIVE_DAYS} days, so off the ranked ladder. Play one and you are back, with your rating intact.`}
            </p>
            <ul className="mt-2 overflow-hidden rounded-sm border border-border bg-card opacity-80">
              {shown(inactiveRows).map((e) => (
                <LadderRow {...e} format={view} inactive provisional={e.wins + e.losses < PROVISIONAL_MATCHES} key={e.player.id} />
              ))}
            </ul>
          </section>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {view === "singles"
            ? "Singles rank is rating order for active players (a verified singles match in the last 30 days). Ties go to whoever has played more. Players with no singles match yet show nil and sit at the bottom until their first verified result."
            : view === "doubles"
              ? "Doubles is its own ladder: doubles rating, doubles rank, doubles activity. It only moves on verified doubles results and never touches singles. No doubles match yet = nil, at the bottom."
              : "Overall is only a blend of your two separate ratings, weighted by how much you have played each. It is not used for any rating or rank."}
        </p>
        <Link to="/rules" className="inline-flex min-h-10 items-center text-xs text-brand underline underline-offset-2">
          How ranking works
        </Link>
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
