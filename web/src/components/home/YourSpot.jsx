import { Link } from "react-router-dom";
import { formatRecord, playerName } from "@/lib/ladder";
import { LevelBar } from "@/components/LevelBar";

export function YourSpot({ player, toConfirm = 0 }) {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Your spot
              </p>
              <p className="font-heading text-2xl font-bold leading-none">
                {player.singles_rank ? `#${player.singles_rank}` : "—"}
              </p>
            </div>
            <div className="h-9 w-px bg-border" />
            <div className="min-w-0">
              <p className="truncate font-heading text-sm font-semibold">{playerName(player)}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {player.singles_rating}
                {" singles · "}
                {formatRecord(player.singles_wins, player.singles_losses)}
              </p>
            </div>
            <div className="ml-auto hidden w-32 sm:block">
              <LevelBar xp={player.xp || 0} />
            </div>
          </div>
          <div className="flex gap-2">
            {toConfirm > 0 && (
              <Link
                to="/matches"
                className="flex-1 rounded-sm border border-warning/40 bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning sm:flex-none"
              >
                {toConfirm}
                {" to confirm"}
              </Link>
            )}
            <Link
              to="/challenges"
              className="flex-1 rounded-sm border border-border px-3 py-2 text-center text-xs font-medium hover:border-foreground/40 sm:flex-none"
            >
              Challenge up
            </Link>
          </div>
        </div>
        <div className="mt-4 sm:hidden">
          <LevelBar xp={player.xp || 0} />
        </div>
      </div>
    </section>
  );
}
