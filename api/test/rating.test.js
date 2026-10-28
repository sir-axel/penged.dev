import { describe, it, expect } from 'vitest';
import {
  expectedScore, kFactor, repeatFactor, computeDelta, rateMatch, xpForMatch, levelForXp, xpForLevel,
  challengePenalty, dodgeBase, closeness, rankFactor, DODGE_RANK_FACTOR, RATING_FLOOR,
  dominance, movMultiplier, autocorrMultiplier, MAX_DELTA, MOV_BASE, MOV_SCALE,
  validateGames, summarizeGames, rankPlayers, PADDLE_EDGE, paddleEdge,
  kSmooth, rustFactor, certaintyWeight, evidenceWeight, meetingWeight, teammateFactor, CHALLENGE_STAKES, RANK_SQL,
} from '../src/rating.js';

describe('elo', () => {
  it('expected score', () => {
    expect(expectedScore(1400, 1600)).toBeCloseTo(0.2403, 4);
    expect(expectedScore(1400, 1400)).toBe(0.5);
  });
  it('K tiers', () => {
    expect([0, 9, 10, 29, 30, 100].map(kFactor)).toEqual([48, 48, 32, 32, 24, 24]);
  });
  const dl = (rating, oppRating, won, extra = {}) =>
    computeDelta({ rating, oppRating, matchesPlayed: 0, won, dominance: 0.25, ...extra });
  const single = (wr, lr, games, extra = {}) => {
    const r = rateMatch([
      { id: 'w', side: 'a', rating: wr, matchesPlayed: 10, earlierMeetings: 0, ...extra },
      { id: 'l', side: 'b', rating: lr, matchesPlayed: 10, earlierMeetings: 0, ...extra },
    ], 'a', games);
    return { w: r[0], l: r[1] };
  };
  const BLOW = [{ a: 11, b: 2 }, { a: 11, b: 3 }, { a: 11, b: 1 }];
  const NARROW = [{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 12, b: 10 }];

  it('dominance and margin multiplier', () => {
    expect(dominance(BLOW, 'a')).toBeCloseTo(27 / 39, 6);
    expect(dominance([{ a: 11, b: 0 }], 'a')).toBe(1);
    expect(dominance([{ a: 0, b: 11 }], 'b')).toBe(1);
    expect(dominance([], 'a')).toBe(0);
    expect(MOV_BASE).toBe(0.75);
    expect(MOV_SCALE).toBe(1.25);
    expect(movMultiplier(1)).toBeCloseTo(2.0, 6);
    expect(movMultiplier(0.25)).toBeCloseTo(1.375, 6);
    expect(movMultiplier(0)).toBe(0.75);
  });
  it('autocorrelation: damps favourites, amplifies upsets, clamps', () => {
    expect(autocorrMultiplier(1600, 1400)).toBeLessThan(1);
    expect(autocorrMultiplier(1400, 1600)).toBeGreaterThan(1);
    expect(autocorrMultiplier(1400, 1400)).toBe(1);
    expect(autocorrMultiplier(9000, 1000)).toBe(0.6);
    expect(autocorrMultiplier(1000, 9000)).toBe(1.6);
  });
  it('first match 1400 beats 1600: blowout +58 / narrow +32 (both at 10 games), mirrored for the loser', () => {
    const b = single(1400, 1600, BLOW);
    expect([b.w.delta, b.l.delta]).toEqual([58, -58]);
    const n = single(1400, 1600, NARROW);
    expect([n.w.delta, n.l.delta]).toEqual([32, -32]);
    expect(b.w).toMatchObject({ before: 1400, after: 1458 });
    expect(b.w.mov).toBeCloseTo(0.75 + 1.25 * Math.sqrt(27 / 39), 6);
    expect(b.w.ac).toBeCloseTo(1.1, 6);
  });
  it('blowout moves more than a close win, for winner and loser', () => {
    const blow = single(1400, 1400, BLOW);
    const close = single(1400, 1400, NARROW);
    expect(blow.w.delta).toBeGreaterThan(close.w.delta);
    expect(blow.l.delta).toBeLessThan(close.l.delta);
  });
  it('equal-K singles is zero-sum', () => {
    for (const [wr, lr, g] of [[1400, 1400, BLOW], [1400, 1600, NARROW], [1700, 1300, BLOW], [1500, 1900, BLOW]]) {
      const r = single(wr, lr, g);
      expect(r.w.delta + r.l.delta).toBe(0);
    }
  });
  it('upset blowout hits but never exceeds the cap of 80', () => {
    const r = single(1400, 2000, BLOW);
    expect(MAX_DELTA).toBe(80);
    expect(r.w.delta).toBe(80);
    expect(single(1400, 1700, BLOW).w.delta).toBeGreaterThan(55);
    expect(dl(800, 2400, true, { dominance: 1 }).delta).toBe(80);
  });
  it('loser loss is capped at 80 too', () => {
    expect(dl(2400, 800, false, { dominance: 1 }).delta).toBe(-80);
    expect(single(1400, 2000, BLOW).l.delta).toBe(-80);
  });
  it('favourite blowout is damped vs underdog blowout amplified', () => {
    const fav = single(1600, 1400, BLOW).w;
    const dog = single(1400, 1600, BLOW).w;
    expect(fav.ac).toBeLessThan(1);
    expect(dog.ac).toBeGreaterThan(1);
    expect(dog.delta).toBeGreaterThan(fav.delta * 2);
  });
  it('loser loses a lot when crushed by a lower-rated player, little in a narrow loss to a higher-rated one', () => {
    const crushedByLower = single(1400, 1600, BLOW).l.delta; // 1600 lost to 1400, crushed
    const narrowToHigher = single(1600, 1400, NARROW).l.delta; // 1400 lost narrowly to 1600
    expect(Math.abs(crushedByLower)).toBeGreaterThan(Math.abs(narrowToHigher));
    expect(crushedByLower).toBe(-58);
    expect(narrowToHigher).toBe(-8);
  });
  it('loser loses less in a narrow loss than a blowout loss', () => {
    expect(single(1400, 1400, NARROW).l.delta).toBeGreaterThan(single(1400, 1400, BLOW).l.delta);
  });
  it('floors rating at 700', () => {
    expect(computeDelta({ rating: 710, oppRating: 710, matchesPlayed: 0, won: false, dominance: 0.25 })).toMatchObject({ delta: -10, after: 700 });
    expect(computeDelta({ rating: 700, oppRating: 700, matchesPlayed: 0, won: false, dominance: 0.25 })).toMatchObject({ delta: 0, after: 700 });
    expect(single(720, 705, BLOW).l.after).toBe(700);
  });
  it('repeat factor', () => {
    expect(repeatFactor(0)).toBe(1);
    expect(repeatFactor(1)).toBeCloseTo(0.5714, 4);
    expect(repeatFactor(2)).toBeCloseTo(0.4, 4);
  });
  it('repeat meetings shrink both gain and loss; six earlier meetings freezes both players', () => {
    const f = (n, won) => dl(1400, 1400, won, { earlierMeetings: n, dominance: 0 }).delta;
    expect(f(0, true)).toBe(18); // 48 * .5 * .75
    expect(f(1, true)).toBe(Math.round(18 * repeatFactor(1)));
    expect(f(1, false)).toBe(-f(1, true));
    expect(f(5, true)).toBeGreaterThan(0);
    expect(f(6, true)).toBe(0);
    expect(f(6, false)).toBe(0);
    expect(f(9, false)).toBe(0);
  });
  it('doubles uses team averages, own K and floor', () => {
    const r = rateMatch([
      { id: 'a1', side: 'a', rating: 1300, matchesPlayed: 0, earlierMeetings: 0 },
      { id: 'a2', side: 'a', rating: 1500, matchesPlayed: 40, earlierMeetings: 0 },
      { id: 'b1', side: 'b', rating: 1400, matchesPlayed: 0, earlierMeetings: 0 },
      { id: 'b2', side: 'b', rating: 1400, matchesPlayed: 0, earlierMeetings: 0 },
    ], 'a');
    // teams equal on average (1400 v 1400), mov .75. a1: K48 x teammate 1.125 x certainty .6 (opps average 20 games => b: 1) ...
    expect(Object.fromEntries(r.map((x) => [x.id, x.delta]))).toEqual({ a1: 16, a2: 9, b1: -18, b2: -18 });
    expect(r.find((x) => x.id === 'a1').after).toBe(1316);
  });
});

