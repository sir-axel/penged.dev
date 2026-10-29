import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { ResultRow } from "@/components/ResultRow";

/** A match in a list. `pov` = a player id: the row reads from that player's side (W/L stripe, their rating change). */
export function MatchRow({ match, pov }) {
  let aWon = match.winner_side === "a";
  const povSide = pov ? (match.side_a?.some((e) => e.player_id === pov) ? "a" : match.side_b?.some((e) => e.player_id === pov) ? "b" : null) : null;
  const povWon = povSide ? match.winner_side === povSide : null;
  const delta = povSide && match.status === "verified" ? (match.rating_changes || []).find((x) => x.player_id === pov) : null;
  const unranked = match.ranked === false;
  return (
    <li className="relative border-b border-border last:border-0" data-result={povSide ? (povWon ? "win" : "loss") : undefined}>
      {povSide && (
        <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${povWon ? "bg-success" : "bg-destructive"}`} />
      )}
      <Link
        to={`/matches/${match.id}`}
        className={`block py-3 pr-3 transition-colors hover:bg-secondary/60 ${povSide ? "pl-4" : "pl-3"} ${povSide ? (povWon ? "bg-success/[0.06]" : "bg-destructive/[0.05]") : ""}`}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {povSide && (
              <span
                className={`rounded-sm px-1.5 py-0.5 font-heading text-[11px] font-bold tracking-normal ${povWon ? "bg-success text-white" : "bg-destructive text-white"}`}
                aria-label={povWon ? "Win" : "Loss"}
              >
                {povWon ? "W" : "L"}
              </span>
            )}
            <span>
              {match.format === "doubles" ? "Doubles" : "Singles"}
              {" · to "}
              {match.target}
              {unranked && " · unranked"}
            </span>
            {delta && !unranked && (
              <span className={`font-mono text-[11px] font-semibold tabular-nums tracking-normal ${delta.delta >= 0 ? "text-success" : "text-destructive"}`}>
                {delta.delta > 0 ? `+${delta.delta}` : delta.delta}
              </span>
            )}
            {delta && unranked && delta.xp_gained > 0 && (
              <span className="font-mono text-[11px] font-semibold tabular-nums tracking-normal text-muted-foreground">{`+${delta.xp_gained} xp`}</span>
            )}
          </span>
          <StatusBadge status={match.status} />
        </div>
        <div className="space-y-1">
          <ResultRow players={match.side_a} games={match.games_a} won={aWon} pov={povSide === "a"} />
          <ResultRow players={match.side_b} games={match.games_b} won={!aWon} pov={povSide === "b"} />
        </div>
      </Link>
    </li>
  );
}
