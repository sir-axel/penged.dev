import { Link } from "react-router-dom";
import { formatRecord, playerName, overallRating, rankFor, ratingFor, streakFor, isProvisional, isInactive } from "@/lib/ladder";
import { LevelBar } from "@/components/LevelBar";
import { TierBadge } from "@/components/TierBadge";
import { nextTier } from "@/lib/tiers";

export function YourSpot({ player, toConfirm = 0 }) {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-heading text-sm font-semibold">{playerName(player)}</p>
              <div className="hidden w-32 sm:block">
                <LevelBar xp={player.xp || 0} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["singles", "doubles"].map((fmt) => {
                const rank = rankFor(player, fmt);
                const streak = streakFor(player, fmt);
                return (
                  <div key={fmt} data-testid={`yourspot-${fmt}`}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {`${fmt} rank`}
                    </p>
                    <p className="font-heading text-2xl font-bold leading-none">{rank ? `#${rank}` : "—"}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {ratingFor(player, fmt)}
                      {" · "}
                      {`Matches ${formatRecord(player[`${fmt}_wins`], player[`${fmt}_losses`])}`}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {`Games ${formatRecord(player[`${fmt}_game_wins`], player[`${fmt}_game_losses`])}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <TierBadge rating={ratingFor(player, fmt)} played={(player[`${fmt}_wins`] || 0) + (player[`${fmt}_losses`] || 0)} />
                      {!isProvisional(player, fmt) && nextTier(ratingFor(player, fmt)) && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {`${nextTier(ratingFor(player, fmt)).pointsToGo} to ${nextTier(ratingFor(player, fmt)).tier.name}`}
                        </span>
                      )}
                    </div>
                    <p className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-brand">
                      {streak >= 2 && `${streak}W STREAK `}
                      {isProvisional(player, fmt) && "provisional "}
                      {isInactive(player, fmt) && <span className="text-muted-foreground">inactive</span>}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {`Overall ${overallRating(player)}`}
            </p>
          </div>
          <div className="flex gap-2">
            {toConfirm > 0 && (
              <Link
                to="/confirm"
                className="flex-1 rounded-sm border border-warning/40 bg-warning/10 px-3 py-3 text-center text-xs font-medium sm:py-2 text-warning sm:flex-none"
              >
                {toConfirm}
                {" to confirm"}
              </Link>
            )}
            <Link
              to="/challenges"
              className="flex-1 rounded-sm border border-border px-3 py-3 text-center text-xs font-medium sm:py-2 hover:border-foreground/40 sm:flex-none"
            >
              Challenge up (singles)
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
