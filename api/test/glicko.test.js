// Glicko-2 per game: reference maths, RD growth/shrink, sequencing, every multiplier, caps/floor, doubles, repeats.
import { describe, it, expect } from 'vitest';
import {
  rateMatch, gPhi, expectedG, newVolatility, rdAfterIdle, backfillRd, currentRd, kFromRd, dodgeK, Q, RD_START, RD_MIN, RD_MAX,
  VOL_START, GLICKO_SCALE, RD_GROWTH_PER_GAME_DAYS, movMultiplier, autocorrMultiplier, gameDominance, dominance, repeatFactor,
  meetingWeight, MAX_GAME_DELTA, MAX_DELTA, RATING_FLOOR, NOVELTY_BONUS, CHALLENGE_STAKES, EVIDENCE_TARGET_21, PADDLE_EDGE, paddleEdge,
  challengePenalty, predictGame,
} from '../src/rating.js';

const pl = (id, side, o = {}) => ({ id, side, rating: 1400, rd: 60, vol: VOL_START, earlierMeetings: 0, daysSinceLast: 3, ...o });
const duel = (a, b, games, ctx = { target: 11 }) => {
  const r = rateMatch([pl('w', 'a', a), pl('l', 'b', b)], 'a', games, ctx);
  return { w: r[0], l: r[1] };
};
const BLOW = [{ a: 11, b: 2 }, { a: 11, b: 3 }, { a: 11, b: 1 }];
const NARROW = [{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 12, b: 10 }];
const SWEEP = [{ a: 11, b: 5 }, { a: 11, b: 6 }, { a: 11, b: 4 }];
const GRIND = [{ a: 11, b: 9 }, { a: 8, b: 11 }, { a: 11, b: 9 }];
const CLOSE20 = [{ a: 11, b: 9 }, { a: 12, b: 10 }];

describe('Glicko-2 reference maths (Glickman, "Example of the Glicko-2 system")', () => {
  it('g, E and the volatility step match the paper', () => {
    expect(Q).toBeCloseTo(173.7178, 4);
    expect(gPhi(30 / Q)).toBeCloseTo(0.9955, 4);
    expect(gPhi(100 / Q)).toBeCloseTo(0.9531, 4);
    expect(gPhi(300 / Q)).toBeCloseTo(0.7242, 4);
    expect(expectedG(0, (1400 - 1500) / Q, 30 / Q)).toBeCloseTo(0.639, 3);
    expect(expectedG(0, (1550 - 1500) / Q, 100 / Q)).toBeCloseTo(0.432, 3);
    expect(newVolatility(0.06, 1.1513, 1.7785, -0.4834, 0.5)).toBeCloseTo(0.06, 4);
  });
  it('one game = the Glicko-2 update, times the scale and that game\'s margin (other factors off)', () => {
    const g = [{ a: 11, b: 6 }];
    const r = rateMatch([pl('a', 'a', { rating: 1500, rd: 200, daysSinceLast: null }), pl('b', 'b', { rating: 1400, rd: 50, daysSinceLast: null })],
      'a', g, { target: 11, glicko: { ac: false, gameDays: 0, volFixed: true, scale: 1 } })[0];
    const phi = 200 / Q, phiO = 50 / Q; // RD below 50 is clamped to RD_MIN
    const E = expectedG(0, -100 / Q, phiO);
    const v = 1 / (gPhi(phiO) ** 2 * E * (1 - E));
    const phiNew = 1 / Math.sqrt(1 / (phi * phi) + 1 / v);
    const step = Q * phiNew * phiNew * gPhi(phiO) * (1 - E) * movMultiplier(gameDominance(g[0]));
    expect(r.games[0].expected).toBeCloseTo(E, 12);
    expect(r.games[0].rd_after).toBeCloseTo(phiNew * Q, 9);
    expect(r.delta).toBe(Math.min(MAX_GAME_DELTA, Math.round(step)));
    expect(r.games[0].k).toBeCloseTo(Q * phiNew * phiNew * gPhi(phiO), 9);
  });
  it('constants', () => {
    expect([RD_START, RD_MIN, RD_MAX, VOL_START, GLICKO_SCALE, RD_GROWTH_PER_GAME_DAYS]).toEqual([200, 50, 200, 0.06, 0.6, 0.25]);
  });
});

