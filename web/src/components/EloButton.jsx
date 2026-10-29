import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TierEmblem } from "@/components/TierEmblem";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { TIERS, tierFor, nextTier, tierProgress, PROVISIONAL } from "@/lib/tiers";
import { matchesPlayed, ratingFor } from "@/lib/ladder";

const range = (i) => {
  const t = TIERS[i];
  const next = TIERS[i + 1];
  if (i === 0) return `700–${next.min - 1}`; // 700 is the rating floor
  return next ? `${t.min}–${next.min - 1}` : `${t.min}+`;
};

/** The "elo :)" button: opens every tier emblem with its rating range, how many players hold it, and where you are. */
export function EloButton({ format = "singles", className = "" }) {
  const fmt = format === "doubles" ? "doubles" : "singles";
  const { player: me } = useMyPlayer();
  const { data: players = [] } = useQuery({
    queryKey: ["players"],
    queryFn: async () => (await api.entities.Player.list({ limit: 300 })).items || [],
  });
  const counts = useMemo(() => {
    const c = {};
    for (const p of players) {
      if (matchesPlayed(p, fmt) < PROVISIONAL) {
        c.unranked = (c.unranked || 0) + 1; // new and placement players hold no tier yet
        continue;
      }
      const k = tierFor(ratingFor(p, fmt)).key;
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [players, fmt]);
  const mine = me && matchesPlayed(me, fmt) >= PROVISIONAL ? tierFor(ratingFor(me, fmt)).key : null;
  const myRating = me ? ratingFor(me, fmt) : 0;
  const placing = me ? Math.max(0, PROVISIONAL - matchesPlayed(me, fmt)) : 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-sm bg-secondary px-3 font-heading text-sm font-medium text-foreground hover:bg-secondary/70 sm:self-auto ${className}`}
        >
          <TierEmblem tierKey={mine || (me ? "unranked" : "gold")} size={16} />
          elo :)
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div>
          <p className="font-display text-[0.58rem] uppercase tracking-[0.2em] text-brand">{`${fmt} ladder`}</p>
          <DialogTitle className="mt-2 font-heading text-2xl font-bold tracking-tight">The ranks</DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {`Your tier comes straight from your ${fmt} rating. Everyone starts at 1400 and plays ${PROVISIONAL} placement matches before a tier shows.`}
          </DialogDescription>
        </div>
        {mine && (
          <div
            className="flex items-center gap-3 rounded-sm border p-3"
            style={{ backgroundColor: `var(--tier-${mine}-bg)`, borderColor: `var(--tier-${mine}-bd)` }}
            data-testid="elo-you"
          >
            <TierEmblem tierKey={mine} size={36} />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-bold" style={{ color: `var(--tier-${mine}-fg)` }}>
                {`You: ${tierFor(myRating).name} · ${myRating}`}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/70">
                <div className="h-full rounded-full" style={{ width: `${Math.round(tierProgress(myRating) * 100)}%`, backgroundColor: `var(--tier-${mine}-bd)` }} />
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: `var(--tier-${mine}-fg)` }}>
                {nextTier(myRating) ? `${nextTier(myRating).pointsToGo} to ${nextTier(myRating).tier.name}` : "Top of the ladder"}
              </p>
            </div>
          </div>
        )}
        {me && placing > 0 && (
          <div className="flex items-center gap-3 rounded-sm border border-dashed border-muted-foreground/60 bg-secondary/60 p-3" data-testid="elo-you">
            <TierEmblem tierKey="unranked" size={36} />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-sm font-bold">You: Unranked</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/70">
                <div className="h-full rounded-full bg-muted-foreground" style={{ width: `${Math.round(((PROVISIONAL - placing) / PROVISIONAL) * 100)}%` }} />
              </div>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {`${PROVISIONAL - placing}/${PROVISIONAL} placement · ${placing} more ${fmt} match${placing === 1 ? "" : "es"} to reveal your tier`}
              </p>
            </div>
          </div>
        )}
        <ol className="relative" aria-label="Tiers, highest first">
          {/* the ladder rail behind the emblems */}
          <span aria-hidden="true" className="absolute bottom-8 left-[31px] top-8 w-[3px] rounded-full bg-gradient-to-b from-[var(--tier-grandmaster-bd)] via-[var(--tier-diamond-bd)] to-[var(--tier-wood-bd)] opacity-60" />
          {[...TIERS.keys()].reverse().map((i) => {
            const t = TIERS[i];
            const you = mine === t.key;
            const n = counts[t.key] || 0;
            return (
              <li key={t.key} data-testid={`tier-${t.key}`} className="relative flex items-center gap-4 py-1.5">
                <span
                  className={`relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border-2 shadow-sm ${you ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
                  style={{ backgroundColor: `var(--tier-${t.key}-bg)`, borderColor: `var(--tier-${t.key}-bd)` }}
                >
                  <TierEmblem tierKey={t.key} size={44} />
                </span>
                <div
                  className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-sm border px-3 py-2.5 ${you ? "" : "border-transparent"}`}
                  style={you ? { borderColor: `var(--tier-${t.key}-bd)`, backgroundColor: `var(--tier-${t.key}-bg)` } : undefined}
                >
                  <div className="min-w-0">
                    <p
                      className="flex items-center gap-2 font-heading text-base font-bold leading-tight"
                      // Grandmaster's fg is white for its solid tile; off the tile its name takes the tile colour.
                      style={{ color: t.key === "grandmaster" && !you ? "var(--tier-grandmaster-bg)" : `var(--tier-${t.key}-fg)` }}
                    >
                      {t.name}
                      {you && (
                        <span className="rounded-sm bg-foreground px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-background">you</span>
                      )}
                    </p>
                    <p className={`mt-0.5 font-mono text-xs tabular-nums ${you ? "" : "text-muted-foreground"}`} style={you ? { color: `var(--tier-${t.key}-fg)` } : undefined}>{range(i)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-heading text-lg font-bold leading-none tabular-nums">{n}</p>
                    <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{n === 1 ? "player" : "players"}</p>
                  </div>
                </div>
              </li>
            );
          })}
          <li data-testid="tier-unranked" className="relative flex items-center gap-4 py-1.5">
            <span
              className={`relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-sm border-2 border-dashed border-muted-foreground/60 bg-secondary ${me && placing > 0 ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`}
            >
              <TierEmblem tierKey="unranked" size={44} />
            </span>
            <div className={`flex min-w-0 flex-1 items-center justify-between gap-3 rounded-sm border px-3 py-2.5 ${me && placing > 0 ? "border-dashed border-muted-foreground/60 bg-secondary/60" : "border-transparent"}`}>
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-heading text-base font-bold leading-tight text-muted-foreground">
                  Unranked
                  {me && placing > 0 && (
                    <span className="rounded-sm bg-foreground px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-background">you</span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{`new or under ${PROVISIONAL} matches`}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-heading text-lg font-bold leading-none tabular-nums">{counts.unranked || 0}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">{counts.unranked === 1 ? "player" : "players"}</p>
              </div>
            </div>
          </li>
        </ol>

        <Link to="/rules" className="inline-flex min-h-10 items-center text-xs text-brand underline underline-offset-2">
          How ratings work
        </Link>
      </DialogContent>
    </Dialog>
  );
}
