import { Link } from "react-router-dom";
import { Avatar } from "@/components/Avatar";
import { playerName } from "@/lib/ladder";
import { TierBadge } from "@/components/TierBadge";

export function LadderRow({ rank, player, rating: rating, wins = 0, losses = 0, provisional = false, inactive = false, streak = 0 }) {
  return (
    <li className="border-b border-border last:border-0">
      <Link
        to={`/players/${player.username}`}
        className="flex min-h-[52px] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/60"
      >
        <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {inactive ? "—" : String(rank).padStart(2, "0")}
        </span>
        <Avatar name={playerName(player)} src={player.avatar_url} size={30} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-heading text-sm font-semibold">
              {playerName(player)}
            </span>
            <TierBadge rating={rating} played={wins + losses} />
            {player.under_review && (
              <span className="shrink-0 rounded-sm border border-destructive/40 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-destructive">
                review
              </span>
            )}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {"lvl "}
            {player.level || 1}
            {" · "}
            {wins}W–{losses}L
            {streak >= 2 && (
              <span className="ml-1.5 text-brand">{` · ${streak}W STREAK`}</span>
            )}
          </span>
        </span>
        <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums">{rating}</span>
      </Link>
    </li>
  );
}
