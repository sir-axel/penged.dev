import { Link } from "react-router-dom";
import { ArrowUp, ArrowDown } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { allChips, CHIP_TONES } from "@/lib/feedChips";
import { timeAgo } from "@/lib/timeAgo";
import { isPlacementChange } from "@/lib/ladder";

export function Chip({ chip }) {
  return (
    <span
      data-testid={`chip-${chip.key}`}
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.1em] ${CHIP_TONES[chip.tone] || CHIP_TONES.muted}`}
    >
      {chip.label}
    </span>
  );
}

function Delta({ change }) {
  if (!change || !Number.isFinite(change.delta)) return null;
  if (isPlacementChange(change)) {
    // Placement match: only the direction shows, never the amount.
    const Arrow = change.delta >= 0 ? ArrowUp : ArrowDown;
    return (
      <span
        className={`flex w-9 shrink-0 justify-end ${change.delta >= 0 ? "text-success" : "text-destructive"}`}
        aria-label={`placement match: rating ${change.delta >= 0 ? "up" : "down"}`}
        title="Placement match: amount hidden"
        data-testid="placement-arrow"
      >
        <Arrow className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      </span>
    );
  }
  const up = change.delta >= 0;
  return (
    <span
      className={`w-9 shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${up ? "text-success" : "text-destructive"}`}
      aria-label={`rating ${up ? "gained" : "lost"} ${Math.abs(change.delta)}`}
    >
      {up ? "+" : "−"}
      {Math.abs(change.delta)}
    </span>
  );
}

function SideRow({ players, games, won, changes }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm font-heading text-xs font-bold ${won ? "bg-success text-white" : "bg-destructive/15 text-destructive"}`}
        aria-label={won ? "Won" : "Lost"}
      >
        {won ? "W" : "L"}
      </span>
      <span className="flex shrink-0 -space-x-2">
        {players.map((p) => (
          <Avatar key={p.player_id} name={p.display_name || p.username} src={p.avatar_url} size={28} className="ring-2 ring-card" />
        ))}
      </span>
      <span className={`min-w-0 flex-1 truncate font-heading text-[15px] ${won ? "font-bold text-foreground" : "text-muted-foreground"}`}>
        {players.map((p) => p.display_name || p.username).join(" & ")}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {players.map((p) => (
          <Delta key={p.player_id} change={changes.find((c) => c.player_id === p.player_id)} />
        ))}
      </span>
      <span className={`w-6 shrink-0 text-right font-heading text-xl font-bold leading-none tabular-nums ${won ? "text-foreground" : "text-muted-foreground"}`}>
        {games}
      </span>
    </div>
  );
}

export function FeedCard({ match }) {
  const aWon = match.winner_side === "a";
  const changes = match.ranked === false ? [] : match.rating_changes || [];
  const chips = allChips(match);
  return (
    <li className="border-b border-border last:border-0" data-testid="feed-card">
      <Link to={`/matches/${match.id}`} className="block px-3 py-3 transition-colors hover:bg-secondary/60">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {timeAgo(match.verified_at || match.created_date)}
            {" · "}
            {match.format === "doubles" ? "Doubles" : "Singles"}
            {" · to "}
            {match.target}
            {match.ranked === false && " · unranked"}
          </span>
          {chips.map((c) => (
            <Chip chip={c} key={c.key} />
          ))}
        </div>
        <div className="space-y-1.5">
          <SideRow players={match.side_a || []} games={match.games_a} won={aWon} changes={changes} />
          <SideRow players={match.side_b || []} games={match.games_b} won={!aWon} changes={changes} />
        </div>
        {(match.games || []).length > 0 && (
          <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
            {match.games.map((g) => `${g.a}–${g.b}`).join("  ·  ")}
          </p>
        )}
      </Link>
    </li>
  );
}
