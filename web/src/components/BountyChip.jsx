import { bountyFor } from "@/lib/bounty";

// A tiny pixel crosshair.
const SIGHT = ["..####..", ".#....#.", "#..##..#", "#.#..#.#", "#.#..#.#", "#..##..#", ".#....#.", "..####.."];
export function Crosshair({ size = 10, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true" className={`shrink-0 ${className}`}>
      {SIGHT.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
}

/** "Bounty +20 elo · +60 xp" on a top-3 player (null for everyone else). */
export function BountyChip({ rank, streak = 0, className = "", long = false }) {
  const b = bountyFor(rank, streak);
  if (!b) return null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm border border-brand/50 bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-brand ${className}`}
      title={`Beat them in a ranked match: +${b.rating} rating (taken from them) and +${b.xp} xp. Once a week per player.`}
      data-testid="bounty"
    >
      <Crosshair />
      {long ? `Bounty: beat them for +${b.rating} elo · +${b.xp} xp` : `+${b.rating} · ${b.xp}xp`}
    </span>
  );
}
