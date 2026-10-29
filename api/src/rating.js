// Pure rules module: ratings, XP, game validation, rating-derived ranking. No DB access.
//
// Rating = Glicko-2 per player per format (singles and doubles never share anything), applied GAME BY GAME in play order,
// with Penged's multipliers layered on the size of each move. Chosen by the 7-scenario study (scripts/simulate.js
// --scenarios, penged-qa/elo-glicko.md): better prediction and ordering than the old Elo in 6/7 worlds and 30-57% faster
// catch-up for sudden improvers, slumps and returning players.

// ===================================================================================================
// CONSTANTS (every tunable number lives here; web/src/components/home/RatingExplainer.jsx mirrors them, and
// api/test/explainer.test.js asserts the copy matches)
// ===================================================================================================
export const START_RATING = 1400;
export const RATING_FLOOR = 100;
export const MAX_DELTA = 80; // hard cap on one player's TOTAL change in one match (all its games together)
export const MAX_GAME_DELTA = 40; // cap on one game
// ---- Glicko-2 core ----
// Confidence = RD (rating deviation, in rating points): how sure the ladder is about your rating. High RD = you move fast.
// Each game: step = GLICKO_SCALE x (Q x phi'^2 x g(opponent RD)) x (result - expected) x multipliers, where phi' is your
// RD after that game (Glicko-2: 1 / phi'^2 = 1 / phi*^2 + evidence x repeat / v).
export const RD_START = 200; // a brand-new player (also the cap: time away never pushes RD above this)
export const RD_MIN = 50; // the most settled anyone gets, so regulars always keep moving
export const RD_MAX = 200;
export const VOL_START = 0.06; // Glicko-2 volatility sigma: how much your true level is expected to drift per day
export const VOL_MIN = 0.03;
export const VOL_MAX = 0.15;
export const GLICKO_TAU = 0.5; // how fast sigma itself may change (per match, from how surprising its results were)
export const RD_GROWTH_PER_GAME_DAYS = 0.25; // each game also adds a quarter day of drift (keeps busy players movable)
export const GLICKO_SCALE = 0.6; // per-game step scale (tuned in the sim: 0.6 beat 0.5 / 0.75 / 1.0 on log-loss)
export const Q = 400 / Math.LN10; // 173.7178: the Glicko-2 rating scale
// Backfill (migration 0016) and players with no stored RD: RD after `games` played, as if each game taught the
// ladder BACKFILL_INFO_PER_GAME: rd = Q / sqrt((Q / RD_START)^2 + games x BACKFILL_INFO_PER_GAME), at least RD_MIN.
export const BACKFILL_INFO_PER_GAME = 0.22;
// Confidence hint: show "settling ±RD" while your current RD (time away included) is at least this.
export const RD_SETTLING = 90;
// ---- multipliers on each game's step ----
// Margin of victory: mov = MOV_BASE + MOV_SCALE * sqrt(dominance)
export const MOV_BASE = 0.75;
export const MOV_SCALE = 1.25;
// Autocorrelation (upset): ac = AC_NUM / (AC_NUM + AC_SLOPE * (winnerEff - loserEff)), clamped. Uses effective ratings.
// Kept with Glicko: without it a strong player stuck with weaker ones gets over-rated (+23 in the sim).
export const AC_NUM = 2.2;
export const AC_SLOPE = 0.001;
export const AC_MIN = 0.6;
export const AC_MAX = 1.6;
// Paddle edge: a paid ('modded') paddle counts as +PADDLE_EDGE rating inside the expectation and upset factor only
// (like home advantage). Scaled by the share of a side's players using one. Stored ratings never include it.
export const PADDLE_EDGE = 50;
// Target 21: a game to 21 is a more reliable result than a game to 11.
export const EVIDENCE_TARGET_21 = 1.3;
// Rematches: each earlier meeting in the last REPEAT_WINDOW_DAYS counts 0.5 ^ (days ago / REPEAT_HALF_LIFE_DAYS), so the
// multiplier recovers as time passes between games. repeat = REPEAT_FLOOR + (1 - REPEAT_FLOOR) / (1 + REPEAT_STEP * weightedMeetings):
// frequent rematches count less (and shrink RD less) but never stop counting.
export const REPEAT_WINDOW_DAYS = 180;
export const REPEAT_HALF_LIFE_DAYS = 3;
export const REPEAT_STEP = 0.75;
export const REPEAT_FLOOR = 0.3;
// Doubles: team rating = mean, team RD = rms; each player moves by their OWN RD. A stronger partner gains less / loses more:
// teammate = clamp(1 -/+ TEAMMATE_SLOPE * (own - partner) / 400, MIN, MAX)
export const TEAMMATE_SLOPE = 0.25;
export const TEAMMATE_MIN = 0.75;
export const TEAMMATE_MAX = 1.25;
// Close-loss credit: losing to a side rated at least CLOSE_GAP_MIN above you, while taking more of the points than the
// gap predicts (expectedPointShare), earns CLOSE_CREDIT_PER x (your point share - expected) rating, at most
// CLOSE_CREDIT_MAX, instead of a loss, and the winners pay the same: letting a much weaker side get that close is a
// bad result even in a win. Get beaten clearly and it is an ordinary loss: the underdog still has to prove it.
export const CLOSE_GAP_MIN = 100;
export const CLOSE_CREDIT_PER = 150;
export const CLOSE_CREDIT_MAX = 15;
// A verified match (singles or doubles) that completes an accepted challenge is worth more.
export const CHALLENGE_STAKES = 1.25;
// Novelty: an opponent you have not played (this format) in NOVELTY_DAYS, or ever, is fresh evidence: x NOVELTY_BONUS.
export const NOVELTY_DAYS = 30;
export const NOVELTY_BONUS = 1.1;
// 'What's on the line' preview: a RANGE from a narrow 2-1 to a dominant 2-0, each way (21: 21-19, 19-21, 21-19 / 21-8, 21-10).
export const STAKES_NARROW = { 11: [[11, 9], [9, 11], [11, 9]], 21: [[21, 19], [19, 21], [21, 19]] };
export const STAKES_DOMINANT = { 11: [[11, 4], [11, 5]], 21: [[21, 8], [21, 10]] };
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
export const XP_SHOT = 15; // "took a shot": lost to a side rated XP_SHOT_GAP+ above you
export const XP_SHOT_GAP = 100;
export const XP_NEW_RIVAL = 10; // first verified match vs an opponent in this format, or the first in NOVELTY_DAYS+

