// Tiers are DERIVED from rating (no stored field). Keep in sync with api/src/tiers.js (api test asserts they match).
export const PROVISIONAL = 5; // matches in a format before a tier is shown (mirrors PROVISIONAL_MATCHES)
export const TIERS = [
  { key: "bronze", name: "Bronze", min: -Infinity },
  { key: "silver", name: "Silver", min: 1350 },
  { key: "gold", name: "Gold", min: 1450 },
  { key: "platinum", name: "Platinum", min: 1550 },
  { key: "diamond", name: "Diamond", min: 1650 },
  { key: "master", name: "Master", min: 1800 },
  { key: "grandmaster", name: "Grandmaster", min: 1950 },
];
export function tierIndex(rating) {
  const r = Number(rating);
  let idx = 0;
  if (!Number.isFinite(r)) return 0;
  TIERS.forEach((t, i) => {
    if (r >= t.min) idx = i;
  });
  return idx;
}
export const tierFor = (rating) => TIERS[tierIndex(rating)];
/** The next tier up and how many rating points away; null at the top. */
export function nextTier(rating) {
  const i = tierIndex(rating);
  if (i >= TIERS.length - 1) return null;
  const tier = TIERS[i + 1];
  return { tier, pointsToGo: Math.max(1, Math.ceil(tier.min - Number(rating))) };
}
/** 0..1 progress through the current tier toward the next (1 at the top; Bronze measured from 1200). */
export function tierProgress(rating) {
  const i = tierIndex(rating);
  if (i >= TIERS.length - 1) return 1;
  const lo = i === 0 ? 1200 : TIERS[i].min;
  return Math.max(0, Math.min(1, (Number(rating) - lo) / (TIERS[i + 1].min - lo)));
}
/** Placement: fewer than PROVISIONAL matches in that format. */
export function placementState(played) {
  const n = Math.max(0, Number(played) || 0);
  return { placing: n < PROVISIONAL, played: Math.min(n, PROVISIONAL), needed: PROVISIONAL };
}
/** Tier crossing between two ratings, or null. */
export function tierChange(before, after) {
  const a = tierIndex(before),
    b = tierIndex(after);
  return a === b ? null : { tier_before: TIERS[a].key, tier_after: TIERS[b].key };
}
export const tierByKey = (key) => TIERS.find((t) => t.key === key) || null;
