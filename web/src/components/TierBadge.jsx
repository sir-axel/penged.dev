import { tierFor, tierByKey, placementState, TIERS } from "@/lib/tiers";

// Self-contained colors (text on tint, >= 4.5:1), so they read the same on any background.
export const TIER_STYLE = {
  bronze: { fg: "#7a4a1c", bg: "#f6e9dc", bd: "#8a5a2b" },
  silver: { fg: "#434f5b", bg: "#e9edf1", bd: "#8794a1" },
  gold: { fg: "#704a00", bg: "#fbefcc", bd: "#c08a00" },
  platinum: { fg: "#0b5a55", bg: "#dcf3f1", bd: "#2a9d97" },
  diamond: { fg: "#1a4a96", bg: "#e0ebfc", bd: "#3b78d8" },
  master: { fg: "#6b2fa8", bg: "#efe4fa", bd: "#8e4fd0" },
  grandmaster: { fg: "#ffffff", bg: "#b81d2a", bd: "#b81d2a" },
};
const SIZES = {
  sm: "px-1 py-px text-[0.5rem] gap-1",
  md: "px-2 py-0.5 text-[0.62rem] gap-1.5",
};
function Glyph({ tierKey, color }) {
  // Pixel gem; higher tiers grow side facets.
  const n = TIERS.findIndex((t) => t.key === tierKey);
  return (
    <svg width="7" height="7" viewBox="0 0 7 7" aria-hidden="true" shapeRendering="crispEdges" className="shrink-0">
      <rect x="3" y="0" width="1" height="1" fill={color} />
      <rect x="2" y="1" width="3" height="1" fill={color} />
      <rect x="1" y="2" width="5" height="1" fill={color} />
      <rect x="2" y="3" width="3" height="1" fill={color} />
      <rect x="3" y="4" width="1" height="1" fill={color} />
      {n >= 4 && <rect x="0" y="2" width="1" height="1" fill={color} />}
      {n >= 4 && <rect x="6" y="2" width="1" height="1" fill={color} />}
      {n >= 5 && <rect x="3" y="6" width="1" height="1" fill={color} />}
    </svg>
  );
}
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
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: s.bd, boxShadow: gm ? "inset 0 0 0 1px #fff, inset 0 0 0 2px #7d1219" : undefined }}
    >
      <Glyph tierKey={t.key} color={s.fg} />
      {t.name}
    </span>
  );
}