describe('xp', () => {
  it('formula', () => {
    expect(xpForMatch({ won: false, gamesWon: 1 }).total).toBe(30);
    expect(xpForMatch({ won: true, gamesWon: 2 }).total).toBe(60);
    expect(xpForMatch({ won: true, gamesWon: 9 }).total).toBe(75);
  });
  it('levels', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(39)).toBe(1);
    expect(levelForXp(40)).toBe(2);
    expect(levelForXp(639)).toBe(4);
    expect(levelForXp(640)).toBe(5);
    expect(xpForLevel(5)).toBe(640);
  });
});

describe('xp bonuses', () => {
  const x = (o) => xpForMatch({ won: true, gamesWon: 2, ...o });
  const part = (r, k) => r.parts.find((p) => p.key === k)?.xp;
  it('base parts', () => {
    const r = x({});
    expect(r.parts.map((p) => [p.key, p.xp])).toEqual([['played', 25], ['win', 25], ['games', 10]]);
    expect(r.total).toBe(60);
  });
  it('upset: +10 per full 50 gap, max 60, winners only', () => {
    expect(part(x({ ratingGap: 49 }), 'upset')).toBeUndefined();
    expect(part(x({ ratingGap: 50 }), 'upset')).toBe(10);
    expect(part(x({ ratingGap: 149 }), 'upset')).toBe(20);
    expect(part(x({ ratingGap: 200 }), 'upset')).toBe(40);
    expect(part(x({ ratingGap: 900 }), 'upset')).toBe(60);
    expect(part(x({ ratingGap: -200 }), 'upset')).toBeUndefined();
    expect(part(xpForMatch({ won: false, gamesWon: 1, ratingGap: 300 }), 'upset')).toBeUndefined();
  });
  it('streak: from 2 wins, +10*(n-1), max 50', () => {
    expect(part(x({ streak: 1 }), 'streak')).toBeUndefined();
    expect(part(x({ streak: 2 }), 'streak')).toBe(10);
    expect(part(x({ streak: 4 }), 'streak')).toBe(30);
    expect(part(x({ streak: 6 }), 'streak')).toBe(50);
    expect(part(x({ streak: 40 }), 'streak')).toBe(50);
  });
  it('skunk: +15 per game won to 0', () => {
    expect(part(x({ skunks: 0 }), 'skunk')).toBeUndefined();
    expect(part(x({ skunks: 1 }), 'skunk')).toBe(15);
    expect(part(x({ skunks: 3 }), 'skunk')).toBe(45);
    expect(part(xpForMatch({ won: false, gamesWon: 1, skunks: 1 }), 'skunk')).toBe(15);
  });
  it('comeback: +15 for winning after losing game 1', () => {
    expect(part(x({ lostFirstGame: true }), 'comeback')).toBe(15);
    expect(part(xpForMatch({ won: false, gamesWon: 1, lostFirstGame: true }), 'comeback')).toBeUndefined();
  });
  it('first match of the day: +10', () => {
    expect(part(x({ firstOfDay: true }), 'first_of_day')).toBe(10);
    expect(part(x({}), 'first_of_day')).toBeUndefined();
  });
  it('everything stacks into the total', () => {
    const r = x({ ratingGap: 200, streak: 3, skunks: 1, lostFirstGame: true, firstOfDay: true });
    expect(r.total).toBe(25 + 25 + 10 + 40 + 20 + 15 + 15 + 10);
    expect(r.total).toBe(r.parts.reduce((s, p) => s + p.xp, 0));
  });
});

