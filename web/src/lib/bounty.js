// Bounties on the top 3 of each ladder. Keep in sync with api/src/bounty.js (api test asserts they match).
export const BOUNTY_RANKS = 3;
export const BOUNTY_RATING = { 1: 20, 2: 14, 3: 8 };
export const BOUNTY_XP = { 1: 60, 2: 40, 3: 25 };
export const BOUNTY_STREAK_RATING = 3; // per win in their current streak
export const BOUNTY_STREAK_RATING_MAX = 15;
export const BOUNTY_STREAK_XP = 10;
export const BOUNTY_STREAK_XP_MAX = 50;
export const BOUNTY_CLAIM_DAYS = 7; // one claim per collector per bountied player in this many days
/** The bounty on a ladder rank (1-3) with a current win streak; null off the podium. */
export function bountyFor(rank, streak = 0) {
  const r = Number(rank);
  if (!Number.isInteger(r) || r < 1 || r > BOUNTY_RANKS) return null;
  const s = Math.max(0, Number(streak) || 0);
  return {
    rank: r,
    rating: BOUNTY_RATING[r] + Math.min(BOUNTY_STREAK_RATING_MAX, BOUNTY_STREAK_RATING * s),
    xp: BOUNTY_XP[r] + Math.min(BOUNTY_STREAK_XP_MAX, BOUNTY_STREAK_XP * s),
  };
}