describe('confidence (RD)', () => {
  it('grows with days away: sqrt(RD^2 + (vol x Q)^2 x days), never above 200', () => {
    expect(rdAfterIdle(50, 0.06, 0)).toBeCloseTo(50, 9);
    expect(rdAfterIdle(50, 0.06, 30)).toBeCloseTo(75.9, 1);
    expect(rdAfterIdle(50, 0.06, 60)).toBeCloseTo(95.0, 1);
    expect(rdAfterIdle(60, 0.06, 30)).toBeCloseTo(82.8, 1);
    expect(rdAfterIdle(60, 0.06, 60)).toBeCloseTo(100.6, 1);
    expect(rdAfterIdle(50, 0.06, 365)).toBeCloseTo(200, 9);
    for (let d = 0; d < 60; d++) expect(rdAfterIdle(50, 0.06, d + 1)).toBeGreaterThan(rdAfterIdle(50, 0.06, d));
    expect(currentRd({ rd: 50, vol: 0.06, rdAt: new Date(Date.now() - 30 * 86400e3).toISOString() })).toBeCloseTo(75.9, 1);
    expect(currentRd({ rd: null, games: 0 })).toBeCloseTo(200, 9);
  });
  it('shrinks with every game played, never below 50; the match applies time away before game 1', () => {
    const r = duel({ rd: 200, daysSinceLast: null }, {}, SWEEP).w;
    expect(r.rd_before).toBeCloseTo(200, 9);
    r.games.forEach((g) => expect(g.rd_after).toBeLessThan(g.rd_before));
    expect(r.rd_after).toBeLessThan(150);
    let s = { rd: 60 };
    for (let i = 0; i < 40; i++) s = { rd: duel({ rd: s.rd, daysSinceLast: 0 }, {}, SWEEP).w.rd_after };
    expect(s.rd).toBeCloseTo(RD_MIN, 9);
    const away = duel({ rd: 60, daysSinceLast: 45 }, {}, SWEEP).w;
    expect(away.rd_before).toBeCloseTo(rdAfterIdle(60, 0.06, 45), 9);
    expect(away.games[0].rd_before).toBeCloseTo(away.rd_before, 9);
  });
  it('backfill by games played (migration 0016 uses the same formula)', () => {
    expect([0, 1, 5, 10, 20, 40, 60, 100].map((g) => +backfillRd(g).toFixed(1))).toEqual([200, 176, 127.6, 101.1, 76.5, 56.2, 50, 50]);
  });
  it('higher RD = bigger steps; your opponent\'s RD shrinks how much THEIR result tells about you', () => {
    expect(kFromRd(50)).toBeCloseTo(8.5, 1);
    expect(kFromRd(100)).toBeCloseTo(34.1, 1);
    expect(kFromRd(200)).toBeCloseTo(136.4, 1);
    const vsSettled = duel({ rd: 120 }, { rd: 50 }, [{ a: 11, b: 6 }]).w.delta;
    const vsNew = duel({ rd: 120 }, { rd: 200, daysSinceLast: null }, [{ a: 11, b: 6 }]).w.delta;
    expect(vsNew).toBeLessThan(vsSettled);
    // a brand-new player's win barely dents a regular
    const n = duel({ rd: 200, daysSinceLast: null }, {}, GRIND);
    expect([n.w.delta, n.l.delta]).toEqual([40, -5]);
  });
  it('sigma moves once per match and stays near 0.06 at office scale', () => {
    const r = duel({}, {}, SWEEP).w;
    expect(r.vol_before).toBe(0.06);
    expect(Math.abs(r.vol_after - 0.06)).toBeLessThan(0.001);
    r.games.forEach((g) => expect(g.vol).toBe(r.vol_after));
  });
});

