import { tierByKey, TIERS } from "@/lib/tiers";

// Highlight chips for the results feed, computed client-side from a verified match
// (games, winner_side, rating_changes). Pure functions: easy to unit test and extend.

const sideKey = (m) => (m.winner_side === "b" ? "b" : "a");

/** Average pre-match rating of a side, from rating_changes (null when unknown). */
function sideBefore(match, side) {
  const ids = (match[side === "a" ? "side_a" : "side_b"] || []).map((p) => p.player_id);
  const rows = (match.rating_changes || []).filter((c) => ids.includes(c.player_id) && Number.isFinite(c.before));
  if (!rows.length) return null;
  return rows.reduce((s, c) => s + c.before, 0) / rows.length;
}

/** Each game as [winnerPoints, loserPoints] from the match winner's point of view. */
function gamesForWinner(match) {
  const w = sideKey(match);
  return (match.games || []).map((g) => (w === "a" ? [Number(g.a), Number(g.b)] : [Number(g.b), Number(g.a)]));
}

/** Core chips: [{ key, label, tone }] in display order. */
export function matchChips(match) {
  if (!match || match.status !== "verified" || !match.winner_side) return [];
  const chips = [];
  const w = sideKey(match);
  const l = w === "a" ? "b" : "a";
  const games = gamesForWinner(match);

  const wBefore = sideBefore(match, w);
  const lBefore = sideBefore(match, l);
  if (wBefore != null && lBefore != null && lBefore - wBefore >= 50) {
    chips.push({ key: "upset", label: "Upset", tone: "brand" });
  }
  if (games.some(([a, b]) => a === 0 || b === 0)) {
    chips.push({ key: "skunk", label: "Skunk", tone: "warning" });
  }
  if (games.length >= 3 && games.every(([a, b]) => a > b)) {
    chips.push({ key: "sweep", label: "Sweep", tone: "success" });
  }
  if (games.length >= 2 && games[0][0] < games[0][1]) {
    chips.push({ key: "comeback", label: "Comeback", tone: "success" });
  }
  const winnerIds = (match[w === "a" ? "side_a" : "side_b"] || []).map((p) => p.player_id);
  const streak = Math.max(
    0,
    ...(match.rating_changes || []).filter((c) => winnerIds.includes(c.player_id)).map((c) => Number(c.win_streak) || 0),
  );
  if (streak >= 3) chips.push({ key: "streak", label: `${streak}W streak`, tone: "brand" });
  return chips;
}

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
/** Extra feed chips: tier promotions / demotions, in the feed's { key, label, tone } shape. */
export function extraChips(match) {
  return tierChips(match).map((c) => ({
    key: c.id,
    label: c.name ? `${c.name}: ${c.label}` : c.label,
    tone: c.kind === "promotion" ? "success" : "muted",
  }));
}

/** "Bounty: Maya" when a winner claimed a top-3 player's bounty. */
export function bountyChips(match) {
  const seen = new Set();
  const out = [];
  for (const c of match?.rating_changes || []) {
    for (const b of c.bounties || []) {
      if (seen.has(b.from)) continue;
      seen.add(b.from);
      out.push({ key: `bounty-${b.from}`, label: `Bounty: ${b.name}`, tone: "brand" });
    }
  }
  return out;
}

export const allChips = (match) => [...bountyChips(match), ...matchChips(match), ...extraChips(match)];

export const CHIP_TONES = {
  brand: "border-brand/40 bg-brand-soft text-brand",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  muted: "border-border bg-secondary text-muted-foreground",
};
