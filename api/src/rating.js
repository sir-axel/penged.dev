// Pure rules module: ratings, XP, game validation, rating-derived ranking. No DB access.

// ===================================================================================================
// CONSTANTS (every tunable number lives here; web/src/components/home/RatingExplainer.jsx mirrors them)
// ===================================================================================================
export const START_RATING = 1400;
export const RATING_FLOOR = 700;
export const MAX_DELTA = 80; // hard cap on one player's TOTAL change in one match (all its games together)
// Every game in a verified match is its own Elo event, applied in order (game 2 starts from the ratings after game 1).
// GAME_K_SCALE shrinks K so a single game moves you less than a whole match used to; MAX_GAME_DELTA caps one game.
export const GAME_K_SCALE = 0.5;
export const MAX_GAME_DELTA = 40;
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
// K (how far one result moves you): smooth in games played, Glicko-lite. K = K_FLOOR + K_EXTRA * exp(-games / K_DECAY_GAMES), games = GAMES played in that format (before GAME_K_SCALE)
// => 48 for a brand-new player, easing to 32 once seasoned. (Tuned with scripts/simulate.js: the first-draft 24 floor lagged real skill;
// the 2026-10 scenario study moved the decay 30 -> 60 games: sudden improvers / slumps / returners caught up 3-16% sooner with no
// loss of prediction or ordering in any scenario. See penged-qa/elo-glicko.md.)
export const K_FLOOR = 32;
export const K_EXTRA = 16;
export const K_DECAY_GAMES = 60;
// Rust: after RUST_FREE_DAYS without a verified match (same format) K grows by (days - free) / RUST_RAMP_DAYS, at most RUST_MAX,
// for EVERY game of the first match back (61+ days away = double K for that match).
export const RUST_FREE_DAYS = 21;
export const RUST_RAMP_DAYS = 40;
export const RUST_MAX = 1.0;
// Opponent certainty: your change is scaled by CERT_BASE + (1 - CERT_BASE) * min(1, opponentGames / CERT_FULL_GAMES).
export const CERT_BASE = 0.8;
export const CERT_FULL_GAMES = 10;
// Target 21: a game to 21 is a more reliable result than a game to 11 (the old by-number-of-games evidence factor is gone:
// every game counts on its own now).
export const EVIDENCE_TARGET_21 = 1.1;
// Rematches: each earlier meeting in the last REPEAT_WINDOW_DAYS counts 0.5 ^ (days ago / REPEAT_HALF_LIFE_DAYS), so the
// multiplier recovers as time passes between games (daily rematches count less than a rematch after a few days off).
// repeat = REPEAT_FLOOR + (1 - REPEAT_FLOOR) / (1 + REPEAT_STEP * weightedMeetings): frequent rematches count less but
// never stop counting (a small group plays the same people all the time; regulars must not be frozen).
export const REPEAT_WINDOW_DAYS = 180;
export const REPEAT_HALF_LIFE_DAYS = 3;
export const REPEAT_STEP = 0.75;
export const REPEAT_FLOOR = 0.3;
// Doubles: a stronger partner gains less / loses more. teammate = clamp(1 -/+ TEAMMATE_SLOPE * (own - partner) / 400, MIN, MAX)
export const TEAMMATE_SLOPE = 0.25;
export const TEAMMATE_MIN = 0.75;
export const TEAMMATE_MAX = 1.25;
// A verified singles match that completes an accepted challenge is worth more.
export const CHALLENGE_STAKES = 1.25;
// Novelty: an opponent you have not played (this format) in NOVELTY_DAYS, or ever, is fresh evidence: x NOVELTY_BONUS.
// (Scenario study: better prediction and earlier ordering, and it rewards reaching out to different players.)
export const NOVELTY_DAYS = 30;
export const NOVELTY_BONUS = 1.1;
// 'What's on the line' preview assumes a typical match: you win 2-1 with games of 11-7, 7-11, 11-7 (21: 21-15, 15-21, 21-15).
export const STAKES_GAMES = { 11: [[11, 7], [7, 11], [11, 7]], 21: [[21, 15], [15, 21], [21, 15]] };
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
export const XP_NEW_RIVAL = 10; // first verified match vs an opponent in this format, or the first in NOVELTY_DAYS+

