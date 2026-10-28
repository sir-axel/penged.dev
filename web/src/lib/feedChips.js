import { tierByKey, TIERS } from "@/lib/tiers";

/** Promotion / demotion chips from a verified match's rating_changes. */
export function tierChips(match) {
  const out = [];
  for (const c of match?.rating_changes || []) {
    if (!c.tier_before || !c.tier_after || c.tier_before === c.tier_after) continue;
    const to = tierByKey(c.tier_after);
    if (!to) continue;
    const up = TIERS.findIndex((t) => t.key === c.tier_after) > TIERS.findIndex((t) => t.key === c.tier_before);
    out.push({
      id: `tier-${c.player_id}`,
      kind: up ? "promotion" : "demotion",
      tier: to.key,
      player_id: c.player_id,
      name: c.name,
      label: up ? `Promoted to ${to.name}` : `Dropped to ${to.name}`,
    });
  }
  return out;
}
/** Hook the feed calls for extra chips on a match. */
export const extraChips = (match) => tierChips(match);
