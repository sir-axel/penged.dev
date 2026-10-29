// A tiny pixel crosshair.
const SIGHT = ["..####..", ".#....#.", "#..##..#", "#.#..#.#", "#.#..#.#", "#..##..#", ".#....#.", "..####.."];
export function Crosshair({ size = 10, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true" className={`shrink-0 ${className}`}>
      {SIGHT.flatMap((row, y) => [...row].map((c, x) => (c === "#" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" /> : null)))}
    </svg>
  );
}

const KIND = { podium: "top 3", streak: "hot streak", riser: "rising fast" };

/** "+16 · 60xp" for a bounty from useBounties (null renders nothing). `long` spells out why. */
export function BountyChip({ bounty, className = "", long = false }) {
  if (!bounty) return null;
  const why = bounty.parts.map((p) => (p.key === "podium" ? p.label : KIND[p.key])).join(" + ");
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm border border-brand/50 bg-brand/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-brand ${className}`}
      title={`Bounty (${bounty.parts.map((p) => p.label).join(", ")}): beat them in a ranked match for +${bounty.rating} rating (taken from them) and +${bounty.xp} xp. Once a week.`}
      data-testid="bounty"
    >
      <Crosshair />
      {long ? `Bounty · ${why}: +${bounty.rating} elo · +${bounty.xp} xp` : `+${bounty.rating} · ${bounty.xp}xp`}
    </span>
  );
}