export function expectedScore(you, opp) {
  return 1 / (1 + Math.pow(10, (opp - you) / 400));
}

/** Stepped K, kept ONLY for challenge-dodge penalties (not used for match ratings). */
export function kFactor(matchesPlayed) {
  if (matchesPlayed < 10) return 48;
  if (matchesPlayed < 30) return 32;
  return 24;
}

/** Smooth K (48 for a new player -> 32 seasoned), by GAMES played in the format. */
export function kSmooth(gamesPlayed, decay = K_DECAY_GAMES) {
  return K_FLOOR + K_EXTRA * Math.exp(-Math.max(0, gamesPlayed) / decay);
}

/** K multiplier for a player returning after daysSinceLast days (null = first ever match: none). */
export function rustFactor(daysSinceLast, max = RUST_MAX, ramp = RUST_RAMP_DAYS) {
  if (daysSinceLast == null) return 1;
  return 1 + Math.min(max, Math.max(0, daysSinceLast - RUST_FREE_DAYS) / ramp);
}

/** Weight of your change by how established the opponent(s) are (average games played for doubles). */
export function certaintyWeight(oppGamesPlayed) {
  return CERT_BASE + (1 - CERT_BASE) * Math.min(1, Math.max(0, oppGamesPlayed) / CERT_FULL_GAMES);
}

/** Weight by the game target (21 is worth a little more than 11). */
export function evidenceWeight(target = 11) {
  return target === 21 ? EVIDENCE_TARGET_21 : 1;
}

/** How much one earlier meeting counts, by how long ago it was. */
export function meetingWeight(daysAgo) {
  return Math.pow(0.5, Math.max(0, Number(daysAgo) || 0) / REPEAT_HALF_LIFE_DAYS);
}

/** Doubles: stronger partner gains less / loses more. */
export function teammateFactor(own, partner, won) {
  const x = (TEAMMATE_SLOPE * (own - partner)) / 400;
  return Math.max(TEAMMATE_MIN, Math.min(TEAMMATE_MAX, won ? 1 - x : 1 + x));
}

