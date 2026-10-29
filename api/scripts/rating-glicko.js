// GLICKO2+ candidate (pure, no DB): Glicko-2 per player per format, applied PER GAME in order, with Penged's
// multipliers layered on the size of each move. Used by scripts/simulate.js --scenarios to compare against src/rating.js.
//
// State per player: rating r (Elo scale), rd (rating deviation, Elo points), vol (Glicko-2 volatility sigma).
// - Before a match, RD grows with idle time: phi^2 += vol^2 * idleDays  (rating period = one day), capped at rdMax.
// - Each game: sigma' from the standard Glicko-2 (Illinois) step on that one result; phi* = sqrt(phi^2 + sigma'^2 * gameDays);
//   1/phi'^2 = 1/phi*^2 + info / v   (info = evidence x repeat: rematches teach the system less);
//   mu' = mu + w * phi'^2 * g(phi_opp) * (s - E)   (w = scale x margin x upset? x evidence x repeat x teammate x challenge x novelty).
// - g(RD_opp) replaces 'opponent certainty', RD replaces rust + smooth K. rdMin keeps every player movable.
// - Paddle edge is an expectation offset. Doubles: team rating = mean, team RD = rms; each player moves by their OWN phi'.
// - Per-game and per-match caps, rating floor, as in src/rating.js.
import {
  movMultiplier, autocorrMultiplier, evidenceWeight, repeatFactor, teammateFactor, paddleEdge, gameDominance,
  dominance as matchDominance, CHALLENGE_STAKES, MAX_GAME_DELTA, MAX_DELTA, RATING_FLOOR, START_RATING,
} from '../src/rating.js';

export const Q = 400 / Math.LN10; // 173.7178: Glicko-2 scale
export const DEFAULTS = {
  tau: 0.5, rd0: 200, rdMin: 50, rdMax: 200, vol0: 0.06, volFixed: false, volMin: 0.03, volMax: 0.15,
  gameDays: 0.25, matchDays: 0, volMode: 'match', scale: 0.75, ac: true, novelty: 1, noveltyDays: 30, gameCap: MAX_GAME_DELTA, matchCap: MAX_DELTA, infoRepeat: true,
  // volMode 'momentum': sigma = vol0 + volGain * max(0, |form| - formFree) (max formVolMax), form = fading mean of
  // (result - expected) over games (weight formAlpha per game). Consistent over-/under-performance raises sigma -> RD -> step.
  formAlpha: 0.15, formFree: 0.08, volGain: 2.0, formVolMax: 0.5, momentumDays: 1,
};
/** Momentum sigma from form (signed fading mean of game surprises). */
export function volFromForm(form, cfg = DEFAULTS) {
  return Math.min(cfg.formVolMax, cfg.vol0 + cfg.volGain * Math.max(0, Math.abs(form || 0) - cfg.formFree));
}

export const gPhi = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
export const expectedG = (mu, muOpp, phiOpp) => 1 / (1 + Math.exp(-gPhi(phiOpp) * (mu - muOpp)));

