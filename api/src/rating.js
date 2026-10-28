// Pure rules module: ratings, XP, game validation, ladder reordering. No DB access.

export const START_RATING = 1400;
export const RATING_FLOOR = 700;
export const MAX_DELTA = 45;
export const REPEAT_WINDOW_DAYS = 180;
export const ZERO_GAIN_MEETINGS = 6;

export function expectedScore(you, opp) {
  return 1 / (1 + Math.pow(10, (opp - you) / 400));
}

export function kFactor(matchesPlayed) {
  if (matchesPlayed < 10) return 48;
  if (matchesPlayed < 30) return 32;
  return 24;
}

export function repeatFactor(earlierMeetings) {
  return 1 / (1 + 0.75 * Math.max(0, earlierMeetings));
}

/**
 * Rating delta for one player. `rating` / `oppRating` may be team averages (doubles).
 * Returns { delta, after }.
 */
export function computeDelta({ rating, oppRating, matchesPlayed, won, earlierMeetings = 0 }) {
  if (won && earlierMeetings >= ZERO_GAIN_MEETINGS) return { delta: 0, after: rating };
  const k = kFactor(matchesPlayed);
  const result = won ? 1 : 0;
  const raw = k * (result - expectedScore(rating, oppRating)) * repeatFactor(earlierMeetings);
  let delta = Math.round(raw);
  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  if (delta === 0) delta = 0; // normalise -0
  let after = rating + delta;
  if (after < RATING_FLOOR) after = RATING_FLOOR;
  return { delta: after - rating, after };
}

export const average = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;

/**
 * Rate a verified match. Each participant:
 * { id, rating, matchesPlayed, earlierMeetings, side: 'a'|'b' }
 * Singles uses 1 per side, doubles 2 per side; opposing rating = opposing side average.
 * Returns [{ id, before, after, delta }].
 */
export function rateMatch(participants, winnerSide) {
  const avg = {};
  for (const s of ['a', 'b']) avg[s] = average(participants.filter((p) => p.side === s).map((p) => p.rating));
  return participants.map((p) => {
    const opp = avg[p.side === 'a' ? 'b' : 'a'];
    // For doubles, "you" is the team average too.
    const { delta, after } = computeDelta({
      rating: avg[p.side],
      oppRating: opp,
      matchesPlayed: p.matchesPlayed,
      won: p.side === winnerSide,
      earlierMeetings: p.earlierMeetings,
    });
    return { id: p.id, before: p.rating, after: Math.max(RATING_FLOOR, p.rating + delta), delta: Math.max(RATING_FLOOR, p.rating + delta) - p.rating };
  });
}

export function xpForMatch({ won, gamesWon }) {
  return 25 + (won ? 25 : 0) + 5 * Math.min(5, Math.max(0, gamesWon));
}

export function levelForXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1;
}

export function xpForLevel(level) {
  return 40 * (level - 1) * (level - 1);
}

/**
 * Validate a match's games. Returns an error string, or null when valid.
 */
export function validateGames(target, games) {
  if (target !== 11 && target !== 21) return 'Choose a game target of 11 or 21.';
  if (!Array.isArray(games) || games.length < 1) return 'Add at least one game.';
  if (games.length > 5) return 'A match is at most five games.';
  let wa = 0;
  let wb = 0;
  for (const g of games) {
    if (!g || !Number.isInteger(g.a) || !Number.isInteger(g.b) || g.a < 0 || g.b < 0) {
      return 'Scores must be whole numbers.';
    }
    const hi = Math.max(g.a, g.b);
    const lead = Math.abs(g.a - g.b);
    if (hi < target) return `Every game must reach ${target} for the winner.`;
    if (hi === target && lead < 2) return `A game at ${target} needs a two-point lead.`;
    if (hi > target && lead !== 2) return `Past ${target}-${target}, a game is won by two.`;
    if (g.a > g.b) wa++;
    else wb++;
  }
  if (wa === wb) return 'The games are level — the match needs a winner.';
  return null;
}

export function summarizeGames(games) {
  let a = 0;
  let b = 0;
  for (const g of games) g.a > g.b ? a++ : b++;
  return { games_a: a, games_b: b, winner_side: a > b ? 'a' : 'b' };
}

/**
 * Pure ladder swap. ranksMap: { playerId: rank }. If the winner is ranked below
 * (numerically greater than) the loser, the winner takes the loser's rank and everyone
 * from the loser's rank through winnerRank-1 moves down one. Returns a NEW map.
 */
export function applyLadderSwap(ranksMap, winnerId, loserId) {
  const next = { ...ranksMap };
  const rw = ranksMap[winnerId];
  const rl = ranksMap[loserId];
  if (rw == null || rl == null || rw <= rl) return next;
  for (const [id, r] of Object.entries(ranksMap)) {
    if (r != null && r >= rl && r < rw) next[id] = r + 1;
  }
  next[winnerId] = rl;
  return next;
}
