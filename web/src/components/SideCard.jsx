import { paddleLabel } from "@/components/match/PaddleToggle";
import { Link } from "react-router-dom";
import { Avatar } from "@/components/Avatar";
import { TierBadge } from "@/components/TierBadge";

export function SideCard({ side, gamesWon: gamesWon, winner: winner, label: label, tiers = {} }) {
  return (
    <div
      className={`rounded-sm border p-3 ${winner ? "border-success/40 bg-success/5" : "border-border bg-card"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p
          className={`font-mono text-2xl leading-none tabular-nums ${winner ? "text-success" : ""}`}
        >
          {gamesWon || 0}
        </p>
      </div>
      <ul className="mt-2.5 space-y-2">
        {(side || []).map((e) => (
          <li className="flex items-center gap-2" key={e.player_id}>
            <Avatar name={e.display_name || e.username} src={e.avatar_url} size={26} />
            {/* On phones the paddle tag sits under the name so the name keeps its width. */}
            <div className="flex min-w-0 flex-1 flex-col items-start sm:flex-row sm:items-center sm:gap-2">
              <Link
                to={`/players/${e.username}`}
                className="w-full min-w-0 truncate pt-2 font-heading text-sm font-medium hover:underline sm:w-auto sm:flex-1 sm:py-1"
              >
                {e.display_name || e.username}
              </Link>
              {tiers[e.player_id] && (
                <TierBadge
                  tier={tiers[e.player_id].tier ?? tiers[e.player_id]}
                  played={tiers[e.player_id].played}
                  className="mb-1.5 sm:mb-0"
                />
              )}
              <span className="mb-1.5 shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground sm:mb-0">
                {paddleLabel(e.paddle)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