/** Glicko-2 volatility update (Illinois algorithm) for one rating period. */
export function newVolatility(sigma, phi, v, delta, tau) {
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

/** RD after `days` idle (rating period = 1 day). */
export function rdAfterIdle(rd, vol, days, cfg = DEFAULTS) {
  const phi = rd / Q;
  const out = Q * Math.sqrt(phi * phi + vol * vol * Math.max(0, days || 0));
  return Math.min(cfg.rdMax, Math.max(cfg.rdMin, out));
}

/**
 * participants: [{ id, side, rating, rd, vol, paddle?, earlierMeetings, daysSinceLast (null = first ever), daysSinceMet (null = never) }]
 * Returns [{ id, before, after, delta, rd_before, rd_after, vol_before, vol_after, games: [...] }]
 */
export function rateMatchGlicko(participants, winnerSide, games = [], ctx = {}, cfgIn = {}) {
  const cfg = { ...DEFAULTS, ...cfgIn };
  const side = (s) => participants.filter((p) => p.side === s);
  const edge = { a: paddleEdge(side('a').map((p) => p.paddle)), b: paddleEdge(side('b').map((p) => p.paddle)) };
  const evidence = evidenceWeight(ctx.target || 11);
  const challenge = ctx.challenge ? CHALLENGE_STAKES : 1;
  const st = {};
  for (const p of participants) {
    const rd0 = p.rd ?? cfg.rd0;
    const vol = cfg.volFixed ? cfg.vol0 : (p.vol ?? cfg.vol0);
    const rd = p.daysSinceLast == null ? Math.min(cfg.rdMax, Math.max(cfg.rdMin, rd0)) : rdAfterIdle(rd0, vol, p.daysSinceLast, cfg);
    st[p.id] = { r: p.rating, phi: rd / Q, vol, form: p.form || 0, total: 0, rdStart: rd, games: [] };
    if (cfg.volMode === 'momentum') {
      const s = st[p.id];
      s.vol = volFromForm(s.form, cfg);
      s.phi = Math.min(cfg.rdMax / Q, Math.sqrt(s.phi ** 2 + s.vol * s.vol * cfg.momentumDays));
      s.rdStart = s.phi * Q;
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const teamOf = (s) => {
    const ps = side(s);
    return { r: mean(ps.map((p) => st[p.id].r)), phi: Math.sqrt(mean(ps.map((p) => st[p.id].phi ** 2))) };
  };
  if (!cfg.volFixed && cfg.volMode === 'match' && games.length) {
    // one Glicko-2 volatility step per player per match (a rating period with all its games): a single game can never
    // look surprising enough to raise sigma, a lopsided set of results against expectation can.
    const T = { a: teamOf('a'), b: teamOf('b') };
    for (const p of participants) {
      const s = st[p.id];
      const os = p.side === 'a' ? 'b' : 'a';
      const mu = (T[p.side].r + edge[p.side] - 1500) / Q, muO = (T[os].r + edge[os] - 1500) / Q;
      const gg = gPhi(T[os].phi), E = expectedG(mu, muO, T[os].phi);
      let inv = 0, sum = 0;
      for (const g of games) { const won = (g.a > g.b ? 'a' : 'b') === p.side; inv += gg * gg * E * (1 - E); sum += gg * ((won ? 1 : 0) - E); }
      const v = 1 / inv;
      s.vol = Math.min(cfg.volMax, Math.max(cfg.volMin, newVolatility(s.vol, s.phi, v, v * sum, cfg.tau)));
      if (cfg.matchDays) s.phi = Math.min(cfg.rdMax / Q, Math.sqrt(s.phi ** 2 + s.vol * s.vol * cfg.matchDays));
    }
  }
  games.forEach((g, gi) => {
    const gw = g.a > g.b ? 'a' : 'b';
    const dom = gameDominance(g);
    const team = {};
    for (const s of ['a', 'b']) {
      const ps = side(s);
      team[s] = { r: mean(ps.map((p) => st[p.id].r)), phi: Math.sqrt(mean(ps.map((p) => st[p.id].phi ** 2))) };
    }
    const step = {};
    for (const p of participants) {
      const s = st[p.id];
      const os = p.side === 'a' ? 'b' : 'a';
      const mu = (team[p.side].r + edge[p.side] - 1500) / Q;
      const muO = (team[os].r + edge[os] - 1500) / Q;
      const phiO = team[os].phi;
      const gg = gPhi(phiO);
      const E = expectedG(mu, muO, phiO);
      const won = p.side === gw;
      const res = won ? 1 : 0;
      const v = 1 / (gg * gg * E * (1 - E));
      const delta = v * gg * (res - E);
      const vol = cfg.volFixed || cfg.volMode !== 'game' ? s.vol : Math.min(cfg.volMax, Math.max(cfg.volMin, newVolatility(s.vol, s.phi, v, delta, cfg.tau)));
      const phiStar = Math.sqrt(s.phi ** 2 + vol * vol * cfg.gameDays);
      const repeat = repeatFactor(p.earlierMeetings || 0);
      const info = cfg.infoRepeat ? evidence * repeat : evidence;
      let phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + info / v);
      phiNew = Math.min(cfg.rdMax / Q, Math.max(cfg.rdMin / Q, phiNew));
      const mov = movMultiplier(dom);
      const effMe = team[p.side].r + edge[p.side];
      const effOpp = team[os].r + edge[os];
      const ac = cfg.ac ? (won ? autocorrMultiplier(effMe, effOpp) : autocorrMultiplier(effOpp, effMe)) : 1;
      const mate = side(p.side).find((x) => x.id !== p.id);
      const teammate = mate ? teammateFactor(s.r, st[mate.id].r, won) : 1;
      const novelty = cfg.novelty !== 1 && (p.daysSinceMet == null || p.daysSinceMet >= cfg.noveltyDays) ? cfg.novelty : 1;
      const w = cfg.scale * mov * ac * evidence * repeat * teammate * challenge * novelty;
      const kEq = Q * phiNew * phiNew * gg; // rating points per unit of (result - expected), before multipliers
      const raw = w * kEq * (res - E);
      let d = Math.sign(raw) * Math.round(Math.abs(raw));
      d = Math.max(-cfg.gameCap, Math.min(cfg.gameCap, d));
      const form = (1 - cfg.formAlpha) * s.form + cfg.formAlpha * (res - E);
      step[p.id] = { d, vol, phiNew, E, mov, ac, repeat, teammate, novelty, kEq, dom, won, form };
    }
    for (const p of participants) {
      const s = st[p.id];
      const x = step[p.id];
      const before = s.r;
      let d = x.d;
      if (d > 0 && s.total + d > cfg.matchCap) d = Math.max(0, cfg.matchCap - s.total);
      if (d < 0 && s.total + d < -cfg.matchCap) d = Math.min(0, -cfg.matchCap - s.total);
      const after = Math.max(RATING_FLOOR, before + d);
      d = after - before;
      if (d === 0) d = 0;
      s.total += d;
      const rdBefore = s.phi * Q;
      s.r = after; s.phi = x.phiNew; s.vol = x.vol; s.form = x.form;
      s.games.push({
        game: gi + 1, won: x.won, before, after, delta: d, expected: x.E, rd_before: rdBefore, rd_after: x.phiNew * Q, vol: x.vol,
        k: x.kEq, mov: x.mov, ac: x.ac, repeat: x.repeat, teammate: x.teammate, novelty: x.novelty, dominance: x.dom,
        evidence, challenge, paddle_edge: edge[p.side === 'a' ? 'b' : 'a'] - edge[p.side],
      });
    }
  });
  const md = matchDominance(games, winnerSide);
  return participants.map((p) => {
    const s = st[p.id];
    return {
      id: p.id, before: p.rating, after: s.r, delta: s.r - p.rating, rd_before: s.rdStart, rd_after: s.phi * Q,
      vol_before: p.vol ?? cfg.vol0, vol_after: cfg.volMode === 'momentum' ? volFromForm(s.form, cfg) : s.vol, form_after: s.form,
      dominance: md, games: s.games,
    };
  });
}

/** Predictive per-game win probability for side a (team means, combined RD). */
export function predictGlicko(ra, rda, rb, rdb, edgeA = 0, edgeB = 0) {
  const phi = Math.sqrt(rda * rda + rdb * rdb) / Q;
  return expectedG((ra + edgeA - 1500) / Q, (rb + edgeB - 1500) / Q, phi);
}
export { START_RATING };
