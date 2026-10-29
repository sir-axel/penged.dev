import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TierEmblem } from "@/components/TierEmblem";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { TIERS, tierFor, PROVISIONAL } from "@/lib/tiers";
import { matchesPlayed, ratingFor } from "@/lib/ladder";

const range = (i) => {
  const t = TIERS[i];
  const next = TIERS[i + 1];
  if (i === 0) return `under ${next.min}`;
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
      if (matchesPlayed(p, fmt) < PROVISIONAL) continue; // placement players hold no tier yet
      const k = tierFor(ratingFor(p, fmt)).key;
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [players, fmt]);
  const mine = me && matchesPlayed(me, fmt) >= PROVISIONAL ? tierFor(ratingFor(me, fmt)).key : null;
  const placing = me ? Math.max(0, PROVISIONAL - matchesPlayed(me, fmt)) : 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={`inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-sm bg-secondary px-3 font-heading text-sm font-medium text-foreground hover:bg-secondary/70 sm:self-auto ${className}`}
        >
          <TierEmblem tierKey={mine || "gold"} size={16} />
          elo :)
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] max-w-2xl overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div>
          <p className="font-display text-[0.58rem] uppercase tracking-[0.2em] text-brand">{`${fmt} ladder`}</p>
          <DialogTitle className="mt-2 font-heading text-2xl font-bold tracking-tight">The ranks</DialogTitle>
          <DialogDescription className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {`Your tier comes straight from your ${fmt} rating. Everyone starts at 1400 and plays ${PROVISIONAL} placement matches before a tier shows.`}
          </DialogDescription>
        </div>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TIERS.map((t, i) => {
            const you = mine === t.key;
            return (
              <li
                key={t.key}
                data-testid={`tier-${t.key}`}
                className={`flex items-center gap-3 rounded-sm border p-3 ${you ? "border-foreground" : "border-border"}`}
                style={{ backgroundColor: `var(--tier-${t.key}-bg)` }}
              >
                <TierEmblem tierKey={t.key} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-heading text-base font-bold" style={{ color: `var(--tier-${t.key}-fg)` }}>
                    {t.name}
                    {you && (
                      <span className="rounded-sm bg-foreground px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-background">you</span>
                    )}
                  </p>
                  <p className="font-mono text-xs tabular-nums" style={{ color: `var(--tier-${t.key}-fg)` }}>{range(i)}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em] opacity-75" style={{ color: `var(--tier-${t.key}-fg)` }}>
                    {counts[t.key] ? `${counts[t.key]} player${counts[t.key] === 1 ? "" : "s"}` : "nobody yet"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {me && placing > 0 && (
          <p className="text-xs text-muted-foreground">{`You are in placement: ${placing} more ${fmt} match${placing === 1 ? "" : "es"} to reveal your tier.`}</p>
        )}
        <Link to="/rules" className="inline-flex min-h-10 items-center text-xs text-brand underline underline-offset-2">
          How ratings work
        </Link>
      </DialogContent>
    </Dialog>
  );
}
