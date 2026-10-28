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

/**
 * HOOK for tiers: another change adds "promoted to <tier>" chips here.
 * Return [{ key, label, tone }] (tone: brand | success | warning | muted). Returns [] for now.
 */
// eslint-disable-next-line no-unused-vars
export function extraChips(match) {
  return [];
}

export const allChips = (match) => [...matchChips(match), ...extraChips(match)];

export const CHIP_TONES = {
  brand: "border-brand/40 bg-brand-soft text-brand",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  muted: "border-border bg-secondary text-muted-foreground",
};
