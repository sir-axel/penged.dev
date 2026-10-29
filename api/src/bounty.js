// Bounties: what beating a player is worth to YOU, on top of the match result. Keep in sync with web/src/lib/bounty.js
// (api test asserts they match). Three kinds, they stack (capped):
//   podium - the top 3 carry one for anyone ranked below them, worth more the further below you are (chase the top);
//   streak - anyone on a BOUNTY_STREAK_MIN+ win streak, claimable by anyone (#1 included: humble them);
//   riser  - anyone up BOUNTY_RISE_MIN+ rating in the last BOUNTY_RISE_DAYS days, claimable by anyone.
// The bounty rating comes out of the target's rating; one claim per hunter per target per BOUNTY_CLAIM_DAYS.
export const BOUNTY_PODIUM_RATING = { 1: 12, 2: 9, 3: 6 };
export const BOUNTY_PODIUM_XP = { 1: 50, 2: 35, 3: 25 };
export const BOUNTY_GAP_RATING = 2; // per extra place between you and them
export const BOUNTY_GAP_RATING_MAX = 10;
export const BOUNTY_GAP_XP = 5;
export const BOUNTY_GAP_XP_MAX = 30;
export const BOUNTY_UNRANKED_GAP = 3; // a hunter with no ladder spot counts as this many places below
export const BOUNTY_STREAK_MIN = 3;
export const BOUNTY_STREAK_RATING = 3; // per win past 2
export const BOUNTY_STREAK_RATING_MAX = 15;
export const BOUNTY_STREAK_XP = 10;
export const BOUNTY_STREAK_XP_MAX = 50;
export const BOUNTY_RISE_DAYS = 7;
export const BOUNTY_RISE_MIN = 50;
export const BOUNTY_RISE_RATING_PER = 10; // 1 rating per this many points risen
export const BOUNTY_RISE_RATING_MAX = 12;
export const BOUNTY_RISE_XP_PER = 2;
export const BOUNTY_RISE_XP_MAX = 40;
export const BOUNTY_RATING_MAX = 30;
export const BOUNTY_XP_MAX = 120;
export const BOUNTY_CLAIM_DAYS = 7;

/**
 * The bounty `hunter` would collect for beating `target` (null if none). Both: { id, rank (null = no ladder spot),
 * streak (current win streak), rise (rating gained in the last BOUNTY_RISE_DAYS) }; hunter may be null (a neutral viewer).
 * Returns { rating, xp, parts: [{ key, label, rating, xp }] }.
 */
export function bountyFor(hunter, target) {
  if (!target || (hunter && hunter.id === target.id)) return null;
  const parts = [];
  const tr = Number(target.rank) || 0;
  const hr = hunter ? Number(hunter.rank) || 0 : 0;
  if (tr >= 1 && tr <= 3 && (!hr || hr > tr)) {
    const gap = hr ? hr - tr : BOUNTY_UNRANKED_GAP;
    parts.push({
      key: "podium", label: `#${tr}`,
      rating: BOUNTY_PODIUM_RATING[tr] + Math.min(BOUNTY_GAP_RATING_MAX, BOUNTY_GAP_RATING * (gap - 1)),
      xp: BOUNTY_PODIUM_XP[tr] + Math.min(BOUNTY_GAP_XP_MAX, BOUNTY_GAP_XP * (gap - 1)),
    });
  }
  const streak = Number(target.streak) || 0;
  if (streak >= BOUNTY_STREAK_MIN) {
    parts.push({
      key: "streak", label: `${streak}W streak`,
      rating: Math.min(BOUNTY_STREAK_RATING_MAX, BOUNTY_STREAK_RATING * (streak - 2)),
      xp: Math.min(BOUNTY_STREAK_XP_MAX, BOUNTY_STREAK_XP * (streak - 2)),
    });
  }
  const rise = Math.round(Number(target.rise) || 0);
  if (rise >= BOUNTY_RISE_MIN) {
    parts.push({
      key: "riser", label: `+${rise} this week`,
      rating: Math.min(BOUNTY_RISE_RATING_MAX, Math.round(rise / BOUNTY_RISE_RATING_PER)),
      xp: Math.min(BOUNTY_RISE_XP_MAX, Math.round(rise / BOUNTY_RISE_XP_PER)),
    });
  }
  if (!parts.length) return null;
  return {
    rating: Math.min(BOUNTY_RATING_MAX, parts.reduce((t, p) => t + p.rating, 0)),
    xp: Math.min(BOUNTY_XP_MAX, parts.reduce((t, p) => t + p.xp, 0)),
    parts,
  };
}