describe('challenge penalties', () => {
  const base = { defRating: 1400, defMatches: 0, chalRating: 1400, rankGap: 1 };
  const pen = (kind, o = {}) => challengePenalty({ kind, ...base, ...o });
  it('closeness peaks at 1 when evenly matched and shrinks with the gap', () => {
    expect(closeness(1400, 1400)).toBe(1);
    expect(closeness(1600, 1400)).toBeCloseTo(0.75, 1);
    expect(closeness(1800, 1400)).toBeCloseTo(0.36, 1);
    expect(closeness(1400, 1800)).toBeCloseTo(closeness(1800, 1400), 6);
  });
  it('rank factor', () => {
    expect(DODGE_RANK_FACTOR).toEqual({ 1: 1.0, 2: 0.8, 3: 0.6 });
    expect([1, 2, 3, 7].map(rankFactor)).toEqual([1, 0.8, 0.6, 0.6]);
  });
  it('expired costs double a decline; equal adjacent first-timers: 24 vs 12', () => {
    expect(pen('expired')).toMatchObject({ penalty: 24, reason: 'expired', dropsRank: true, walkover: true });
    expect(pen('declined')).toMatchObject({ penalty: 12, reason: 'declined', dropsRank: true, walkover: false });
  });
  it('near-equal + adjacent pays the most; a big rating gap pays less', () => {
    const near = pen('expired', { chalRating: 1420 }).penalty;
    const farBelow = pen('expired', { defRating: 1800, chalRating: 1400 }).penalty; // high-ranked ignores a much lower challenger
    const farAbove = pen('expired', { defRating: 1400, chalRating: 1800 }).penalty;
    expect(near).toBeGreaterThan(farBelow);
    expect(near).toBeGreaterThan(farAbove);
    expect(farBelow).toBeGreaterThanOrEqual(5);
    expect(pen('expired', { defRating: 1600 }).penalty).toBeLessThan(near);
  });
  it('rank gap 3 pays less than rank gap 1 at the same ratings', () => {
    const g1 = pen('expired', { rankGap: 1 }).penalty;
    const g2 = pen('expired', { rankGap: 2 }).penalty;
    const g3 = pen('expired', { rankGap: 3 }).penalty;
    expect(g1).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(g3);
    expect([g1, g2, g3]).toEqual([24, 19, 14]);
  });
  it('repeat meetings reduce it', () => {
    expect(pen('expired', { meetings: 2 }).penalty).toBeLessThan(pen('expired').penalty);
    expect(dodgeBase({ ...base, meetings: 1 })).toBeCloseTo(24 * repeatFactor(1), 6);
  });
  it('minimums: 5 expired / 3 declined even when far apart', () => {
    expect(pen('expired', { defRating: 2400, chalRating: 1000 }).penalty).toBe(5);
    expect(pen('declined', { defRating: 2400, chalRating: 1000 }).penalty).toBe(3);
  });
  it('recent-match waiver zeroes a decline but not an expiry', () => {
    expect(pen('declined', { recentPairMatch: true })).toMatchObject({ penalty: 0, reason: 'waived_recent_match', dropsRank: false });
    expect(pen('expired', { recentPairMatch: true }).penalty).toBe(24);
  });
  it('fatigue halves a decline (after the minimum), not an expiry', () => {
    expect(pen('declined', { defRecentMatches: 3 })).toMatchObject({ penalty: 6, reason: 'fatigue_halved' });
    expect(pen('declined', { defRecentMatches: 2 }).penalty).toBe(12);
    expect(pen('declined', { defRating: 2400, chalRating: 1000, defRecentMatches: 5 }).penalty).toBe(2); // min 3, halved
    expect(pen('expired', { defRecentMatches: 9 }).penalty).toBe(24);
  });
  it('never exceeds the cap and respects the floor', () => {
    expect(pen('expired').penalty).toBeLessThanOrEqual(80);
    expect(pen('expired', { defRating: 702, chalRating: 702 }).penalty).toBe(2);
    expect(pen('expired', { defRating: RATING_FLOOR, chalRating: RATING_FLOOR }).penalty).toBe(0);
  });
});

