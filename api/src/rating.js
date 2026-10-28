// Pure rules module: ratings, XP, game validation, ladder reordering. No DB access.

export const START_RATING = 1400;
export const RATING_FLOOR = 700;
export const MAX_DELTA = 80;
export const REPEAT_WINDOW_DAYS = 180;
export const ZERO_GAIN_MEETINGS = 6;
// Margin of victory: mov = MOV_BASE + MOV_SCALE * sqrt(dominance)
export const MOV_BASE = 0.75;
export const MOV_SCALE = 1.25;
// Autocorrelation: ac = AC_NUM / (AC_NUM + AC_SLOPE * (winnerRating - loserRating)), clamped
export const AC_NUM = 2.2;
export const AC_SLOPE = 0.001;
export const AC_MIN = 0.6;
export const AC_MAX = 1.6;
export const REPEAT_STEP = 0.75;
// XP
export const XP_PLAYED = 25;
export const XP_WIN = 25;
export const XP_PER_GAME = 5;
export const XP_MAX_GAMES = 5;
export const XP_UPSET_PER_STEP = 10;
export const XP_UPSET_STEP = 50;
export const XP_UPSET_MAX = 60;
export const XP_STREAK_STEP = 10;
export const XP_STREAK_MAX = 50;
export const XP_SKUNK = 15;
export const XP_COMEBACK = 15;
export const XP_FIRST_OF_DAY = 10;

export function expectedScore(you, opp) {
  return 1 / (1 + Math.pow(10, (opp - you) / 400));
}

export function kFactor(matchesPlayed) {
  if (matchesPlayed < 10) return 48;
  if (matchesPlayed < 30) return 32;
  return 24;
}

export function repeatFactor(earlierMeetings) {
  return 1 / (1 + REPEAT_STEP * Math.max(0, earlierMeetings));
}

/** Dominance of a match: (winnerPoints - loserPoints) / total points, clamped to [0, 1]. */
export function dominance(games, winnerSide) {
  let w = 0;
  let l = 0;
  for (const g of games) {
    if (winnerSide === 'a') { w += g.a; l += g.b; } else { w += g.b; l += g.a; }
  }
  if (w + l <= 0) return 0;
  return Math.max(0, Math.min(1, (w - l) / (w + l)));
}

export function movMultiplier(d) {
  return MOV_BASE + MOV_SCALE * Math.sqrt(Math.max(0, Math.min(1, d)));
}

/** FiveThirtyEight-style autocorrelation: damps favourites crushing underdogs, amplifies upsets. */
export function autocorrMultiplier(winnerRating, loserRating) {
  const den = AC_NUM + AC_SLOPE * (winnerRating - loserRating);
  if (den <= 0) return AC_MAX; // enormous upset
  const ac = AC_NUM / den;
  return Math.max(AC_MIN, Math.min(AC_MAX, ac));
}

/**
 * Rating delta for one player. `rating` / `oppRating` may be team averages (doubles).
 * Symmetric: the loser's delta uses the same margin, autocorrelation, repeat factor and cap as the winner's.
 * Returns { delta, after, expected, mov, ac, dominance }.
 */
export function computeDelta({ rating, oppRating, matchesPlayed, won, earlierMeetings = 0, dominance: dom = 0 }) {
  const expected = expectedScore(rating, oppRating);
  const mov = movMultiplier(dom);
  const ac = won ? autocorrMultiplier(rating, oppRating) : autocorrMultiplier(oppRating, rating);
  const base = { expected, mov, ac, dominance: dom };
  if (earlierMeetings >= ZERO_GAIN_MEETINGS) return { delta: 0, after: rating, ...base };
  const k = kFactor(matchesPlayed);
  const result = won ? 1 : 0;
  const raw = k * (result - expected) * repeatFactor(earlierMeetings) * mov * ac;
  let delta = Math.sign(raw) * Math.round(Math.abs(raw));
  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  if (delta === 0) delta = 0; // normalise -0
  let after = rating + delta;
  if (after < RATING_FLOOR) after = RATING_FLOOR;
  return { delta: after - rating, after, ...base };
}

export const average = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;

/**
 * Rate a verified match. Each participant:
 * { id, rating, matchesPlayed, earlierMeetings, side: 'a'|'b' }
 * Singles uses 1 per side, doubles 2 per side; opposing rating = opposing side average.
 * `games` ([{a,b}]) feeds the margin of victory.
 * Returns [{ id, before, after, delta, expected, mov, ac, dominance }].
 */
export function rateMatch(participants, winnerSide, games = []) {
  const avg = {};
  for (const s of ['a', 'b']) avg[s] = average(participants.filter((p) => p.side === s).map((p) => p.rating));
  const dom = dominance(games, winnerSide);
  return participants.map((p) => {
    const opp = avg[p.side === 'a' ? 'b' : 'a'];
    // For doubles, "you" is the team average too.
    const r = computeDelta({
      rating: avg[p.side],
      oppRating: opp,
      matchesPlayed: p.matchesPlayed,
      won: p.side === winnerSide,
      earlierMeetings: p.earlierMeetings,
      dominance: dom,
    });
    const after = Math.max(RATING_FLOOR, p.rating + r.delta);
    return { id: p.id, before: p.rating, after, delta: after - p.rating, expected: r.expected, mov: r.mov, ac: r.ac, dominance: dom };
  });
}