describe('per game, in order', () => {
  it('game 2 starts from the rating AND RD game 1 left behind', () => {
    const r = duel({}, {}, SWEEP).w;
    expect(r.games[1].before).toBe(r.games[0].after);
    expect(r.games[2].before).toBe(r.games[1].after);
    expect(r.games[1].rd_before).toBe(r.games[0].rd_after);
    expect(r.after).toBe(r.games[2].after);
    expect(r.delta).toBe(r.games.reduce((t, g) => t + g.delta, 0));
    expect(r.games.map((g) => g.score)).toEqual([[11, 5], [11, 6], [11, 4]]);
    const lastLoss = duel({}, {}, [{ a: 11, b: 5 }, { a: 11, b: 5 }, { a: 8, b: 11 }]).w;
    const firstLoss = duel({}, {}, [{ a: 8, b: 11 }, { a: 11, b: 5 }, { a: 11, b: 5 }]).w;
    expect(lastLoss.delta).not.toBe(firstLoss.delta);
  });
  it('a 2-1 grind is two wins and a loss; losses mirror gains between equal regulars', () => {
    const g = duel({}, {}, GRIND);
    expect(g.w.games.map((x) => Math.sign(x.delta))).toEqual([1, -1, 1]);
    expect(g.w.delta).toBe(-g.l.delta);
  });
});

describe('multipliers', () => {
  it('margin: a blowout moves more than a narrow win (game dominance)', () => {
    expect(duel({}, {}, [{ a: 11, b: 0 }]).w.delta).toBeGreaterThan(duel({}, {}, [{ a: 12, b: 10 }]).w.delta);
    expect(movMultiplier(1)).toBe(2);
    expect(dominance(BLOW, 'a')).toBeCloseTo(27 / 39, 9);
  });
  it('upset: beating a higher-rated player is boosted, crushing a lower one damped', () => {
    expect(autocorrMultiplier(1400, 1600)).toBeGreaterThan(1);
    expect(duel({}, { rating: 1600 }, BLOW).w.games[0].ac).toBeGreaterThan(1);
    expect(duel({ rating: 1600 }, {}, BLOW).w.games[0].ac).toBeLessThan(1);
  });
  it('paddle edge: +50 in the expectation only', () => {
    expect(PADDLE_EDGE).toBe(50);
    expect(paddleEdge(['modded', 'default'])).toBe(25);
    const withPaddle = duel({ paddle: 'modded' }, {}, SWEEP).w;
    const plain = duel({}, {}, SWEEP).w;
    expect(withPaddle.games[0].expected).toBeGreaterThan(plain.games[0].expected);
    expect(withPaddle.delta).toBeLessThan(plain.delta);
    expect(withPaddle.games[0].paddle_edge).toBe(-50);
    expect(duel({}, { paddle: 'modded' }, SWEEP).w.delta).toBeGreaterThan(plain.delta);
  });
  it('target 21 x1.1, challenge x1.25, new rival x1.1 on every game', () => {
    const g = [{ a: 21, b: 15 }];
    const r21 = duel({}, {}, g, { target: 21 }).w;
    expect(r21.games[0].evidence).toBe(EVIDENCE_TARGET_21);
    const ch = duel({}, {}, SWEEP, { target: 11, challenge: true }).w;
    expect(ch.games.every((x) => x.challenge === CHALLENGE_STAKES)).toBe(true);
    expect(ch.delta).toBeGreaterThan(duel({}, {}, SWEEP).w.delta);
    const nov = duel({ novel: true }, { novel: true }, SWEEP);
    expect(nov.w.games.every((x) => x.novelty === NOVELTY_BONUS)).toBe(true);
    expect(nov.w.delta).toBeGreaterThan(duel({}, {}, SWEEP).w.delta);
    expect(nov.w.delta).toBe(-nov.l.delta);
  });
  it('rematches: recency-weighted, floored, never zero, and they shrink RD less', () => {
    const fresh = duel({}, {}, SWEEP).w;
    const many = duel({ earlierMeetings: 50 }, { earlierMeetings: 50 }, SWEEP);
    expect(many.w.delta).toBeGreaterThan(0);
    expect(many.l.delta).toBeLessThan(0);
    expect(many.w.delta).toBeLessThan(fresh.delta);
    expect(many.w.games[0].repeat).toBeCloseTo(repeatFactor(50), 9);
    expect(many.w.rd_after).toBeGreaterThan(fresh.rd_after);
    expect(meetingWeight(3)).toBeCloseTo(0.5, 9);
  });
});