/** Plain Elo expectation (closeness of a challenge pair). */
export function expectedScore(you, opp) {
  return 1 / (1 + Math.pow(10, (opp - you) / 400));
}

/** Chance of winning one game to `target` (win by 2) when you win each point with probability p. */
export function gameWinFromPoint(p, target = 11) {
  const q = 1 - p;
  const n = target - 1;
  let win = 0;
  let c = 1; // C(n + k, k)
  for (let k = 0; k < n; k++) {
    win += c * Math.pow(p, target) * Math.pow(q, k);
    c = (c * (n + k + 1)) / (k + 1);
  }
  const deuce = c * Math.pow(p, n) * Math.pow(q, n); // reach n-n
  return win + (deuce * p * p) / (p * p + q * q);
}

/** Share of the points a side is expected to take, given its chance E of winning a game (inverts gameWinFromPoint). */
export function expectedPointShare(E, target = 11) {
  let lo = 0.01, hi = 0.99;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (gameWinFromPoint(mid, target) < E) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Close-loss credit for the LOSING side's players: { gap, share, expected, credit } or null. `gap` = winners' effective
 * rating minus losers' (team means, paddle edges in); credit = round(CLOSE_CREDIT_PER x (share - expected)), max CLOSE_CREDIT_MAX.
 */
export function closeLossCredit({ loserEff, winnerEff, games, loserSide, target = 11 }) {
  const gap = winnerEff - loserEff;
  if (gap < CLOSE_GAP_MIN || !games.length) return null;
  let mine = 0, all = 0;
  for (const g of games) { mine += loserSide === 'a' ? g.a : g.b; all += g.a + g.b; }
  if (!all) return null;
  const share = mine / all;
  const expected = expectedPointShare(expectedScore(loserEff, winnerEff), target);
  const credit = Math.min(CLOSE_CREDIT_MAX, Math.round(CLOSE_CREDIT_PER * (share - expected)));
  return credit > 0 ? { gap: Math.round(gap), share, expected, credit } : null;
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

// ---------- Glicko-2 ----------
export const gPhi = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
/** Glicko-2 expected score on the internal scale (mu = (rating - 1500) / Q), opponent deviation phiOpp. */
export const expectedG = (mu, muOpp, phiOpp) => 1 / (1 + Math.exp(-gPhi(phiOpp) * (mu - muOpp)));
const clampRd = (rd) => Math.min(RD_MAX, Math.max(RD_MIN, rd));

/** Glicko-2 volatility update (Illinois algorithm, Glickman 2012 step 5) for one rating period. */
export function newVolatility(sigma, phi, v, delta, tau = GLICKO_TAU) {
  const a = Math.log(sigma * sigma);
  const p2 = phi * phi;
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - p2 - v - ex)) / (2 * (p2 + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B;
  if (delta * delta > p2 + v) B = Math.log(delta * delta - p2 - v);
  else { let k = 1; while (f(a - k * tau) < 0 && k < 100) k++; B = a - k * tau; }
  let fA = f(A), fB = f(B);
  for (let it = 0; it < 60 && Math.abs(B - A) > 1e-6; it++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  return Math.exp(A / 2);
}

/** RD after `days` without a verified match in the format (one rating period = one day): sqrt(RD^2 + (vol x Q)^2 x days). */
export function rdAfterIdle(rd, vol = VOL_START, days = 0) {
  const phi = (rd ?? RD_START) / Q;
  return clampRd(Q * Math.sqrt(phi * phi + vol * vol * Math.max(0, Number(days) || 0)));
}

/** Stored RD for a player with no RD yet (migration 0016 backfill; must match its SQL): by games played in the format. */
export function backfillRd(games) {
  return clampRd(Q / Math.sqrt((Q / RD_START) ** 2 + Math.max(0, games || 0) * BACKFILL_INFO_PER_GAME));
}

/** Current RD (confidence) of a player in a format: stored RD grown by the days since it was last updated. */
export function currentRd({ rd, vol, rdAt, games = 0 }, nowMs = Date.now()) {
  const base = rd ?? backfillRd(games);
  if (!rdAt) return clampRd(base);
  return rdAfterIdle(base, vol ?? VOL_START, (nowMs - Date.parse(rdAt)) / 86400000);
}

/** Rating points per unit of (result - expected) for a player with this RD vs an opponent with oppRd: the "K" Glicko implies. */
export function kFromRd(rd, oppRd = RD_MIN) {
  return GLICKO_SCALE * Q * (rd / Q) ** 2 * gPhi(oppRd / Q);
}

/**
 * Rate a verified match GAME BY GAME with Glicko-2. Each game is its own rating event, applied in order: game 2 starts
 * from the ratings AND deviations game 1 left behind. Each participant:
 * { id, side: 'a'|'b', rating, rd? (stored, null = backfillRd(gamesPlayed)), vol?, gamesPlayed?, daysSinceLast?
 *   (days since rd was last updated; null = first ever match), earlierMeetings (recency-weighted MATCHES), novel?, paddle? }
 * Singles uses 1 per side, doubles 2 (team rating = mean, team RD = rms, each player moves by their own RD).
 * `games` ([{a,b}]) in play order; `ctx` = { target?: 11|21, challenge?: boolean, glicko?: {overrides, sim only} }.
 * Per game, per player: E = expected (Glicko, opponent RD via g); v = 1 / (g^2 E (1 - E));
 *   phi* = sqrt(phi^2 + vol^2 x RD_GROWTH_PER_GAME_DAYS); 1/phi'^2 = 1/phi*^2 + evidence x repeat / v  (RD_MIN..RD_MAX);
 *   step = GLICKO_SCALE x Q x phi'^2 x g x (result - E) x margin x upset x evidence x repeat x partner x challenge x new rival,
 *   rounded, capped at MAX_GAME_DELTA; the running match total stays within +-MAX_DELTA; never below RATING_FLOOR.
 * Before game 1 RD grows with time away (rdAfterIdle); sigma is updated once per match (Glicko-2, tau GLICKO_TAU).
 * Returns [{ id, before, after, delta, rd_before, rd_after, vol_before, vol_after, dominance, repeat, challenge, evidence,
 *            novelty, games: [{ game, score, won, before, after, delta, expected, rd_before, rd_after, vol, k, mov, ac,
 *            paddle_edge, evidence, repeat, teammate, challenge, novelty, dominance }] }].
 */
export function rateMatch(participants, winnerSide, games = [], ctx = {}) {
  const C = {
    scale: GLICKO_SCALE, tau: GLICKO_TAU, gameDays: RD_GROWTH_PER_GAME_DAYS, rdMin: RD_MIN, rdMax: RD_MAX, volFixed: false,
    ac: true, ...(ctx.glicko || {}),
  };
  const side = (s) => participants.filter((p) => p.side === s);
  const edge = { a: paddleEdge(side('a').map((p) => p.paddle)), b: paddleEdge(side('b').map((p) => p.paddle)) };
  const evidence = evidenceWeight(ctx.target || 11);
  const challenge = ctx.challenge ? CHALLENGE_STAKES : 1;
  const lim = (phi) => Math.min(C.rdMax / Q, Math.max(C.rdMin / Q, phi));
  const st = {};
  for (const p of participants) {
    const stored = p.rd ?? backfillRd(p.gamesPlayed);
    const vol = p.vol ?? VOL_START;
    const rd = p.daysSinceLast == null ? Math.min(C.rdMax, Math.max(C.rdMin, stored)) : rdAfterIdle(stored, vol, p.daysSinceLast);
    st[p.id] = { r: p.rating, phi: lim(rd / Q), vol, volStart: vol, total: 0, rdStart: lim(rd / Q) * Q, games: [] };
  }
  const team = (s) => {
    const ps = side(s);
    return { r: average(ps.map((p) => st[p.id].r)), phi: Math.sqrt(average(ps.map((p) => st[p.id].phi ** 2))) };
  };
  // sigma: one Glicko-2 step per player per match (the match is the rating period for its surprise)
  if (!C.volFixed && games.length) {
    const T = { a: team('a'), b: team('b') };
    for (const p of participants) {
      const s = st[p.id];
      const os = p.side === 'a' ? 'b' : 'a';
      const mu = (T[p.side].r + edge[p.side] - 1500) / Q, muO = (T[os].r + edge[os] - 1500) / Q;
      const g = gPhi(T[os].phi), E = expectedG(mu, muO, T[os].phi);
      let inv = 0, sum = 0;
      for (const gm of games) { const won = (gm.a > gm.b ? 'a' : 'b') === p.side; inv += g * g * E * (1 - E); sum += g * ((won ? 1 : 0) - E); }
      const v = 1 / inv;
      s.vol = Math.min(VOL_MAX, Math.max(VOL_MIN, newVolatility(s.vol, s.phi, v, v * sum, C.tau)));
    }
  }
  games.forEach((gm, gi) => {
    const gw = gm.a > gm.b ? 'a' : 'b';
    const dom = gameDominance(gm);
    const T = { a: team('a'), b: team('b') };
    const step = {};
    for (const p of participants) {
      const s = st[p.id];
      const os = p.side === 'a' ? 'b' : 'a';
      const effMe = T[p.side].r + edge[p.side], effOpp = T[os].r + edge[os];
      const g = gPhi(T[os].phi);
      const E = expectedG((effMe - 1500) / Q, (effOpp - 1500) / Q, T[os].phi);
      const won = p.side === gw;
      const v = 1 / (g * g * E * (1 - E));
      const repeat = repeatFactor(p.earlierMeetings || 0);
      const phiStar = Math.sqrt(s.phi ** 2 + s.vol * s.vol * C.gameDays);
      const phiNew = lim(1 / Math.sqrt(1 / (phiStar * phiStar) + (evidence * repeat) / v));
      const mov = movMultiplier(dom);
      const ac = C.ac ? (won ? autocorrMultiplier(effMe, effOpp) : autocorrMultiplier(effOpp, effMe)) : 1;
      const mate = side(p.side).find((x) => x.id !== p.id);
      const teammate = mate ? teammateFactor(s.r, st[mate.id].r, won) : 1;
      const novelty = p.novel ? NOVELTY_BONUS : 1;
      const k = C.scale * Q * phiNew * phiNew * g;
      const raw = k * ((won ? 1 : 0) - E) * mov * ac * evidence * repeat * teammate * challenge * novelty;
      let d = Math.sign(raw) * Math.round(Math.abs(raw));
      d = Math.max(-MAX_GAME_DELTA, Math.min(MAX_GAME_DELTA, d));
      step[p.id] = { d, phiNew, E, k, mov, ac, repeat, teammate, novelty, won };
    }
    for (const p of participants) {
      const s = st[p.id];
      const x = step[p.id];
      const before = s.r;
      let d = x.d;
      if (d > 0 && s.total + d > MAX_DELTA) d = Math.max(0, MAX_DELTA - s.total);
      if (d < 0 && s.total + d < -MAX_DELTA) d = Math.min(0, -MAX_DELTA - s.total);
      const after = Math.max(RATING_FLOOR, before + d);
      d = after - before;
      if (d === 0) d = 0;
      s.total += d;
      const rdBefore = s.phi * Q;
      s.r = after;
      s.phi = x.phiNew;
      const mine = p.side === 'a' ? gm.a : gm.b;
      const theirs = p.side === 'a' ? gm.b : gm.a;
      s.games.push({
        game: gi + 1, score: [mine, theirs], won: x.won, before, after, delta: d, expected: x.E,
        rd_before: rdBefore, rd_after: x.phiNew * Q, vol: s.vol, k: x.k, mov: x.mov, ac: x.ac,
        paddle_edge: edge[p.side === 'a' ? 'b' : 'a'] - edge[p.side], evidence, repeat: x.repeat, teammate: x.teammate,
        challenge, novelty: x.novelty, dominance: dom,
      });
    }
  });
  const md = dominance(games, winnerSide);
  // Close-loss credit (from pre-match ratings): a narrow loss to a much stronger side becomes a small gain.
  const loserSide = winnerSide === 'a' ? 'b' : 'a';
  const effOf = (sd) => average(side(sd).map((p) => p.rating)) + edge[sd];
  const close = games.length && ctx.closeCredit !== false
    ? closeLossCredit({ loserEff: effOf(loserSide), winnerEff: effOf(winnerSide), games, loserSide, target: ctx.target || 11 })
    : null;
  return participants.map((p) => {
    const s = st[p.id];
    // Rematches earn less of it too (same repeat factor as the games), so a friendly 'close loss' can't be farmed.
    const c = close ? Math.round(close.credit * repeatFactor(p.earlierMeetings || 0)) : 0;
    let credit = null;
    if (c > 0 && p.side === loserSide && s.r - p.rating < c) {
      credit = { ...close, credit: c };
      s.r = Math.max(RATING_FLOOR, p.rating + c);
    } else if (c > 0 && p.side === winnerSide && s.r - p.rating > -c) {
      credit = { ...close, credit: -c }; // the favourite let them get too close: pays what the underdog earned
      s.r = Math.max(RATING_FLOOR, p.rating - c);
    }
    return {
      ...(credit ? { close_loss: { credit: credit.credit, gap: credit.gap, share: +credit.share.toFixed(3), expected: +credit.expected.toFixed(3) } } : null),
      id: p.id, before: p.rating, after: s.r, delta: s.r - p.rating, rd_before: s.rdStart, rd_after: s.phi * Q,
      vol_before: s.volStart, vol_after: s.vol, dominance: md, repeat: s.games[0]?.repeat ?? repeatFactor(p.earlierMeetings || 0),
      challenge, evidence, novelty: s.games[0]?.novelty ?? (p.novel ? NOVELTY_BONUS : 1), games: s.games,
    };
  });
}

/** Predictive per-game win probability for side a (team means, combined RD; for the sim and tests). */
export function predictGame(ra, rda, rb, rdb, edgeA = 0, edgeB = 0) {
  return expectedG((ra + edgeA - 1500) / Q, (rb + edgeB - 1500) / Q, Math.sqrt(rda * rda + rdb * rdb) / Q);
}

/** Stakes preview games, from side `winner`'s point of view: 'narrow' (2-1) or 'dominant' (2-0). */
export function stakesGames(target, winner, kind = 'narrow') {
  const set = kind === 'dominant' ? STAKES_DOMINANT : STAKES_NARROW;
  return (set[target] || set[11]).map(([w, l]) => (winner === 'a' ? { a: w, b: l } : { a: l, b: w }));
}

/**
 * "What's on the line" preview as a RANGE. Pure: runs rateMatch on a narrow 2-1 and a dominant 2-0, each way.
 * `sides` = { a: [participant], b: [participant] } with rateMatch's participant fields plus matchesPlayed (placement);
 * `paddles` = { id: 'default'|'modded' }. Returns per player:
 * { id, side, rating, win: [low, high], lose: [mildest, worst], win_after (best win), lose_after (worst loss),
 *   narrow: { win, lose }, dominant: { win, lose }, tier_win, tier_lose, placing }.
 * tier_* = { tier_before, tier_after } when the best win / worst loss crosses a tier for a placed player (pass tierChange).
 */
export function stakes({ format = 'singles', target = 11, sides, paddles = {}, challenge = false }, tierChange = null) {
  const size = format === 'doubles' ? 2 : 1;
  if (!sides || sides.a?.length !== size || sides.b?.length !== size) throw new Error('stakes: wrong side sizes');
  const parts = ['a', 'b'].flatMap((s) => sides[s].map((p) => ({ ...p, side: s, paddle: paddles[p.id] || p.paddle || 'default' })));
  const ctx = { target, challenge: !!challenge };
  const run = (winner, kind) => rateMatch(parts, winner, stakesGames(target, winner, kind), ctx);
  const R = { a: { narrow: run('a', 'narrow'), dominant: run('a', 'dominant') }, b: { narrow: run('b', 'narrow'), dominant: run('b', 'dominant') } };
  return parts.map((p, i) => {
    const mine = R[p.side], theirs = R[p.side === 'a' ? 'b' : 'a'];
    const narrow = { win: mine.narrow[i].delta, lose: theirs.narrow[i].delta };
    const dom = { win: mine.dominant[i].delta, lose: theirs.dominant[i].delta };
    const win = [Math.min(narrow.win, dom.win), Math.max(narrow.win, dom.win)];
    const lose = [Math.max(narrow.lose, dom.lose), Math.min(narrow.lose, dom.lose)];
    const placing = (p.matchesPlayed ?? PROVISIONAL_MATCHES) < PROVISIONAL_MATCHES;
    const tier = (after) => (tierChange && !placing ? tierChange(p.rating, after) : null);
    return {
      id: p.id, side: p.side, rating: p.rating, win, lose, win_after: p.rating + win[1], lose_after: Math.max(RATING_FLOOR, p.rating + lose[1]),
      narrow, dominant: dom, tier_win: tier(p.rating + win[1]), tier_lose: tier(Math.max(RATING_FLOOR, p.rating + lose[1])), placing,
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
  if (!won && ratingGap >= XP_SHOT_GAP) parts.push({ key: 'shot', label: 'took a shot', xp: XP_SHOT });
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
 * Players who have not played a verified match in the format get no rank (unrated: "nil", listed last).
 * With `activeSince` (ISO), players whose LAST verified match is older than that get no rank (inactive).
 * Must mirror RANK_SQL below.
 */
export function rankPlayers(players, activeSince = null) {
  const active = (p) => p.played > 0 && (!activeSince || !p.last_verified_at || p.last_verified_at >= activeSince);
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
  FROM (SELECT *, ((${fmt}_wins + ${fmt}_losses) > 0
    AND (${fmt}_last_verified_at IS NULL OR ${fmt}_last_verified_at >= ?)) AS active FROM players)) AS r
  WHERE players.id = r.id AND players.${fmt}_rank IS NOT r.rk`;

/** Rewrites players.singles_rank from singles ratings (same order as rankPlayers); bind ONE param: the activeSince ISO cutoff. Inactive or unplayed = NULL. */
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
// Weekly caps (rolling CHALLENGE_CAP_DAYS, both formats combined, any status, reversed ones excluded).
export const CHALLENGE_CAP_DAYS = 7;
export const CHALLENGES_RECEIVED_PER_WEEK = 2;
export const CHALLENGES_SENT_PER_WEEK = 3;
// Anyone on the ladder may challenge anyone. 'down' = the challenger was rated above the defender at creation:
// declining or ignoring it costs DOWN_MULT x the upward penalty (it still shrinks with the rank gap). Never a walkover.
export const DOWN_MULT = 0.5;

// The defender's K for a dodge: the Glicko step a typical match (DODGE_GAMES_PER_MATCH games) would imply at their current
// RD, kept within DODGE_K_MIN..DODGE_K_MAX (the old Elo 24..48): settled players (RD 50) 24, settling ones (RD 74+) 48.
export const DODGE_GAMES_PER_MATCH = 2.5;
export const DODGE_K_MIN = 24;
export const DODGE_K_MAX = 48;
export const dodgeK = (defRd) => Math.max(DODGE_K_MIN, Math.min(DODGE_K_MAX, DODGE_GAMES_PER_MATCH * kFromRd(defRd ?? RD_START)));
// Ladder-gap weighting: 1 place apart -> 1.0, 2 -> 0.8, 3 -> 0.6, 4-5 -> 0.4, 6 or more -> 0.25
export const DODGE_RANK_FACTOR = { 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.4, 5: 0.4, 6: 0.25 };
export const DODGE_BASE_MULT = 0.5;
export const rankFactor = (rankGap) => DODGE_RANK_FACTOR[Math.max(1, Math.min(6, Math.round(rankGap || 1)))];
/** 1.0 when evenly matched, shrinking as the rating gap grows (~0.75 at 200, ~0.36 at 400). */
export function closeness(defRating, chalRating) {
  const e = expectedScore(defRating, chalRating);
  return 4 * e * (1 - e);
}

/** What ducking costs before the expired/declined multiplier: peaks for close, adjacent, rarely-played pairs. */
export function dodgeBase({ defRating, defRd, chalRating, meetings = 0, rankGap = 1 }) {
  return DODGE_BASE_MULT * dodgeK(defRd) * closeness(defRating, chalRating) * rankFactor(rankGap) * repeatFactor(meetings);
}

/**
 * Penalty for a ducked challenge.
 * kind: 'expired' | 'declined'; direction: 'up' (challenger rated below) | 'down'. Every duck the rules allow costs; there is no weekly cap.
 * Returns { penalty (rating points actually lost), reason, dropsRank, walkover }.
 */
export function challengePenalty({ kind, direction = 'up', ...o }) {
  if (direction === 'down') {
    const up = challengePenalty({ ...o, kind });
    if (kind === 'expired') return { penalty: Math.round(DOWN_MULT * up.penalty), reason: 'expired_down', dropsRank: true, walkover: false };
    if (up.penalty === 0) return up; // waived (played this week)
    return { penalty: Math.max(1, Math.round(DOWN_MULT * up.penalty)), reason: 'declined_down', dropsRank: true, walkover: false };
  }
  const { defRating, defRd, chalRating, meetings = 0, rankGap = 1, recentPairMatch = false, defRecentMatches = 0 } = o;
  const loss = dodgeBase({ defRating, defRd, chalRating, meetings, rankGap });
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

// ---------- Weekly matchmaking ("This week's match", singles only; see src/matchmaking.js) ----------
// Every ranked singles player gets ONE opponent per week (Monday 00:00 America/Chicago), their highest pair score.
// Many players may get the same opponent. Rating closeness is deliberately NOT a factor: cross-board play is the point.
export const MATCHUP_NEVER_PLAYED = 100; // never met in a verified ranked singles match
export const MATCHUP_PER_DAY = 1; // otherwise: 1 point per day since the last verified meeting...
export const MATCHUP_DAYS_CAP = 60; // ...counting at most 60 days (so never-played always outranks long-time-no-see)
export const MATCHUP_DODGE = 25; // per ducked singles challenge between the pair (declined / ignored, either way round)
export const MATCHUP_DODGE_MAX = 4; // at most this many ducks count
export const MATCHUP_DODGE_DAYS = 90;
export const MATCHUP_TOP_BONUS = 30; // pull toward the top: #1 +30, then 6 less per place down to #5 (+6)
export const MATCHUP_TOP_SPAN = 5;
export const MATCHUP_REPEAT_PENALTY = 40; // the same pick as last week
export const MATCHUP_BACKOUT_MULT = 2; // backing out after saying yes costs 2x the max loss (capped at MAX_DELTA)
