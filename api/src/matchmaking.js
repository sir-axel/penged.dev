// Pure weekly-matchmaking rules: pair scores, the weekly assignment and the "why them" line. No DB access.
// Constants live in rating.js (MATCHUP_*); web/src/lib/ratingCopy.js MATCHUP_POINTS explains them (explainer.test.js).
import {
  MATCHUP_NEVER_PLAYED, MATCHUP_PER_DAY, MATCHUP_DAYS_CAP, MATCHUP_DODGE, MATCHUP_DODGE_MAX, MATCHUP_TOP_BONUS, MATCHUP_TOP_SPAN,
  MATCHUP_REPEAT_PENALTY, MATCHUP_BACKOUT_MULT, MAX_DELTA, RATING_FLOOR,
} from './rating.js';

/** Pull toward the top of the ladder: MATCHUP_TOP_BONUS for #1, shrinking evenly to 0 past #MATCHUP_TOP_SPAN. */
export const topBonus = (rank) =>
  (rank >= 1 && rank <= MATCHUP_TOP_SPAN ? (MATCHUP_TOP_BONUS * (MATCHUP_TOP_SPAN + 1 - rank)) / MATCHUP_TOP_SPAN : 0);

/**
 * How much a player should play opponent b this week (higher = more desirable).
 * { lastDays (days since their last verified ranked singles meeting, null = never), dodges (either way, last 90 days),
 *   rank (b's singles rank), repeat (b was this player's pick last week) }. Ratings never enter.
 */
export function matchupScore({ lastDays = null, dodges = 0, rank = null, repeat = false }) {
  const history = lastDays == null ? MATCHUP_NEVER_PLAYED : MATCHUP_PER_DAY * Math.min(MATCHUP_DAYS_CAP, Math.max(0, Math.floor(lastDays)));
  return history + MATCHUP_DODGE * Math.min(MATCHUP_DODGE_MAX, dodges) + topBonus(rank) - (repeat ? MATCHUP_REPEAT_PENALTY : 0);
}

/** Deterministic [0, 1) per (week, a, b): the seeded tie-break (FNV-1a). */
export function seededTie(week, a, b) {
  let h = 0x811c9dc5;
  for (const ch of `${week}|${a}|${b}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 2 ** 32;
}

/**
 * The week's assignment: every player gets their best-scoring opponent (several may share one). Fewer than two players:
 * nobody. `players` = [{ id, rank }]; `facts(aId, bId)` = matchupScore input minus rank. Returns [{ player, opponent, score }].
 */
export function assignMatchups(week, players, facts) {
  if (players.length < 2) return [];
  return players.map((a) => {
    let best = null;
    for (const b of players) {
      if (b.id === a.id) continue;
      const score = matchupScore({ ...facts(a.id, b.id), rank: b.rank });
      const tie = seededTie(week, a.id, b.id);
      if (!best || score > best.score || (score === best.score && tie > best.tie)) best = { opponent: b.id, score, tie };
    }
    return { player: a.id, opponent: best.opponent, score: best.score };
  });
}

const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
/** "They dodged you twice lately · They're #1": the reason, from the owner's side (r = a matchups row). */
export function whyText(r) {
  const bits = [];
  if (r.dodged_by_them > 0) bits.push(`They dodged you ${times(r.dodged_by_them)} lately`);
  if (r.dodged_by_me > 0) bits.push(`You dodged them ${times(r.dodged_by_me)} lately`);
  if (r.never_played) bits.push("You've never played");
  else if (r.last_played_days != null) {
    bits.push(r.last_played_days < 1 ? 'You played recently' : `Last played ${r.last_played_days} day${r.last_played_days === 1 ? '' : 's'} ago`);
  }
  if (r.opponent_rank != null && r.opponent_rank <= MATCHUP_TOP_SPAN) bits.push(`They're #${r.opponent_rank}`);
  return bits.join(' · ');
}

/** Rating a back-out costs: 2x the max loss, never more than MAX_DELTA and never below the floor. */
export const backoutCost = (maxLoss, rating) =>
  Math.max(0, Math.min(MAX_DELTA, MATCHUP_BACKOUT_MULT * Math.abs(maxLoss || 0), rating - RATING_FLOOR));
/** Rating a missed week costs: the max loss, never more than MAX_DELTA and never below the floor. */
export const missCost = (maxLoss, rating) => Math.max(0, Math.min(MAX_DELTA, Math.abs(maxLoss || 0), rating - RATING_FLOOR));
