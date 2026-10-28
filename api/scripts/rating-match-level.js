// FROZEN copy of the match-level rating rules (before per-game rating). Used ONLY by scripts/simulate.js as the baseline.
// Pure rules module: ratings, XP, game validation, rating-derived ranking. No DB access.

// ===================================================================================================
// CONSTANTS (every tunable number lives here; web/src/components/home/RatingExplainer.jsx mirrors them)
// ===================================================================================================
export const START_RATING = 1400;
export const RATING_FLOOR = 700;
export const MAX_DELTA = 80; // hard cap on one player's change in one match
// Margin of victory: mov = MOV_BASE + MOV_SCALE * sqrt(dominance)
export const MOV_BASE = 0.75;
export const MOV_SCALE = 1.25;
// Autocorrelation (upset): ac = AC_NUM / (AC_NUM + AC_SLOPE * (winnerEff - loserEff)), clamped. Uses effective ratings.
export const AC_NUM = 2.2;
export const AC_SLOPE = 0.001;
export const AC_MIN = 0.6;
export const AC_MAX = 1.6;
// Paddle edge: a paid ('modded') paddle counts as +PADDLE_EDGE rating inside the expectation and upset factor only
// (like home advantage). Scaled by the share of a side's players using one. Stored ratings never include it.
export const PADDLE_EDGE = 50;
// K (how far one result moves you): smooth in games played, Glicko-lite. K = K_FLOOR + K_EXTRA * exp(-games / K_DECAY_GAMES)
// => 48 for a brand-new player, easing to 32 once seasoned. (Tuned with scripts/simulate.js: the first-draft 24 floor lagged real skill.)
export const K_FLOOR = 32;
export const K_EXTRA = 16;
export const K_DECAY_GAMES = 12;
// Rust: after RUST_FREE_DAYS without a verified match (same format) K grows by (days - free) / RUST_RAMP_DAYS, at most RUST_MAX.
export const RUST_FREE_DAYS = 21;
export const RUST_RAMP_DAYS = 120;
export const RUST_MAX = 0.5;
// Opponent certainty: your change is scaled by CERT_BASE + (1 - CERT_BASE) * min(1, opponentGames / CERT_FULL_GAMES).
export const CERT_BASE = 0.8;
export const CERT_FULL_GAMES = 10;
// Evidence: more games in the match = a more trustworthy result. By number of games played (1 / 2-3 / 4-5), x1.1 if target 21.
export const EVIDENCE_BY_GAMES = { 1: 0.8, 2: 1.0, 3: 1.0, 4: 1.1, 5: 1.1 };
export const EVIDENCE_TARGET_21 = 1.1;
// Rematches: earlier meetings in the last REPEAT_WINDOW_DAYS count 1 if within REPEAT_RECENT_DAYS, else REPEAT_OLD_WEIGHT.
// repeat = 1 / (1 + REPEAT_STEP * weightedMeetings); at ZERO_GAIN_MEETINGS weighted meetings neither player moves.
export const REPEAT_WINDOW_DAYS = 180;
export const REPEAT_RECENT_DAYS = 30;
export const REPEAT_OLD_WEIGHT = 0.5;
export const REPEAT_STEP = 0.75;
export const ZERO_GAIN_MEETINGS = 6;
// Doubles: a stronger partner gains less / loses more. teammate = clamp(1 -/+ TEAMMATE_SLOPE * (own - partner) / 400, MIN, MAX)
export const TEAMMATE_SLOPE = 0.25;
export const TEAMMATE_MIN = 0.75;
export const TEAMMATE_MAX = 1.25;
// A verified singles match that completes an accepted challenge is worth more.
export const CHALLENGE_STAKES = 1.25;
// Ladder: no verified match in this many days = off the ranked ladder (listed as inactive); < PROVISIONAL_MATCHES = provisional.
export const ACTIVE_DAYS = 30;
export const PROVISIONAL_MATCHES = 5;
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

/** Stepped K, kept ONLY for challenge-dodge penalties (not used for match ratings). */
export function kFactor(matchesPlayed) {
  if (matchesPlayed < 10) return 48;
  if (matchesPlayed < 30) return 32;
  return 24;
}

