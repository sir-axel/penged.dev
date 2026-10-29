import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { useQuery } from "@tanstack/react-query";
import { RatingChart } from "@/components/RatingChart";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { formatRecord, matchesPlayed, playerName, isInactive, isProvisional, overallRating, rankFor, ratingFor, streakFor, bestStreakFor, settlingHint } from "@/lib/ladder";
import { Avatar } from "@/components/Avatar";
import { TierBadge, TIER_STYLE } from "@/components/TierBadge";
import { tierFor, nextTier, tierProgress } from "@/lib/tiers";
import { LevelBar } from "@/components/LevelBar";
import { Stat } from "@/components/Stat";
import { MatchRow } from "@/components/MatchRow";
import { api } from "@/api/client";

function TierProgress({ player, format }) {
  const rating = ratingFor(player, format);
  const played = (player[`${format}_wins`] || 0) + (player[`${format}_losses`] || 0);
  const next = nextTier(rating);
  const placing = isProvisional(player, format);
  return (
    <div className="mt-3" data-testid={`tier-${format}`}>
      <div className="flex flex-wrap items-center gap-2">
        <TierBadge rating={rating} played={played} size="md" />
        {!placing && (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {next ? `${tierFor(rating).name} · ${next.pointsToGo} to ${next.tier.name}` : `${tierFor(rating).name} · top tier`}
          </span>
        )}
      </div>
      {!placing && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(tierProgress(rating) * 100)} aria-label={`${format} tier progress`}>
          <div className="h-full" style={{ width: `${Math.round(tierProgress(rating) * 100)}%`, backgroundColor: TIER_STYLE[tierFor(rating).key].bd }} />
        </div>
      )}
    </div>
  );
}

function MessageButton({ player }) {
  const nav = useNavigate();
  const { isAuthenticated } = useAuth();
  const { player: me } = useMyPlayer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!isAuthenticated || !me || me.id === player.id) return null;
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.functions.invoke("dmStart", { player_id: player.id });
      nav(`/chat/dm/${data.thread.id}`);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Could not start a conversation.");
      setBusy(false);
    }
  };
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 border border-foreground bg-card px-4 py-2 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary disabled:opacity-50"
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        Message
      </button>
      {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function FormatBlock({ player, format }) {
  const name = format === "doubles" ? "Doubles" : "Singles";
  const rank = rankFor(player, format);
  const streak = streakFor(player, format);
  return (
    <section className="border border-border bg-card p-4" aria-label={`${name} ladder`} data-testid={`block-${format}`}>
      <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">{name}</h2>
      <div className="mt-2 flex items-start gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Rating</p>
          <p className="font-heading text-2xl font-bold leading-none">{matchesPlayed(player, format) ? ratingFor(player, format) : "nil"}</p>
          {settlingHint(player, format) && (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground" title="Still settling: results move this rating more until it firms up." data-testid="settling-hint">
              {settlingHint(player, format)}
            </p>
          )}
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Rank</p>
          <p className="font-heading text-2xl font-bold leading-none">{rank ? `#${rank}` : "—"}</p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Matches</p>
          <p className="font-heading text-2xl font-bold leading-none">
            {formatRecord(player[`${format}_wins`], player[`${format}_losses`])}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {`Games ${formatRecord(player[`${format}_game_wins`], player[`${format}_game_losses`])}`}
          </p>
        </div>
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {`Streak ${streak} · best ${bestStreakFor(player, format)}`}
      </p>
      <TierProgress player={player} format={format} />
      <div className="mt-1 flex flex-wrap gap-1.5">
        {streak >= 2 && (
          <span className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-brand">{streak}W STREAK</span>
        )}
        {isProvisional(player, format) && (
          <span className="rounded-sm border border-brand/50 px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.12em] text-brand">
            provisional
          </span>
        )}
      </div>
      {isInactive(player, format) && (
        <p className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground">
          {`Inactive: no ${format} match in 30 days. Play one to be ranked again.`}
        </p>
      )}
    </section>
  );
}

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
      <>
        <BackButton fallback="/leaderboard" />
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <EmptyState
            title="No player with that username"
            body="Check the spelling, or browse the ladder to find who you are looking for."
          />
        </div>
      </>
    );
  let singlesPlayed = (player.singles_wins || 0) + (player.singles_losses || 0),
    doublesPlayed = (player.doubles_wins || 0) + (player.doubles_losses || 0);
  return (
    <>
      <BackButton fallback="/leaderboard" />
      <PageHeader eyebrow={`@${player.username}`} title={playerName(player)} />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex items-center gap-4">
            <Avatar name={playerName(player)} src={player.avatar_url} size={72} player={player} />
            {player.under_review && (
              <p className="inline-flex rounded-sm border border-destructive/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-destructive">
                under review
              </p>
            )}
          </div>
          <div className="sm:ml-auto sm:w-64">
            <LevelBar xp={player.xp || 0} />
            {player.bio && (
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{player.bio}</p>
            )}
          </div>
        </div>
        <MessageButton player={player} />
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {["singles", "doubles"].map((fmt) => (
            <FormatBlock player={player} format={fmt} key={fmt} />
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {`Overall ${overallRating(player)} · a display blend of the two ratings, not a rating of its own`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Verified matches" value={singlesPlayed + doublesPlayed} />
          <Stat label="Wins" value={(player.singles_wins || 0) + (player.doubles_wins || 0)} />
          <Stat label="Losses" value={(player.singles_losses || 0) + (player.doubles_losses || 0)} />
          <Stat label="Level" value={player.level || 1} />
        </div>
        <RatingChart player={player} />
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