describe('caps and floor', () => {
  it('max 40 a game and 80 a match', () => {
    const five = Array(5).fill({ a: 11, b: 0 });
    const r = duel({ rating: 1000, rd: 200, daysSinceLast: null }, { rating: 2000 }, five).w;
    expect(r.games.every((g) => g.delta <= MAX_GAME_DELTA)).toBe(true);
    expect(r.delta).toBe(MAX_DELTA);
  });
  it('never below 700, also mid-match', () => {
    const r = duel({ rating: 760 }, { rating: 720, rd: 200, daysSinceLast: null }, BLOW).l;
    expect(r.after).toBe(RATING_FLOOR);
    expect(r.games.every((g) => g.after >= RATING_FLOOR)).toBe(true);
  });
});

describe('doubles', () => {
  const dbl = (a1, a2, b1, b2, games = SWEEP) => rateMatch([pl('a1', 'a', a1), pl('a2', 'a', a2), pl('b1', 'b', b1), pl('b2', 'b', b2)], 'a', games, { target: 11 });
  it('team = mean rating and rms RD; each player moves by their own RD', () => {
    const r = dbl({ rd: 200, daysSinceLast: null }, { rd: 50 }, {}, {});
    expect(r[0].delta).toBeGreaterThan(r[1].delta); // the settling partner moves more
    expect(r[0].rd_after).toBeLessThan(200);
    const eq = dbl({}, {}, {}, {});
    expect(eq[0].games[0].expected).toBeCloseTo(0.5, 9);
  });
  it('partner split: the stronger partner gains less', () => {
    const r = dbl({ rating: 1600 }, { rating: 1200 }, {}, {});
    expect(r[0].delta).toBeLessThan(r[1].delta);
    expect(r[0].games[0].teammate).toBeLessThan(1);
  });
  it('predictive probability uses both RDs', () => {
    expect(predictGame(1500, 50, 1400, 50)).toBeGreaterThan(predictGame(1500, 200, 1400, 200));
  });
});

describe('challenge dodges use the RD-based K', () => {
  it('settled 24, settling 48 (the old Elo range); penalties follow', () => {
    expect(dodgeK(50)).toBe(24);
    expect(dodgeK(80)).toBe(48);
    expect(dodgeK(60)).toBeCloseTo(30.7, 1);
    expect(dodgeK(200)).toBe(48);
    expect(dodgeK(undefined)).toBe(48);
    const p = (defRd) => challengePenalty({ kind: 'expired', defRating: 1400, defRd, chalRating: 1400, rankGap: 1 }).penalty;
    expect([p(50), p(60), p(200)]).toEqual([12, 15, 24]);
  });
});

describe('worked examples (asserted so the Rules copy stays true): two regulars at RD 60, last played 3 days ago', () => {
  it('1400 beats 1600', () => {
    const b = duel({}, { rating: 1600 }, BLOW);
    expect([b.w.delta, b.l.delta]).toEqual([53, -53]);
    expect(b.w.games.map((g) => g.delta)).toEqual([19, 17, 17]);
    const n = duel({}, { rating: 1600 }, NARROW);
    expect([n.w.delta, n.l.delta]).toEqual([20, -20]);
    expect(n.w.games.map((g) => g.delta)).toEqual([12, -4, 12]);
    expect(duel({ paddle: 'modded' }, { rating: 1600 }, BLOW).w.delta).toBe(48);
  });
  it('equal 1400s: 3-0 sweep, 2-1 grind, 2-0 close', () => {
    expect([SWEEP, GRIND, CLOSE20].map((g) => duel({}, {}, g).w.delta)).toEqual([27, 6, 14]);
  });
  it('new and returning players move fast', () => {
    expect(duel({ daysSinceLast: 45 }, {}, GRIND).w.delta).toBe(12);
    expect(duel({ daysSinceLast: 90 }, {}, GRIND).w.delta).toBe(17);
  });
});
