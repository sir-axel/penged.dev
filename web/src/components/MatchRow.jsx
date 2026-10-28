import { Link } from "react-router-dom";
import { StatusBadge } from "@/components/StatusBadge";
import { ResultRow } from "@/components/ResultRow";

export function MatchRow({ match }) {
  let aWon = match.winner_side === "a";
  return (
    <li className="border-b border-border last:border-0">
      <Link
        to={`/matches/${match.id}`}
        className="block px-3 py-3 transition-colors hover:bg-secondary/60"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {match.format === "doubles" ? "Doubles" : "Singles"}
            {" · to "}
            {match.target}
          </span>
          <StatusBadge status={match.status} />
        </div>
        <div className="space-y-1">
          <ResultRow players={match.side_a} games={match.games_a} won={aWon} />
          <ResultRow players={match.side_b} games={match.games_b} won={!aWon} />
        </div>
      </Link>
    </li>
  );
}