/** Smooth K for match ratings (48 new -> ~24 seasoned). */
export function kSmooth(gamesPlayed) {
  return K_FLOOR + K_EXTRA * Math.exp(-Math.max(0, gamesPlayed) / K_DECAY_GAMES);
}

/** K multiplier for a player returning after daysSinceLast days (null = first ever match: none). */
export function rustFactor(daysSinceLast) {
  if (daysSinceLast == null) return 1;
  return 1 + Math.min(RUST_MAX, Math.max(0, daysSinceLast - RUST_FREE_DAYS) / RUST_RAMP_DAYS);
}

/** Weight of your change by how established the opponent(s) are (average games played for doubles). */
export function certaintyWeight(oppGamesPlayed) {
  return CERT_BASE + (1 - CERT_BASE) * Math.min(1, Math.max(0, oppGamesPlayed) / CERT_FULL_GAMES);
}

/** Weight by games actually played in the match (1 / 2-3 / 4-5) and the game target. */
export function evidenceWeight(gamesPlayed, target = 11) {
  const n = Math.max(1, Math.min(5, Math.round(gamesPlayed)));
  return EVIDENCE_BY_GAMES[n] * (target === 21 ? EVIDENCE_TARGET_21 : 1);
}

/** How much one earlier meeting counts, by how long ago it was. */
export function meetingWeight(daysAgo) {
  return daysAgo <= REPEAT_RECENT_DAYS ? 1 : REPEAT_OLD_WEIGHT;
}

/** Doubles: stronger partner gains less / loses more. */
export function teammateFactor(own, partner, won) {
  const x = (TEAMMATE_SLOPE * (own - partner)) / 400;
  return Math.max(TEAMMATE_MIN, Math.min(TEAMMATE_MAX, won ? 1 - x : 1 + x));
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
 * delta = K * (result - expected) * repeat * margin * upset * oppCertainty * evidence * teammate * challenge, capped.
 * Pass already-resolved `evidence` / `teammate` / `challenge` multipliers; K, rust and certainty are derived here.
 * Returns { delta, after, expected, mov, ac, dominance, paddle_edge, k, rust, opp_certainty, evidence, repeat, teammate, challenge }.
 */
export function computeDelta({
  rating, oppRating, matchesPlayed, won, earlierMeetings = 0, dominance: dom = 0, edge = 0, oppEdge = 0,
  daysSinceLast = null, oppMatchesPlayed = CERT_FULL_GAMES, evidence = 1, teammate = 1, challenge = 1,
}) {
  const eff = rating + edge;
  const oppEff = oppRating + oppEdge;
  const expected = expectedScore(eff, oppEff);
  const mov = movMultiplier(dom);
  const ac = won ? autocorrMultiplier(eff, oppEff) : autocorrMultiplier(oppEff, eff);
  const rust = rustFactor(daysSinceLast);
  const k = kSmooth(matchesPlayed) * rust;
  const certainty = certaintyWeight(oppMatchesPlayed);
  const repeat = earlierMeetings >= ZERO_GAIN_MEETINGS ? 0 : repeatFactor(earlierMeetings);
  const base = {
    expected, mov, ac, dominance: dom, paddle_edge: oppEdge - edge, k, rust, opp_certainty: certainty,
    evidence, repeat, teammate, challenge,
  };
  if (repeat === 0) return { delta: 0, after: rating, ...base };
  const result = won ? 1 : 0;
  const raw = k * (result - expected) * repeat * mov * ac * certainty * evidence * teammate * challenge;
  let delta = Math.sign(raw) * Math.round(Math.abs(raw));
  delta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, delta));
  if (delta === 0) delta = 0; // normalise -0
  let after = rating + delta;
  if (after < RATING_FLOOR) after = RATING_FLOOR;
  return { delta: after - rating, after, ...base };
}

export const average = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;

/** Effective-rating bonus for a side: PADDLE_EDGE x share of its players using a paid ('modded') paddle. */
export function paddleEdge(paddles) {
  if (!paddles.length) return 0;
  return PADDLE_EDGE * (paddles.filter((x) => x === 'modded').length / paddles.length);
}

