import { Check } from "lucide-react";
import { PongTable } from "@/components/home/PongTable";

export const sideLabel = (e = []) =>
  e
    .map((e) => e.username || e.display_name)
    .filter(Boolean)
    .join(" + ") || "—";
export function HeroMatchCard({ match }) {
  let hasMatch = !!match,
    sideA = hasMatch ? sideLabel(match.side_a) : "Player one",
    sideB = hasMatch ? sideLabel(match.side_b) : "Player two",
    score = hasMatch ? `${match.games_a ?? 0}–${match.games_b ?? 0}` : "00–00";
  return (
    <div className="pixel-frame relative border border-foreground bg-card">
      <div className="flex items-center justify-between border-b border-foreground bg-secondary px-3 py-2 font-display text-[0.55rem] uppercase tracking-[0.16em]">
        <span>Table 01</span>
        <span>{hasMatch ? `Game ${match.games?.length || 1}` : "Warming up"}</span>
      </div>
      <div className="scanlines p-3 sm:p-4">
        <PongTable className="w-full text-foreground/80" />
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-[0.58rem] uppercase tracking-[0.1em]">
              {sideA}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Side a
            </p>
          </div>
          <p className="shrink-0 font-display text-base tabular-nums leading-none">{score}</p>
          <div className="min-w-0 text-right">
            <p className="truncate font-display text-[0.58rem] uppercase tracking-[0.1em]">
              {sideB}
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
              Side b
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-foreground/25 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
        {hasMatch ? "Confirmed by all players" : "Waiting on the first result"}
      </div>
    </div>
  );
}
