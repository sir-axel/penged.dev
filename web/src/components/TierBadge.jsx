import { tierFor, tierByKey, placementState } from "@/lib/tiers";
import { TierEmblem } from "@/components/TierEmblem";

// Self-contained colors (text on tint, >= 4.5:1) as CSS variables with a light and a dark set (see index.css).
export const TIER_STYLE = Object.fromEntries(
  ["wood", "iron", "bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster"].map((k) => [
    k,
    { fg: `var(--tier-${k}-fg)`, bg: `var(--tier-${k}-bg)`, bd: `var(--tier-${k}-bd)` },
  ]),
);
const SIZES = {
  sm: "px-1 py-px text-[0.5rem] gap-1",
  md: "px-2 py-0.5 text-[0.62rem] gap-1.5",
};
/**
 * <TierBadge rating={1500} /> or <TierBadge tier="gold" />. With `played` (matches in that format)
 * under the placement threshold it shows "Placement · 3/5" instead. Leave `played` undefined to skip placement.
 */
export function TierBadge({ rating, tier, played, size = "sm", className = "" }) {
  const place = played === undefined ? null : placementState(played);
  if (place?.placing) {
    return (
      <span
        data-testid="tier-badge"
        data-tier="placement"
        className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border border-dashed border-muted-foreground/60 font-display uppercase leading-none tracking-[0.1em] text-muted-foreground ${SIZES[size]} ${className}`}
      >
        {`Placement · ${place.played}/${place.needed}`}
      </span>
    );
  }
  const t = tier ? tierByKey(tier) : tierFor(rating);
  const s = TIER_STYLE[t.key];
  const gm = t.key === "grandmaster";
  return (
    <span
      data-testid="tier-badge"
      data-tier={t.key}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border font-display uppercase leading-none tracking-[0.1em] ${SIZES[size]} ${className}`}
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: s.bd, boxShadow: gm ? "inset 0 0 0 1px var(--tier-gm-ring-a), inset 0 0 0 2px var(--tier-gm-ring-b)" : undefined }}
    >
      <TierEmblem tierKey={t.key} size={size === "md" ? 14 : 11} />
      {t.name}
    </span>
  );
}