export function repeatFactor(earlierMeetings) {
  return REPEAT_FLOOR + (1 - REPEAT_FLOOR) / (1 + REPEAT_STEP * Math.max(0, earlierMeetings));
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
 * Rating delta for ONE GAME for one player. `rating` / `oppRating` may be team averages (doubles).
 * delta = K * GAME_K_SCALE * (result - expected) * repeat * margin * upset * oppCertainty * evidence * teammate * challenge,
 * capped at MAX_GAME_DELTA. `dominance` is that game's (winnerPts - loserPts) / total. K and rust come from gamesPlayed / daysSinceLast.
 * Pass already-resolved `evidence` / `teammate` / `challenge` multipliers.
 * Returns { delta, after, expected, mov, ac, dominance, paddle_edge, k, rust, opp_certainty, evidence, repeat, teammate, challenge }.
 */
export function computeDelta({
  rating, oppRating, gamesPlayed, won, earlierMeetings = 0, dominance: dom = 0, edge = 0, oppEdge = 0,
  daysSinceLast = null, oppGamesPlayed = CERT_FULL_GAMES, evidence = 1, teammate = 1, challenge = 1, novelty = 1,
  scale = GAME_K_SCALE, kDecay = K_DECAY_GAMES, rustMax = RUST_MAX, rustRamp = RUST_RAMP_DAYS,
}) {
  scale = scale ?? GAME_K_SCALE;
  kDecay = kDecay ?? K_DECAY_GAMES;
  const eff = rating + edge;
  const oppEff = oppRating + oppEdge;
  const expected = expectedScore(eff, oppEff);
  const mov = movMultiplier(dom);
  const ac = won ? autocorrMultiplier(eff, oppEff) : autocorrMultiplier(oppEff, eff);
  const rust = rustFactor(daysSinceLast, rustMax ?? RUST_MAX, rustRamp ?? RUST_RAMP_DAYS);
  const k = kSmooth(gamesPlayed, kDecay) * rust;
  const certainty = certaintyWeight(oppGamesPlayed);
  const repeat = repeatFactor(earlierMeetings);
  const base = {
    expected, mov, ac, dominance: dom, paddle_edge: oppEdge - edge, k, rust, opp_certainty: certainty,
    evidence, repeat, teammate, challenge, novelty,
  };
  if (repeat === 0) return { delta: 0, after: rating, ...base };
  const result = won ? 1 : 0;
  const raw = k * scale * (result - expected) * repeat * mov * ac * certainty * evidence * teammate * challenge * novelty;
  let delta = Math.sign(raw) * Math.round(Math.abs(raw));
  delta = Math.max(-MAX_GAME_DELTA, Math.min(MAX_GAME_DELTA, delta));
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

/** Dominance of ONE game: (winnerPts - loserPts) / total points, in [0, 1]. */
export function gameDominance(g) {
  const t = g.a + g.b;
  return t <= 0 ? 0 : Math.min(1, Math.abs(g.a - g.b) / t);
}

/**
 * Rate a verified match GAME BY GAME. Each game is its own Elo event, applied in order: game 2 starts from the
 * ratings game 1 left behind. Each participant:
 * { id, rating, gamesPlayed (this format, before the match), earlierMeetings (recency-weighted MATCHES, not games),
 *   side: 'a'|'b', paddle?: 'default'|'modded', daysSinceLast?: number|null, novel?: boolean (no meeting with these opponents in NOVELTY_DAYS) }
 * Singles uses 1 per side, doubles 2 per side; opposing rating = opposing side average (+ paddle edge).
 * `games` ([{a,b}]) are in play order; `ctx` = { target?: 11|21, challenge?: boolean, gameKScale?, kDecayGames? }
 * (ctx.rustFirstGameOnly / rustMax / rustRamp only replay older rules in scripts/simulate.js).
 * Rust applies to every game of the match (it is the first match back). K decays with games, so it also eases within the match.
 * The running match total is clamped to +-MAX_DELTA (a game's delta is trimmed so the total stays inside it).
 * Returns [{ id, before, after, delta (match total), dominance (whole match), rust, repeat, challenge, evidence,
 *            games: [per-game entry] }].
 * Per-game entry: { game, score: [mine, theirs], won, before, after, delta, ...computeDelta factors incl. that game's dominance }.
 */
export function rateMatch(participants, winnerSide, games = [], ctx = {}) {
  const side = (s) => participants.filter((p) => p.side === s);
  const edge = {};
  for (const s of ['a', 'b']) edge[s] = paddleEdge(side(s).map((p) => p.paddle));
  const evidence = evidenceWeight(ctx.target || 11);
  const challenge = ctx.challenge ? CHALLENGE_STAKES : 1;
  const cur = Object.fromEntries(participants.map((p) => [p.id, p.rating]));
  const gp = Object.fromEntries(participants.map((p) => [p.id, p.gamesPlayed ?? 0]));
  const total = Object.fromEntries(participants.map((p) => [p.id, 0]));
  const out = Object.fromEntries(participants.map((p) => [p.id, []]));
  games.forEach((g, gi) => {
    const gameWinner = g.a > g.b ? 'a' : 'b';
    const dom = gameDominance(g);
    const avg = {};
    const avgGames = {};
    for (const s of ['a', 'b']) {
      avg[s] = average(side(s).map((p) => cur[p.id]));
      avgGames[s] = average(side(s).map((p) => gp[p.id]));
    }
    const step = {};
    for (const p of participants) {
      const opp = p.side === 'a' ? 'b' : 'a';
      const won = p.side === gameWinner;
      const mate = side(p.side).find((x) => x.id !== p.id);
      step[p.id] = computeDelta({
        rating: avg[p.side],
        oppRating: avg[opp],
        gamesPlayed: gp[p.id],
        won,
        earlierMeetings: p.earlierMeetings,
        dominance: dom,
        edge: edge[p.side],
        oppEdge: edge[opp],
        daysSinceLast: gi === 0 || !ctx.rustFirstGameOnly ? (p.daysSinceLast ?? null) : null,
        oppGamesPlayed: avgGames[opp],
        evidence,
        teammate: mate ? teammateFactor(cur[p.id], cur[mate.id], won) : 1,
        challenge,
        novelty: p.novel ? NOVELTY_BONUS : 1,
        scale: ctx.gameKScale,
        kDecay: ctx.kDecayGames,
        rustMax: ctx.rustMax,
        rustRamp: ctx.rustRamp,
      });
    }
    // all of this game's deltas are computed from the same pre-game ratings, then applied together
    for (const p of participants) {
      const r = step[p.id];
      const before = cur[p.id];
      let d = r.delta;
      if (d > 0 && total[p.id] + d > MAX_DELTA) d = Math.max(0, MAX_DELTA - total[p.id]);
      if (d < 0 && total[p.id] + d < -MAX_DELTA) d = Math.min(0, -MAX_DELTA - total[p.id]);
      const after = Math.max(RATING_FLOOR, before + d);
      d = after - before;
      total[p.id] += d;
      cur[p.id] = after;
      gp[p.id] += 1;
      const mine = p.side === 'a' ? g.a : g.b;
      const theirs = p.side === 'a' ? g.b : g.a;
      out[p.id].push({ ...r, game: gi + 1, score: [mine, theirs], won: p.side === gameWinner, before, after, delta: d });
    }
  });
  const matchDom = dominance(games, winnerSide);
  return participants.map((p) => {
    const gs = out[p.id];
    return {
      id: p.id, before: p.rating, after: cur[p.id], delta: cur[p.id] - p.rating,
      dominance: matchDom, rust: gs[0]?.rust ?? 1, repeat: gs[0]?.repeat ?? 1, challenge, evidence,
      novelty: gs[0]?.novelty ?? 1, games: gs,
    };
  });
}

/** The assumed typical games for a stakes preview, from side `winner`'s point of view (a 2-1 win). */
export function stakesGames(target, winner) {
  return (STAKES_GAMES[target] || STAKES_GAMES[11]).map(([w, l]) => (winner === 'a' ? { a: w, b: l } : { a: l, b: w }));
}

/**
 * "What's on the line" preview. Pure: runs rateMatch on a typical 2-1 result each way.
 * `sides` = { a: [participant], b: [participant] } with rateMatch's participant fields (id, rating, gamesPlayed,
 * earlierMeetings, daysSinceLast, novel) plus matchesPlayed (this format, for placement); `paddles` = { id: 'default'|'modded' }.
 * Returns [{ id, side, rating, win, lose, win_after, lose_after, tier_win, tier_lose, placing }]: win = delta if your side
 * wins 2-1 (STAKES_GAMES), lose = delta if it loses by the mirror score. tier_* = { tier_before, tier_after } when that result
 * crosses a tier for a placed player, else null. Pass `tierChange` (tiers.js) to get tier crossings.
 */
export function stakes({ format = 'singles', target = 11, sides, paddles = {}, challenge = false }, tierChange = null) {
  const size = format === 'doubles' ? 2 : 1;
  if (!sides || sides.a?.length !== size || sides.b?.length !== size) throw new Error('stakes: wrong side sizes');
  const parts = ['a', 'b'].flatMap((s) => sides[s].map((p) => ({ ...p, side: s, paddle: paddles[p.id] || p.paddle || 'default' })));
  const ctx = { target, challenge: !!challenge && format === 'singles' };
  const res = { a: rateMatch(parts, 'a', stakesGames(target, 'a'), ctx), b: rateMatch(parts, 'b', stakesGames(target, 'b'), ctx) };
  return parts.map((p, i) => {
    const w = res[p.side][i];
    const l = res[p.side === 'a' ? 'b' : 'a'][i];
    const placing = (p.matchesPlayed ?? PROVISIONAL_MATCHES) < PROVISIONAL_MATCHES;
    const tier = (after) => (tierChange && !placing ? tierChange(p.rating, after) : null);
    return {
      id: p.id, side: p.side, rating: p.rating, win: w.delta, lose: l.delta, win_after: w.after, lose_after: l.after,
      tier_win: tier(w.after), tier_lose: tier(l.after), placing,
    };
  });
}

/**
 * XP for one player in one verified match.
 * { won, gamesWon, ratingGap (opponent side avg - own side avg), streak (win streak including this match, 0 if lost),
 *   skunks (games your side won to 0), lostFirstGame, firstOfDay, newRival (first match vs these opponents, or first in 30+ days) }
 * Returns { total, parts: [{ key, label, xp }] }.
 */
export function xpForMatch({ won, gamesWon = 0, ratingGap = 0, streak = 0, skunks = 0, lostFirstGame = false, firstOfDay = false, newRival = false }) {
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
  if (newRival) parts.push({ key: 'new_rival', label: 'new rival', xp: XP_NEW_RIVAL });
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