describe('validateGames', () => {
  const ok = [{ a: 11, b: 5 }];
  it('accepts valid', () => {
    expect(validateGames(11, ok)).toBeNull();
    expect(validateGames(11, [{ a: 12, b: 10 }])).toBeNull();
    expect(validateGames(21, [{ a: 21, b: 19 }, { a: 17, b: 21 }, { a: 25, b: 23 }])).toBeNull();
  });
  it('rejects', () => {
    expect(validateGames(15, ok)).toBe('Choose a game target of 11 or 21.');
    expect(validateGames(11, [])).toBe('Add at least one game.');
    expect(validateGames(11, undefined)).toBe('Add at least one game.');
    expect(validateGames(11, Array(6).fill({ a: 11, b: 0 }))).toBe('A match is at most five games.');
    expect(validateGames(11, [{ a: 11.5, b: 2 }])).toBe('Scores must be whole numbers.');
    expect(validateGames(11, [{ a: -1, b: 2 }])).toBe('Scores must be whole numbers.');
    expect(validateGames(11, [{ a: '11', b: 2 }])).toBe('Scores must be whole numbers.');
    expect(validateGames(11, [{ a: 9, b: 7 }])).toBe('Every game must reach 11 for the winner.');
    expect(validateGames(11, [{ a: 11, b: 10 }])).toBe('A game at 11 needs a two-point lead.');
    expect(validateGames(11, [{ a: 13, b: 10 }])).toBe('Past 11-11, a game is won by two.');
    expect(validateGames(11, [{ a: 12, b: 11 }])).toBe('Past 11-11, a game is won by two.');
    expect(validateGames(11, [{ a: 11, b: 3 }, { a: 4, b: 11 }])).toBe('The games are level — the match needs a winner.');
  });
  it('summarizes', () => {
    expect(summarizeGames([{ a: 11, b: 3 }, { a: 4, b: 11 }, { a: 11, b: 9 }])).toEqual({ games_a: 2, games_b: 1, winner_side: 'a' });
  });
});

