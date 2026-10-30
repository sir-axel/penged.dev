import { Link } from "react-router-dom";
import { ArrowUp, ArrowDown } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { timeAgo } from "@/lib/timeAgo";
import { isPlacementChange } from "@/lib/ladder";

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");

/** One side of a match: W/L block, names, each player's rating change, set score. */
function SideLine({ players = [], games, won, decided, changes, pov, unranked }) {
  const change = (id) => changes.find((c) => c.player_id === id);
  return (
    <div className="flex items-center gap-2.5" data-side={won ? "win" : "loss"}>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm font-heading text-xs font-bold ${!decided ? "bg-secondary text-muted-foreground" : won ? "bg-success text-white" : "bg-destructive/15 text-destructive"}`}
        aria-label={decided ? (won ? "Won" : "Lost") : undefined}
      >
        {decided ? (won ? "W" : "L") : "·"}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {players.map((e, i) => {
          const c = change(e.player_id);
          const d = c?.delta;
          const hidden = isPlacementChange(c); // placement match: the number stays hidden
          return (
            <span key={e.player_id} className="inline-flex min-w-0 items-baseline gap-1.5">
              {i > 0 && <span className="text-muted-foreground">&</span>}
              <span
                className={`truncate font-heading text-[15px] ${won ? "font-bold text-foreground" : "text-muted-foreground"} ${pov === e.player_id ? "underline decoration-2 underline-offset-4" : ""}`}
              >
                {e.display_name || e.username}
              </span>
              {d != null && !unranked && hidden && (
                <span
                  className={`self-center ${d >= 0 ? "text-success" : "text-destructive"}`}
                  aria-label={`placement match: rating ${d >= 0 ? "up" : "down"}`}
                  title="Placement match: amount hidden"
                >
                  {d >= 0 ? <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />}
                </span>
              )}
              {d != null && !unranked && !hidden && (
                <span className={`font-mono text-[11px] font-semibold tabular-nums ${d >= 0 ? "text-success" : "text-destructive"}`}>{signed(d)}</span>
              )}
            </span>
          );
        })}
      </span>
      <span className={`shrink-0 font-heading text-xl font-bold tabular-nums leading-none ${won ? "text-foreground" : "text-muted-foreground"}`}>{games}</span>
    </div>
  );
}

/**
 * A match in a list. Each side reads as W or L at a glance, with every player's rating change and the set score;
 * game scores underneath. `pov` = a player id: a stripe in their result colour and their name underlined.
 */
export function MatchRow({ match, pov }) {
  const aWon = match.winner_side === "a";
  const decided = !!match.winner_side;
  const povSide = pov ? (match.side_a?.some((e) => e.player_id === pov) ? "a" : match.side_b?.some((e) => e.player_id === pov) ? "b" : null) : null;
  const povWon = povSide ? match.winner_side === povSide : null;
  const unranked = match.ranked === false;
  const changes = match.status === "verified" ? match.rating_changes || [] : [];
  const xp = povSide && unranked ? changes.find((x) => x.player_id === pov)?.xp_gained : null;
  return (
    <li className="relative border-b border-border last:border-0" data-result={povSide ? (povWon ? "win" : "loss") : undefined}>
      {povSide && <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${povWon ? "bg-success" : "bg-destructive"}`} />}
      <Link
        to={`/matches/${match.id}`}
        className={`block space-y-2 py-3 pr-3 transition-colors hover:bg-secondary/60 ${povSide ? "pl-4" : "pl-3"} ${povSide ? (povWon ? "bg-success/[0.06]" : "bg-destructive/[0.05]") : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {match.format === "doubles" ? "Doubles" : "Singles"}
            {" · to "}
            {match.target}
            {unranked && <span className="ml-1.5 rounded-sm border border-border px-1 py-px">unranked</span>}
            {xp > 0 && <span className="ml-1.5">{`+${xp} xp`}</span>}
          </span>
          {match.status === "verified" ? (
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {timeAgo(match.verified_at || match.created_date)}
            </span>
          ) : (
            <StatusBadge status={match.status} />
          )}
        </div>
        <SideLine players={match.side_a} games={match.games_a} won={aWon} decided={decided} changes={changes} pov={pov} unranked={unranked} />
        <SideLine players={match.side_b} games={match.games_b} won={decided && !aWon} decided={decided} changes={changes} pov={pov} unranked={unranked} />
        {(match.games || []).length > 0 && (
          <p className="pl-[34px] font-mono text-[11px] tabular-nums text-muted-foreground">
            {match.games.map((g) => `${g.a}–${g.b}`).join("  ·  ")}
          </p>
        )}
      </Link>
    </li>
  );
}
