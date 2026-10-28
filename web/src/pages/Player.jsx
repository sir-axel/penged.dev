import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { formatRecord, playerName } from "@/lib/ladder";
import { Avatar } from "@/components/Avatar";
import { LevelBar } from "@/components/LevelBar";
import { Stat } from "@/components/Stat";
import { MatchRow } from "@/components/MatchRow";
import { api } from "@/api/client";

export function PlayerProfile() {
  let { username } = useParams(),
    { data: player, isLoading } = useQuery({
      queryKey: ["player", username],
      queryFn: async () => {
        let { items: t } = await api.entities.Player.filter(
          {
            username_lower: String(username || "").toLowerCase(),
          },
          {
            limit: 1,
          },
        );
        return t[0] || null;
      },
    }),
    { data: matches = [] } = useQuery({
      queryKey: ["player-matches", player?.id],
      enabled: !!player?.id,
      queryFn: async () =>
        (
          await api.entities.Match.filter(
            {
              all_player_ids: player.id,
              status: "verified",
            },
            {
              sort: "-created_date",
              limit: 20,
            },
          )
        ).items || [],
    });
  if (
    (useEffect(() => {
      if (!isLoading && !player) {
        let e = document.createElement("meta");
        return (
          (e.name = "prerender-status-code"),
          (e.content = "404"),
          document.head.appendChild(e),
          () => e.remove()
        );
      }
    }, [isLoading, player]),
    isLoading)
  )
    return (
      <div className="flex justify-center py-24">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  if (!player)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          title="No player with that username"
          body="Check the spelling, or browse the ladder to find who you are looking for."
          action={
            <Link
              to="/leaderboard"
              className="rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Back to the ladder
            </Link>
          }
        />
      </div>
    );
  let singlesPlayed = (player.singles_wins || 0) + (player.singles_losses || 0),
    doublesPlayed = (player.doubles_wins || 0) + (player.doubles_losses || 0);
  return (
    <>
      <PageHeader eyebrow={`@${player.username}`} title={playerName(player)} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex items-center gap-4">
            <Avatar name={playerName(player)} src={player.avatar_url} size={72} />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Singles rank
              </p>
              <p className="font-heading text-2xl font-bold leading-none">
                {player.singles_rank ? `#${player.singles_rank}` : "—"}
              </p>
              {(player.win_streak || 0) >= 2 && (
                <p className="mt-1 font-display text-[0.55rem] uppercase tracking-[0.16em] text-brand">
                  {player.win_streak}W STREAK
                </p>
              )}
              {player.under_review && (
                <p className="mt-1 inline-flex rounded-sm border border-destructive/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-destructive">
                  under review
                </p>
              )}
            </div>
          </div>
          <div className="sm:ml-auto sm:w-64">
            <LevelBar xp={player.xp || 0} />
            {player.bio && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{player.bio}</p>
            )}
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Singles rating" value={player.singles_rating || 1400} />
          <Stat label="Doubles rating" value={player.doubles_rating || 1400} />
          <Stat
            label="Singles record"
            value={formatRecord(player.singles_wins, player.singles_losses)}
          />
          <Stat
            label="Doubles record"
            value={formatRecord(player.doubles_wins, player.doubles_losses)}
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Verified matches" value={singlesPlayed + doublesPlayed} />
          <Stat label="Wins" value={(player.singles_wins || 0) + (player.doubles_wins || 0)} />
          <Stat
            label="Losses"
            value={(player.singles_losses || 0) + (player.doubles_losses || 0)}
          />
          <Stat label="Level" value={player.level || 1} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Win streak" value={player.win_streak || 0} />
          <Stat label="Best streak" value={player.best_streak || 0} />
        </div>
        <section className="mt-8">
          <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Match history
          </h2>
          {matches.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No verified matches yet"
                body="Only matches all players have signed off appear here."
              />
            </div>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-sm border border-border bg-card">
              {matches.map((e) => (
                <MatchRow match={e} key={e.id} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