/**
 * Rate a verified match. Each participant:
 * { id, rating, matchesPlayed (this format), earlierMeetings (recency-weighted), side: 'a'|'b',
 *   paddle?: 'default'|'modded', daysSinceLast?: number|null }
 * Singles uses 1 per side, doubles 2 per side; opposing rating = opposing side average (+ paddle edge).
 * `games` ([{a,b}]) feeds margin and evidence; `ctx` = { target?: 11|21, challenge?: boolean }.
 * Returns [{ id, before, after, delta, ...factors }] (see computeDelta).
 */
export function rateMatch(participants, winnerSide, games = [], ctx = {}) {
  const side = (s) => participants.filter((p) => p.side === s);
  const avg = {};
  const edge = {};
  for (const s of ['a', 'b']) {
    avg[s] = average(side(s).map((p) => p.rating));
    edge[s] = paddleEdge(side(s).map((p) => p.paddle));
  }
  const dom = dominance(games, winnerSide);
  const evidence = evidenceWeight(games.length || 2, ctx.target || 11);
  const challenge = ctx.challenge ? CHALLENGE_STAKES : 1;
  return participants.map((p) => {
    const opp = p.side === 'a' ? 'b' : 'a';
    const won = p.side === winnerSide;
    const mate = side(p.side).find((x) => x.id !== p.id);
    const r = computeDelta({
      rating: avg[p.side],
      oppRating: avg[opp],
      matchesPlayed: p.matchesPlayed,
      won,
      earlierMeetings: p.earlierMeetings,
      dominance: dom,
      edge: edge[p.side],
      oppEdge: edge[opp],
      daysSinceLast: p.daysSinceLast ?? null,
      oppMatchesPlayed: average(side(opp).map((x) => x.matchesPlayed)),
      evidence,
      teammate: mate ? teammateFactor(p.rating, mate.rating, won) : 1,
      challenge,
    });
    const after = Math.max(RATING_FLOOR, p.rating + r.delta);
    return { ...r, id: p.id, before: p.rating, after, delta: after - p.rating };
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

// ---------- Ranking (derived from rating) ----------
/**
 * Leaderboard order: rating DESC, then games played DESC, then created_date ASC, then id.
 * `players`: [{ id, rating, played, created_date, last_verified_at? }]. Returns { id: rank } with ranks 1..N.
 * With `activeSince` (ISO), players whose LAST verified match is older than that get no rank (inactive);
 * players with no verified match at all stay ranked. Must mirror RANK_SQL below.
 */
export function rankPlayers(players, activeSince = null) {
  const active = (p) => !activeSince || !p.last_verified_at || p.last_verified_at >= activeSince;
  const sorted = players.filter(active).sort((a, b) =>
    b.rating - a.rating || b.played - a.played ||
    (a.created_date < b.created_date ? -1 : a.created_date > b.created_date ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out = {};
  sorted.forEach((p, i) => { out[p.id] = i + 1; });
  return out;
}

/** Same ordering for one format's own columns. Singles and doubles ladders share no inputs. */
const rankSqlFor = (fmt) => `UPDATE players SET ${fmt}_rank = r.rk FROM (
  SELECT id, CASE WHEN active THEN ROW_NUMBER() OVER (PARTITION BY active
    ORDER BY ${fmt}_rating DESC, (${fmt}_wins + ${fmt}_losses) DESC, created_date ASC, id ASC) END AS rk
  FROM (SELECT *, (${fmt}_last_verified_at IS NULL OR ${fmt}_last_verified_at >= ?) AS active FROM players)) AS r
  WHERE players.id = r.id AND players.${fmt}_rank IS NOT r.rk`;

/** Rewrites players.singles_rank from singles ratings (same order as rankPlayers); bind ONE param: the activeSince ISO cutoff. Inactive = NULL. */
export const RANK_SQL = rankSqlFor('singles');
/** Rewrites players.doubles_rank from doubles ratings / doubles games / doubles activity only. Same single param. */
export const DOUBLES_RANK_SQL = rankSqlFor('doubles');

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