describe('rankPlayers', () => {
  const P = (id, rating, played = 0, created_date = '2026-01-01T00:00:00.000Z') => ({ id, rating, played, created_date });
  it('orders by rating, highest first, ranks 1..N', () => {
    expect(rankPlayers([P('a', 1400), P('b', 1500), P('c', 1300)])).toEqual({ b: 1, a: 2, c: 3 });
  });
  it('ties: more games played, then earlier joined, then id', () => {
    expect(rankPlayers([P('a', 1400, 1), P('b', 1400, 5)])).toEqual({ b: 1, a: 2 });
    expect(rankPlayers([P('a', 1400, 2, '2026-02-01'), P('b', 1400, 2, '2026-01-01')])).toEqual({ b: 1, a: 2 });
    expect(rankPlayers([P('b', 1400), P('a', 1400)])).toEqual({ a: 1, b: 2 });
  });
  it('does not mutate its input', () => {
    const list = [P('a', 1), P('b', 2)];
    rankPlayers(list);
    expect(list.map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('paddle edge', () => {
  const G = [{ a: 11, b: 5 }, { a: 11, b: 6 }];
  const duel = (pa, pb, ra = 1400, rb = 1400, games = G) => {
    const r = rateMatch([
      { id: 'w', side: 'a', rating: ra, matchesPlayed: 20, earlierMeetings: 0, paddle: pa },
      { id: 'l', side: 'b', rating: rb, matchesPlayed: 20, earlierMeetings: 0, paddle: pb },
    ], 'a', games);
    return { w: r[0], l: r[1] };
  };
  it('constant and per-side share', () => {
    expect(PADDLE_EDGE).toBe(50);
    expect(paddleEdge(['default'])).toBe(0);
    expect(paddleEdge(['modded'])).toBe(50);
    expect(paddleEdge(['modded', 'default'])).toBe(25);
    expect(paddleEdge(['modded', 'modded'])).toBe(50);
  });
  it('paid winner gains less, free winner over paid gains more, losses mirror', () => {
    const ff = duel('default', 'default');
    const pf = duel('modded', 'default');
    const fp = duel('default', 'modded');
    expect(pf.w.delta).toBeLessThan(ff.w.delta);
    expect(fp.w.delta).toBeGreaterThan(ff.w.delta);
    expect(pf.w.delta + pf.l.delta).toBe(0);
    expect(fp.w.delta + fp.l.delta).toBe(0);
    expect(ff.w.paddle_edge).toBe(0);
    expect(pf.w.paddle_edge).toBe(-50);
    expect(pf.l.paddle_edge).toBe(50);
    expect(fp.w.paddle_edge).toBe(50);
  });
  it('both paid equals both free', () => {
    const ff = duel('default', 'default');
    const pp = duel('modded', 'modded');
    expect(pp.w.delta).toBe(ff.w.delta);
    expect(pp.l.delta).toBe(ff.l.delta);
    expect(pp.w.paddle_edge).toBe(0);
  });
  it('stored rating never includes the edge', () => {
    const pf = duel('modded', 'default');
    expect(pf.w.before).toBe(1400);
    expect(pf.w.after).toBe(1400 + pf.w.delta);
  });
  it('doubles uses half the edge for one paid paddle', () => {
    const team = (p1, p2, side) => [
      { id: `${side}1`, side, rating: 1400, matchesPlayed: 20, earlierMeetings: 0, paddle: p1 },
      { id: `${side}2`, side, rating: 1400, matchesPlayed: 20, earlierMeetings: 0, paddle: p2 },
    ];
    const run = (a1, a2) => rateMatch([...team(a1, a2, 'a'), ...team('default', 'default', 'b')], 'a', G)[0];
    const none = run('default', 'default');
    const half = run('modded', 'default');
    const full = run('modded', 'modded');
    expect(half.paddle_edge).toBe(-25);
    expect(full.paddle_edge).toBe(-50);
    expect(half.expected).toBeCloseTo(expectedScore(1425, 1400), 9);
    expect(none.delta).toBeGreaterThanOrEqual(half.delta);
    expect(half.delta).toBeGreaterThanOrEqual(full.delta);
    expect(none.delta).toBeGreaterThan(full.delta);
  });
  it('autocorrelation uses effective ratings', () => {
    // Equal ratings: a paid-paddle loser makes the free winner's win a bigger upset, and vice versa.
    const fp = computeDelta({ rating: 1400, oppRating: 1400, matchesPlayed: 20, won: true, dominance: 0.25, oppEdge: 50 });
    expect(fp.ac).toBeCloseTo(autocorrMultiplier(1400, 1450), 9);
    expect(fp.ac).toBeGreaterThan(1);
    const pf = computeDelta({ rating: 1400, oppRating: 1400, matchesPlayed: 20, won: true, dominance: 0.25, edge: 50 });
    expect(pf.ac).toBeCloseTo(autocorrMultiplier(1450, 1400), 9);
    expect(pf.ac).toBeLessThan(1);
  });
  it('cap and floor still hold', () => {
    const r = duel('default', 'modded', 700, 2400, [{ a: 11, b: 0 }, { a: 11, b: 0 }, { a: 11, b: 0 }]);
    expect(r.w.delta).toBeLessThanOrEqual(MAX_DELTA);
    const lo = duel('modded', 'default', 2400, 705, [{ a: 11, b: 0 }, { a: 11, b: 0 }]);
    expect(lo.l.after).toBeGreaterThanOrEqual(RATING_FLOOR);
  });
  it('xp upset uses real rating gap, not paddles', () => {
    expect(xpForMatch({ won: true, ratingGap: 0 }).parts.some((x) => x.key === 'upset')).toBe(false);
    expect(xpForMatch({ won: true, ratingGap: 100 }).parts.find((x) => x.key === 'upset').xp).toBe(20);
  });
});

describe('smooth K, rust, certainty, evidence, recency, teammate, challenge', () => {
  const G = [{ a: 11, b: 5 }, { a: 11, b: 6 }];
  const base = { rating: 1400, oppRating: 1400, matchesPlayed: 20, won: true, dominance: 0.25 };
  it('K decays smoothly from 48 toward 32', () => {
    expect(kSmooth(0)).toBe(48);
    expect(kSmooth(12)).toBeCloseTo(32 + 16 / Math.E, 9);
    expect(kSmooth(1000)).toBeCloseTo(32, 6);
    for (let g = 0; g < 60; g++) expect(kSmooth(g + 1)).toBeLessThan(kSmooth(g));
  });
  it('rust: none under 3 weeks or on a first match, +50% cap after ~3.5 months', () => {
    expect(rustFactor(null)).toBe(1);
    expect(rustFactor(0)).toBe(1);
    expect(rustFactor(21)).toBe(1);
    expect(rustFactor(81)).toBeCloseTo(1.5, 9);
    expect(rustFactor(51)).toBeCloseTo(1.25, 9);
    expect(rustFactor(1000)).toBe(1.5);
    const rusty = computeDelta({ ...base, daysSinceLast: 141 });
    const fresh = computeDelta({ ...base, daysSinceLast: 5 });
    expect(rusty.k).toBeCloseTo(fresh.k * 1.5, 9);
    expect(rusty.delta).toBeGreaterThan(fresh.delta);
    expect(rusty.rust).toBe(1.5);
  });
  it('opponent certainty: new opponents move you less, full weight from 10 games', () => {
    expect(certaintyWeight(0)).toBe(0.8);
    expect(certaintyWeight(5)).toBeCloseTo(0.9, 9);
    expect(certaintyWeight(10)).toBe(1);
    expect(certaintyWeight(50)).toBe(1);
    const vsNew = computeDelta({ ...base, oppMatchesPlayed: 0 });
    const vsReg = computeDelta({ ...base, oppMatchesPlayed: 20 });
    expect(vsNew.delta).toBeLessThan(vsReg.delta);
    expect(vsNew.opp_certainty).toBe(0.8);
  });
  it('doubles certainty averages the two opponents', () => {
    const r = rateMatch([
      { id: 'a1', side: 'a', rating: 1400, matchesPlayed: 20, earlierMeetings: 0 },
      { id: 'a2', side: 'a', rating: 1400, matchesPlayed: 20, earlierMeetings: 0 },
      { id: 'b1', side: 'b', rating: 1400, matchesPlayed: 0, earlierMeetings: 0 },
      { id: 'b2', side: 'b', rating: 1400, matchesPlayed: 10, earlierMeetings: 0 },
    ], 'a', G);
    expect(r[0].opp_certainty).toBeCloseTo(certaintyWeight(5), 9);
    expect(r[2].opp_certainty).toBe(1);
  });
  it('evidence by games played and target', () => {
    expect([1, 2, 3, 4, 5].map((n) => evidenceWeight(n, 11))).toEqual([0.8, 1, 1, 1.1, 1.1]);
    expect(evidenceWeight(2, 21)).toBeCloseTo(1.1, 9);
    expect(evidenceWeight(1, 21)).toBeCloseTo(0.88, 9);
    const mk = (games, target) => rateMatch([
      { id: 'w', side: 'a', rating: 1400, matchesPlayed: 20, earlierMeetings: 0 },
      { id: 'l', side: 'b', rating: 1400, matchesPlayed: 20, earlierMeetings: 0 },
    ], 'a', games, { target })[0];
    expect(mk([{ a: 11, b: 5 }], 11).evidence).toBe(0.8);
    expect(mk([{ a: 21, b: 5 }, { a: 21, b: 5 }], 21).evidence).toBeCloseTo(1.1, 9);
  });
  it('repeat factor weights recent meetings fully and older ones by half; six weighted freezes both', () => {
    expect(meetingWeight(0)).toBe(1);
    expect(meetingWeight(30)).toBe(1);
    expect(meetingWeight(31)).toBe(0.5);
    expect(meetingWeight(179)).toBe(0.5);
    const old = computeDelta({ ...base, earlierMeetings: 2 * meetingWeight(60) });
    const recent = computeDelta({ ...base, earlierMeetings: 2 * meetingWeight(10) });
    expect(old.delta).toBeGreaterThan(recent.delta);
    expect(old.repeat).toBeCloseTo(1 / 1.75, 9);
    expect(computeDelta({ ...base, earlierMeetings: 5.5 }).delta).toBeGreaterThan(0);
    expect(computeDelta({ ...base, earlierMeetings: 6 }).delta).toBe(0);
    expect(computeDelta({ ...base, won: false, earlierMeetings: 6 }).delta).toBe(0);
  });
  it('teammate factor: stronger partner gains less on a win and loses more on a loss', () => {
    expect(teammateFactor(1400, 1400, true)).toBe(1);
    expect(teammateFactor(1600, 1400, true)).toBeCloseTo(0.875, 9);
    expect(teammateFactor(1200, 1400, true)).toBeCloseTo(1.125, 9);
    expect(teammateFactor(1600, 1400, false)).toBeCloseTo(1.125, 9);
    expect(teammateFactor(1200, 1400, false)).toBeCloseTo(0.875, 9);
    expect(teammateFactor(3000, 1000, true)).toBe(0.75);
    expect(teammateFactor(1000, 3000, true)).toBe(1.25);
    const t = (a1, a2, w) => rateMatch([
      { id: 'a1', side: 'a', rating: a1, matchesPlayed: 20, earlierMeetings: 0 },
      { id: 'a2', side: 'a', rating: a2, matchesPlayed: 20, earlierMeetings: 0 },
      { id: 'b1', side: 'b', rating: 1400, matchesPlayed: 20, earlierMeetings: 0 },
      { id: 'b2', side: 'b', rating: 1400, matchesPlayed: 20, earlierMeetings: 0 },
    ], w, G);
    const win = t(1500, 1300, 'a');
    expect(win[0].delta).toBeLessThan(win[1].delta);
    const loss = t(1500, 1300, 'b');
    expect(loss[0].delta).toBeLessThan(loss[1].delta); // stronger partner loses more
    expect(win[2].teammate).toBe(1);
  });
  it('challenge stakes x1.25, singles only flag from the caller', () => {
    expect(CHALLENGE_STAKES).toBe(1.25);
    const mk = (challenge) => rateMatch([
      { id: 'w', side: 'a', rating: 1400, matchesPlayed: 20, earlierMeetings: 0 },
      { id: 'l', side: 'b', rating: 1400, matchesPlayed: 20, earlierMeetings: 0 },
    ], 'a', [{ a: 11, b: 0 }, { a: 11, b: 0 }], { challenge });
    expect(mk(true)[0].challenge).toBe(1.25);
    expect(mk(false)[0].challenge).toBe(1);
    expect(mk(true)[0].delta).toBeGreaterThan(mk(false)[0].delta);
    expect(mk(true)[0].delta).toBe(-mk(true)[1].delta);
  });
  it('cap holds with every multiplier stacked', () => {
    const r = computeDelta({ rating: 700, oppRating: 2500, matchesPlayed: 0, won: true, dominance: 1, daysSinceLast: 200, evidence: 1.21, challenge: 1.25, edge: 0, oppEdge: 50 });
    expect(r.delta).toBe(80);
  });
});

describe('active ranking', () => {
  const P = (id, rating, last) => ({ id, rating, played: 3, created_date: '2026-01-01', last_verified_at: last });
  it('inactive players (last verified match older than cutoff) get no rank; never-played stay ranked', () => {
    const r = rankPlayers([P('a', 1500, '2026-01-01T00:00:00Z'), P('b', 1400, '2026-03-01T00:00:00Z'), P('c', 1300, null), P('d', 1450, '2026-03-02T00:00:00Z')], '2026-02-01T00:00:00Z');
    expect(r).toEqual({ d: 1, b: 2, c: 3 });
    expect(r.a).toBeUndefined();
  });
  it('no cutoff ranks everyone', () => {
    expect(rankPlayers([P('a', 1500, '2020-01-01T00:00:00Z'), P('b', 1400, null)])).toEqual({ a: 1, b: 2 });
  });
  it('SQL mirrors it', () => {
    expect(RANK_SQL).toContain('singles_last_verified_at');
    expect(RANK_SQL).toContain('PARTITION BY active');
  });
});

describe('worked examples (asserted so the Rules copy stays true)', () => {
  const BLOW = [{ a: 11, b: 2 }, { a: 11, b: 3 }, { a: 11, b: 1 }];
  const NARROW = [{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 12, b: 10 }];
  const run = (games, extra = {}) => rateMatch([
    { id: 'w', side: 'a', rating: 1400, matchesPlayed: 10, earlierMeetings: 0, ...extra.w },
    { id: 'l', side: 'b', rating: 1600, matchesPlayed: 10, earlierMeetings: 0, ...extra.l },
  ], 'a', games, { target: 11, ...extra.ctx });
  it('1400 beats 1600, both regulars with free paddles: blowout +58/-58, narrow +32/-32', () => {
    const b = run(BLOW);
    expect(b.map((x) => x.delta)).toEqual([58, -58]);
    expect(b[0].expected).toBeCloseTo(0.24, 2);
    expect(b[0].mov).toBeCloseTo(1.79, 2);
    expect(b[0].ac).toBeCloseTo(1.1, 2);
    expect(run(NARROW).map((x) => x.delta)).toEqual([32, -32]);
    expect(run(NARROW)[0].mov).toBeCloseTo(0.97, 2);
  });
  it('the same blowout with a paid paddle for the winner / the loser', () => {
    expect(run(BLOW, { w: { paddle: 'modded' } }).map((x) => x.delta)).toEqual([53, -53]);
    expect(run(BLOW, { l: { paddle: 'modded' } }).map((x) => x.delta)).toEqual([64, -64]);
  });
  it('rust and challenge stakes; unequal K breaks exact zero-sum, as documented', () => {
    expect(run(BLOW, { ctx: { challenge: true } }).map((x) => x.delta)).toEqual([73, -73]);
    expect(run(BLOW, { w: { daysSinceLast: 81 } }).map((x) => x.delta)).toEqual([80, -58]);
  });
});