/**
 * XP for one player in one verified match.
 * { won, gamesWon, ratingGap (opponent side avg - own side avg), streak (win streak including this match, 0 if lost),
 *   skunks (games your side won to 0), lostFirstGame, firstOfDay }
 * Returns { total, parts: [{ key, label, xp }] }.
 */
export function xpForMatch({ won, gamesWon = 0, ratingGap = 0, streak = 0, skunks = 0, lostFirstGame = false, firstOfDay = false }) {
  const parts = [{ key: 'played', label: 'played', xp: XP_PLAYED }];
  if (won) parts.push({ key: 'win', label: 'win', xp: XP_WIN });
  const gw = XP_PER_GAME * Math.min(XP_MAX_GAMES, Math.max(0, gamesWon));
  if (gw > 0) parts.push({ key: 'games', label: 'games won', xp: gw });
  if (won && ratingGap >= XP_UPSET_STEP) {
    parts.push({ key: 'upset', label: 'upset', xp: Math.min(XP_UPSET_MAX, XP_UPSET_PER_STEP * Math.floor(ratingGap / XP_UPSET_STEP)) });
  }
  if (won && streak >= 2) parts.push({ key: 'streak', label: 'streak', xp: Math.min(XP_STREAK_MAX, XP_STREAK_STEP * (streak - 1)) });
  if (skunks > 0) parts.push({ key: 'skunk', label: skunks > 1 ? `skunk x${skunks}` : 'skunk', xp: XP_SKUNK * skunks });
  if (won && lostFirstGame) parts.push({ key: 'comeback', label: 'comeback', xp: XP_COMEBACK });
  if (firstOfDay) parts.push({ key: 'first_of_day', label: 'first match of the day', xp: XP_FIRST_OF_DAY });
  return { total: parts.reduce((s, x) => s + x.xp, 0), parts };
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

// ---------- Challenge penalties (ducking a duel costs the defender) ----------
export const EXPIRE_MULT = 1.0;
export const EXPIRE_MIN = 5;
export const DECLINE_MULT = 0.5;
export const DECLINE_MIN = 3;
export const WAIVER_DAYS = 7; // a verified singles match between the pair this recently waives a decline
export const FATIGUE_MATCHES = 3; // this many verified matches in FATIGUE_DAYS halves a decline penalty
export const FATIGUE_DAYS = 7;
export const COOLDOWN_DAYS = 7; // after a decline/expiry the challenger can't re-challenge the same defender
export const WALKOVER_XP = 15;

// Ladder-gap weighting: 1 place apart -> 1.0, 2 -> 0.8, 3 or more -> 0.6
export const DODGE_RANK_FACTOR = { 1: 1.0, 2: 0.8, 3: 0.6 };
export const DODGE_BASE_MULT = 0.5;
export const rankFactor = (rankGap) => DODGE_RANK_FACTOR[Math.max(1, Math.min(3, Math.round(rankGap || 1)))];
/** 1.0 when evenly matched, shrinking as the rating gap grows (~0.75 at 200, ~0.36 at 400). */
export function closeness(defRating, chalRating) {
  const e = expectedScore(defRating, chalRating);
  return 4 * e * (1 - e);
}

/** What ducking costs before the expired/declined multiplier: peaks for close, adjacent, rarely-played pairs. */
export function dodgeBase({ defRating, defMatches, chalRating, meetings = 0, rankGap = 1 }) {
  return DODGE_BASE_MULT * kFactor(defMatches) * closeness(defRating, chalRating) * rankFactor(rankGap) * repeatFactor(meetings);
}

/**
 * Penalty for a ducked challenge.
 * kind: 'expired' | 'declined'. Returns { penalty (rating points actually lost), reason, dropsRank, walkover }.
 */
export function challengePenalty({ kind, defRating, defMatches, chalRating, meetings = 0, rankGap = 1, recentPairMatch = false, defRecentMatches = 0 }) {
  const loss = dodgeBase({ defRating, defMatches, chalRating, meetings, rankGap });
  const cap = (p) => Math.max(0, Math.min(MAX_DELTA, p, defRating - RATING_FLOOR));
  if (kind === 'expired') {
    return { penalty: cap(Math.max(EXPIRE_MIN, Math.round(EXPIRE_MULT * loss))), reason: 'expired', dropsRank: true, walkover: true };
  }
  if (recentPairMatch) return { penalty: 0, reason: 'waived_recent_match', dropsRank: false, walkover: false };
  let p = Math.max(DECLINE_MIN, Math.round(DECLINE_MULT * loss));
  let reason = 'declined';
  if (defRecentMatches >= FATIGUE_MATCHES) {
    p = Math.round(p / 2);
    reason = 'fatigue_halved';
  }
  return { penalty: cap(p), reason, dropsRank: true, walkover: false };
}
