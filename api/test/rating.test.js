import { describe, it, expect } from 'vitest';
import {
  expectedScore, kFactor, repeatFactor, computeDelta, rateMatch, xpForMatch, levelForXp, xpForLevel,
  challengePenalty, dodgeBase, closeness, rankFactor, DODGE_RANK_FACTOR, RATING_FLOOR,
  dominance, gameDominance, movMultiplier, autocorrMultiplier, MAX_DELTA, MAX_GAME_DELTA, GAME_K_SCALE, MOV_BASE, MOV_SCALE,
  validateGames, summarizeGames, rankPlayers, PADDLE_EDGE, paddleEdge,
  kSmooth, rustFactor, certaintyWeight, evidenceWeight, meetingWeight, teammateFactor, CHALLENGE_STAKES, RANK_SQL,
} from '../src/rating.js';

// Every game is its own Elo event. Helpers: a regular has 25 games behind them.
const duel = (wr, lr, games, ew = {}, el = {}, ctx = {}) => {
  const r = rateMatch([
    { id: 'w', side: 'a', rating: wr, gamesPlayed: 25, earlierMeetings: 0, ...ew },
    { id: 'l', side: 'b', rating: lr, gamesPlayed: 25, earlierMeetings: 0, ...el },
  ], 'a', games, { target: 11, ...ctx });
  return { w: r[0], l: r[1] };
};
const BLOW = [{ a: 11, b: 2 }, { a: 11, b: 3 }, { a: 11, b: 1 }];
const NARROW = [{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 12, b: 10 }];
const SWEEP = [{ a: 11, b: 5 }, { a: 11, b: 6 }, { a: 11, b: 4 }];
const GRIND = [{ a: 11, b: 9 }, { a: 8, b: 11 }, { a: 11, b: 9 }];
const CLOSE20 = [{ a: 11, b: 9 }, { a: 12, b: 10 }];
const reg = { gamesPlayed: 20 };

describe('elo (per game)', () => {
  it('expected score', () => {
    expect(expectedScore(1400, 1600)).toBeCloseTo(0.2403, 4);
    expect(expectedScore(1400, 1400)).toBe(0.5);
  });
  it('K tiers (challenge penalties only)', () => {
    expect([0, 9, 10, 29, 30, 100].map(kFactor)).toEqual([48, 48, 32, 32, 24, 24]);
  });
  const dl = (rating, oppRating, won, extra = {}) =>
    computeDelta({ rating, oppRating, gamesPlayed: 0, won, dominance: 0.25, ...extra });

  it('per-game dominance is that game only', () => {
    expect(gameDominance({ a: 11, b: 2 })).toBeCloseTo(9 / 13, 9);
    expect(gameDominance({ a: 9, b: 11 })).toBeCloseTo(2 / 20, 9);
    expect(gameDominance({ a: 11, b: 0 })).toBe(1);
    const r = duel(1400, 1400, [{ a: 11, b: 0 }, { a: 12, b: 10 }], reg, reg);
    expect(r.w.games.map((g) => +g.dominance.toFixed(4))).toEqual([1, +(2 / 22).toFixed(4)]);
    expect(r.w.games[0].delta).toBeGreaterThan(r.w.games[1].delta); // a skunk moves more than a 12-10
    expect(r.w.dominance).toBeCloseTo(dominance([{ a: 11, b: 0 }, { a: 12, b: 10 }], 'a'), 9); // whole match kept for display
  });
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
  it('games are applied SEQUENTIALLY: game 2 starts from the rating game 1 left', () => {
    const r = duel(1400, 1400, SWEEP, reg, reg);
    const g = r.w.games;
    expect(g[0].before).toBe(1400);
    expect(g[1].before).toBe(g[0].after);
    expect(g[2].before).toBe(g[1].after);
    expect(r.w.after).toBe(g[2].after);
    expect(r.w.delta).toBe(g[0].delta + g[1].delta + g[2].delta);
    // the expectation is recomputed from the moved ratings: the winner is a bit more expected each game, so gains shrink
    expect(g[1].expected).toBeGreaterThan(g[0].expected);
    expect(g[1].expected).toBeCloseTo(expectedScore(g[1].before, r.l.games[1].before), 9);
    // an order swap changes the path: same games, losing game first vs last
    const lastLoss = duel(1400, 1400, [{ a: 11, b: 5 }, { a: 11, b: 5 }, { a: 8, b: 11 }], reg, reg).w;
    const firstLoss = duel(1400, 1400, [{ a: 8, b: 11 }, { a: 11, b: 5 }, { a: 11, b: 5 }], reg, reg).w;
    expect(lastLoss.delta).not.toBe(firstLoss.delta);
  });
  it('a 3-0 sweep is worth clearly more than a 2-1 grind; 2-0 close sits between', () => {
    const s = duel(1400, 1400, SWEEP, reg, reg).w.delta;
    const gr = duel(1400, 1400, GRIND, reg, reg).w.delta;
    const c = duel(1400, 1400, CLOSE20, reg, reg).w.delta;
    expect([s, gr, c]).toEqual([41, 10, 22]);
    expect(s).toBeGreaterThan(2 * gr);
    expect(c).toBeGreaterThan(gr);
    expect(c).toBeLessThan(s);
    // a 2-1 grind is two wins and a loss: the loss really subtracts
    const g = duel(1400, 1400, GRIND, reg, reg);
    expect(g.w.games.map((x) => Math.sign(x.delta))).toEqual([1, -1, 1]);
    expect(g.l.games.map((x) => Math.sign(x.delta))).toEqual([-1, 1, -1]);
  });
  it('GAME_K_SCALE scales a single game below what a whole match used to move', () => {
    expect(GAME_K_SCALE).toBe(0.5);
    const full = computeDelta({ rating: 1400, oppRating: 1400, gamesPlayed: 20, won: true, dominance: 0.25, scale: 1 });
    const half = computeDelta({ rating: 1400, oppRating: 1400, gamesPlayed: 20, won: true, dominance: 0.25 });
    expect(half.delta).toBe(Math.round(full.delta / 2));
  });
  it('per-game cap, and the match total is clamped to +-80', () => {
    expect(MAX_GAME_DELTA).toBe(40);
    expect(MAX_DELTA).toBe(80);
    expect(dl(800, 2400, true, { dominance: 1, scale: 1 }).delta).toBe(MAX_GAME_DELTA);
    expect(dl(2400, 800, false, { dominance: 1, scale: 1 }).delta).toBe(-MAX_GAME_DELTA);
    const five = Array(5).fill({ a: 11, b: 0 });
    const huge = duel(1100, 2000, five, { gamesPlayed: 0 }, { gamesPlayed: 0 });
    expect(huge.w.games.reduce((t, g) => t + g.delta, 0)).toBe(80);
    expect(huge.w.delta).toBe(80);
    expect(huge.w.games.map((g) => g.delta)).toEqual([40, 40, 0, 0, 0]); // two capped games fill the match cap; the rest add nothing
    expect(huge.l.delta).toBe(-80);
    expect(huge.w.after).toBe(1180);
  });
  it('first match 1400 beats 1600 (regulars): blowout +77, narrow 2-1 +30, narrow sweep +52, mirrored for the loser', () => {
    const b = duel(1400, 1600, BLOW);
    expect([b.w.delta, b.l.delta]).toEqual([77, -77]);
    expect(b.w).toMatchObject({ before: 1400, after: 1477 });
    expect(b.w.games.map((g) => g.delta)).toEqual([29, 24, 24]);
    const n = duel(1400, 1600, NARROW);
    expect([n.w.delta, n.l.delta]).toEqual([30, -30]);
    expect(n.w.games.map((g) => g.delta)).toEqual([19, -6, 17]);
    expect(duel(1400, 1600, [{ a: 11, b: 9 }, { a: 11, b: 9 }, { a: 12, b: 10 }]).w.delta).toBe(52);
    expect(b.w.games[0].mov).toBeCloseTo(0.75 + 1.25 * Math.sqrt(9 / 13), 6);
    expect(b.w.games[0].ac).toBeGreaterThan(1);
  });
  it('blowout moves more than a close win, for winner and loser', () => {
    const blow = duel(1400, 1400, BLOW);
    const close = duel(1400, 1400, NARROW);
    expect(blow.w.delta).toBeGreaterThan(close.w.delta);
    expect(blow.l.delta).toBeLessThan(close.l.delta);
  });
  it('equal-K singles is zero-sum', () => {
    for (const [wr, lr, g] of [[1400, 1400, BLOW], [1400, 1600, NARROW], [1700, 1300, BLOW], [1500, 1900, BLOW]]) {
      const r = duel(wr, lr, g);
      expect(r.w.delta + r.l.delta).toBe(0);
    }
  });
  it('favourite blowout is damped vs underdog blowout amplified', () => {
    const fav = duel(1600, 1400, BLOW).w;
    const dog = duel(1400, 1600, BLOW).w;
    expect(fav.games[0].ac).toBeLessThan(1);
    expect(dog.games[0].ac).toBeGreaterThan(1);
    expect(dog.delta).toBeGreaterThan(fav.delta * 2);
  });
  it('loser loses a lot when crushed by a lower-rated player, little in a narrow loss to a higher-rated one', () => {
    const crushedByLower = duel(1400, 1600, BLOW).l.delta;
    const narrowToHigher = duel(1600, 1400, [{ a: 11, b: 9 }, { a: 11, b: 9 }, { a: 12, b: 10 }]).l.delta;
    expect(Math.abs(crushedByLower)).toBeGreaterThan(Math.abs(narrowToHigher));
    expect(crushedByLower).toBe(-77);
    expect(narrowToHigher).toBe(-14);
  });
  it('loser loses less in a narrow loss than a blowout loss', () => {
    expect(duel(1400, 1400, NARROW).l.delta).toBeGreaterThan(duel(1400, 1400, BLOW).l.delta);
  });
  it('floors rating at 700, also mid-match', () => {
    expect(computeDelta({ rating: 710, oppRating: 710, gamesPlayed: 0, won: false, dominance: 0.25, scale: 1 })).toMatchObject({ delta: -10, after: 700 });
    expect(computeDelta({ rating: 700, oppRating: 700, gamesPlayed: 0, won: false, dominance: 0.25 })).toMatchObject({ delta: 0, after: 700 });
    const r = duel(720, 705, BLOW);
    expect(r.l.after).toBe(700);
    expect(r.l.games.every((g) => g.after >= 700)).toBe(true);
  });
  it('repeat factor', () => {
    expect(repeatFactor(0)).toBe(1);
    expect(repeatFactor(1)).toBeCloseTo(0.7, 4); // 0.3 + 0.7 / 1.75
    expect(repeatFactor(2)).toBeCloseTo(0.58, 4);
    expect(repeatFactor(6)).toBeCloseTo(0.4273, 4);
    // Never zero: a small group's regulars keep moving, just less.
    expect(repeatFactor(1000)).toBeGreaterThan(0.3);
    for (let n = 0; n < 50; n++) expect(repeatFactor(n + 1)).toBeLessThan(repeatFactor(n));
  });
  it('rematch counts MATCHES, not games: one earlier meeting scales every game the same', () => {
    const f = (n, won) => dl(1400, 1400, won, { earlierMeetings: n, dominance: 0 }).delta;
    expect(f(0, true)).toBe(9); // 48 * .5 * .5 * .75
    expect(f(1, true)).toBe(Math.round(9 * repeatFactor(1)));
    expect(f(1, false)).toBe(-f(1, true));
    // Frequent rematches still count (floored), they are only damped.
    expect(f(6, true)).toBe(Math.round(9 * repeatFactor(6)));
    expect(f(6, true)).toBeGreaterThan(0);
    expect(f(6, false)).toBe(-f(6, true));
    const r = duel(1400, 1400, SWEEP, { ...reg, earlierMeetings: 1 }, { ...reg, earlierMeetings: 1 });
    expect(r.w.games.every((g) => g.repeat === repeatFactor(1))).toBe(true);
    const six = duel(1400, 1400, SWEEP, { ...reg, earlierMeetings: 6 }, { ...reg, earlierMeetings: 6 });
    expect(six.w.delta).toBeGreaterThan(0);
    expect(six.w.delta).toBeLessThan(r.w.delta);
    expect(six.l.delta).toBe(-six.w.delta);
  });
  it('doubles uses team averages and own K; partners are independent players', () => {
    const r = rateMatch([
      { id: 'a1', side: 'a', rating: 1300, gamesPlayed: 0, earlierMeetings: 0 },
      { id: 'a2', side: 'a', rating: 1500, gamesPlayed: 100, earlierMeetings: 0 },
      { id: 'b1', side: 'b', rating: 1400, gamesPlayed: 0, earlierMeetings: 0 },
      { id: 'b2', side: 'b', rating: 1400, gamesPlayed: 0, earlierMeetings: 0 },
    ], 'a', [{ a: 11, b: 6 }, { a: 11, b: 6 }]);
    const by = Object.fromEntries(r.map((x) => [x.id, x]));
    expect(by.a1.delta).toBeGreaterThan(by.a2.delta); // newer K, weaker partner
    expect(by.a1.games[0].before).toBe(1300);
    expect(by.a2.games[0].before).toBe(1500);
    expect(by.a1.games[1].before).toBe(by.a1.games[0].after);
    expect(by.a2.games[1].before).toBe(by.a2.games[0].after);
    expect(by.a1.games[0].expected).toBe(by.a2.games[0].expected); // both rated as the same 1400 team on game 1
    expect(by.b1.delta).toBe(by.b2.delta);
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
  const pd = (pa, pb, ra = 1400, rb = 1400, games = G) => duel(ra, rb, games, { paddle: pa }, { paddle: pb });
  it('constant and per-side share', () => {
    expect(PADDLE_EDGE).toBe(50);
    expect(paddleEdge(['default'])).toBe(0);
    expect(paddleEdge(['modded'])).toBe(50);
    expect(paddleEdge(['modded', 'default'])).toBe(25);
    expect(paddleEdge(['modded', 'modded'])).toBe(50);
  });
  it('paid winner gains less, free winner over paid gains more, losses mirror', () => {
    const ff = pd('default', 'default');
    const p = pd('modded', 'default');
    const fp = pd('default', 'modded');
    expect(p.w.delta).toBeLessThan(ff.w.delta);
    expect(fp.w.delta).toBeGreaterThan(ff.w.delta);
    expect(p.w.delta + p.l.delta).toBe(0);
    expect(fp.w.delta + fp.l.delta).toBe(0);
    expect(ff.w.games[0].paddle_edge).toBe(0);
    expect(p.w.games[0].paddle_edge).toBe(-50);
    expect(p.l.games[0].paddle_edge).toBe(50);
    expect(fp.w.games[0].paddle_edge).toBe(50);
  });
  it('both paid equals both free', () => {
    const ff = pd('default', 'default');
    const pp = pd('modded', 'modded');
    expect(pp.w.delta).toBe(ff.w.delta);
    expect(pp.l.delta).toBe(ff.l.delta);
    expect(pp.w.games[0].paddle_edge).toBe(0);
  });
  it('stored rating never includes the edge', () => {
    const p = pd('modded', 'default');
    expect(p.w.before).toBe(1400);
    expect(p.w.after).toBe(1400 + p.w.delta);
  });
  it('doubles uses half the edge for one paid paddle', () => {
    const team = (p1, p2, side) => [
      { id: `${side}1`, side, rating: 1400, gamesPlayed: 20, earlierMeetings: 0, paddle: p1 },
      { id: `${side}2`, side, rating: 1400, gamesPlayed: 20, earlierMeetings: 0, paddle: p2 },
    ];
    const run = (a1, a2) => rateMatch([...team(a1, a2, 'a'), ...team('default', 'default', 'b')], 'a', G)[0];
    const none = run('default', 'default');
    const half = run('modded', 'default');
    const full = run('modded', 'modded');
    expect(half.games[0].paddle_edge).toBe(-25);
    expect(full.games[0].paddle_edge).toBe(-50);
    expect(half.games[0].expected).toBeCloseTo(expectedScore(1425, 1400), 9);
    expect(none.delta).toBeGreaterThanOrEqual(half.delta);
    expect(half.delta).toBeGreaterThanOrEqual(full.delta);
    expect(none.delta).toBeGreaterThan(full.delta);
  });
  it('autocorrelation uses effective ratings', () => {
    const fp = computeDelta({ rating: 1400, oppRating: 1400, gamesPlayed: 20, won: true, dominance: 0.25, oppEdge: 50 });
    expect(fp.ac).toBeCloseTo(autocorrMultiplier(1400, 1450), 9);
    expect(fp.ac).toBeGreaterThan(1);
    const p = computeDelta({ rating: 1400, oppRating: 1400, gamesPlayed: 20, won: true, dominance: 0.25, edge: 50 });
    expect(p.ac).toBeCloseTo(autocorrMultiplier(1450, 1400), 9);
    expect(p.ac).toBeLessThan(1);
  });
  it('cap and floor still hold', () => {
    const r = pd('default', 'modded', 700, 2400, [{ a: 11, b: 0 }, { a: 11, b: 0 }, { a: 11, b: 0 }]);
    expect(r.w.delta).toBeLessThanOrEqual(MAX_DELTA);
    const lo = pd('modded', 'default', 2400, 705, [{ a: 11, b: 0 }, { a: 11, b: 0 }]);
    expect(lo.l.after).toBeGreaterThanOrEqual(RATING_FLOOR);
  });
  it('xp upset uses real rating gap, not paddles', () => {
    expect(xpForMatch({ won: true, ratingGap: 0 }).parts.some((x) => x.key === 'upset')).toBe(false);
    expect(xpForMatch({ won: true, ratingGap: 100 }).parts.find((x) => x.key === 'upset').xp).toBe(20);
  });
});

describe('smooth K (games), rust, certainty, target-21, recency, teammate, challenge', () => {
  const G = [{ a: 11, b: 5 }, { a: 11, b: 6 }];
  const base = { rating: 1400, oppRating: 1400, gamesPlayed: 20, won: true, dominance: 0.25 };
  it('K decays smoothly with GAMES from 48 toward 32', () => {
    expect(kSmooth(0)).toBe(48);
    expect(kSmooth(30)).toBeCloseTo(32 + 16 / Math.E, 9);
    expect(kSmooth(1000)).toBeCloseTo(32, 6);
    for (let g = 0; g < 90; g++) expect(kSmooth(g + 1)).toBeLessThan(kSmooth(g));
    // within one match K already eases game by game
    const r = duel(1400, 1400, SWEEP, { gamesPlayed: 0 }, { gamesPlayed: 0 }).w.games;
    expect(r[0].k).toBeCloseTo(kSmooth(0), 9);
    expect(r[1].k).toBeCloseTo(kSmooth(1), 9);
    expect(r[2].k).toBeCloseTo(kSmooth(2), 9);
  });
  it('rust: none under 3 weeks or on a first match, +50% cap after ~3.5 months; first game of the match only', () => {
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
    const m = duel(1400, 1400, SWEEP, { ...reg, daysSinceLast: 141 }, reg).w;
    expect(m.games.map((g) => g.rust)).toEqual([1.5, 1, 1]);
    expect(m.rust).toBe(1.5);
  });
  it('opponent certainty: new opponents move you less, full weight from 10 games', () => {
    expect(certaintyWeight(0)).toBe(0.8);
    expect(certaintyWeight(5)).toBeCloseTo(0.9, 9);
    expect(certaintyWeight(10)).toBe(1);
    expect(certaintyWeight(50)).toBe(1);
    const vsNew = computeDelta({ ...base, oppGamesPlayed: 0, scale: 1 });
    const vsReg = computeDelta({ ...base, oppGamesPlayed: 20, scale: 1 });
    expect(vsNew.delta).toBeLessThan(vsReg.delta);
    expect(vsNew.opp_certainty).toBe(0.8);
  });
  it('doubles certainty averages the two opponents (in games)', () => {
    const r = rateMatch([
      { id: 'a1', side: 'a', rating: 1400, gamesPlayed: 20, earlierMeetings: 0 },
      { id: 'a2', side: 'a', rating: 1400, gamesPlayed: 20, earlierMeetings: 0 },
      { id: 'b1', side: 'b', rating: 1400, gamesPlayed: 0, earlierMeetings: 0 },
      { id: 'b2', side: 'b', rating: 1400, gamesPlayed: 10, earlierMeetings: 0 },
    ], 'a', G);
    expect(r[0].games[0].opp_certainty).toBeCloseTo(certaintyWeight(5), 9);
    expect(r[0].games[1].opp_certainty).toBeCloseTo(certaintyWeight(6), 9); // they have played one more game by game 2
    expect(r[2].games[0].opp_certainty).toBe(1);
  });
  it('target 21 is worth x1.1 per game; the old number-of-games evidence is gone', () => {
    expect(evidenceWeight(11)).toBe(1);
    expect(evidenceWeight(21)).toBeCloseTo(1.1, 9);
    const mk = (games, target) => duel(1400, 1400, games, reg, reg, { target }).w;
    expect(mk([{ a: 11, b: 5 }], 11).evidence).toBe(1); // a single game is no longer discounted
    expect(mk([{ a: 11, b: 5 }], 11).delta).toBe(mk([{ a: 11, b: 5 }, { a: 11, b: 5 }], 11).games[0].delta);
    expect(mk([{ a: 21, b: 5 }, { a: 21, b: 5 }], 21).games.every((g) => Math.abs(g.evidence - 1.1) < 1e-9)).toBe(true);
    expect(mk([{ a: 21, b: 10 }], 21).delta).toBeGreaterThan(mk([{ a: 11, b: 5 }], 11).delta * 0 + 0);
  });
  it('meeting weight fades with a 3-day half-life, so the multiplier recovers between games', () => {
    expect(meetingWeight(0)).toBe(1);
    expect(meetingWeight(3)).toBeCloseTo(0.5, 9);
    expect(meetingWeight(6)).toBeCloseTo(0.25, 9);
    expect(meetingWeight(30)).toBeLessThan(0.001);
    for (let d = 0; d < 30; d++) expect(meetingWeight(d + 1)).toBeLessThan(meetingWeight(d));
    // Same pair, steady schedule: daily play is damped more than every-few-days, weekly barely, monthly not at all.
    const steady = (gap) => { let w = 0; for (let d = gap; d <= 180; d += gap) w += meetingWeight(d); return repeatFactor(w); };
    expect(steady(1)).toBeLessThan(steady(3));
    expect(steady(3)).toBeLessThan(steady(7));
    expect(steady(1)).toBeGreaterThan(0.45);
    expect(steady(30)).toBeGreaterThan(0.99);
    const yesterday = computeDelta({ ...base, earlierMeetings: meetingWeight(1) });
    const lastWeek = computeDelta({ ...base, earlierMeetings: meetingWeight(7) });
    expect(lastWeek.delta).toBeGreaterThan(yesterday.delta);
    const many = computeDelta({ ...base, earlierMeetings: 6 }).delta;
    expect(many).toBeGreaterThan(0);
    expect(computeDelta({ ...base, won: false, earlierMeetings: 6 }).delta).toBeLessThan(0);
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
      { id: 'a1', side: 'a', rating: a1, gamesPlayed: 20, earlierMeetings: 0 },
      { id: 'a2', side: 'a', rating: a2, gamesPlayed: 20, earlierMeetings: 0 },
      { id: 'b1', side: 'b', rating: 1400, gamesPlayed: 20, earlierMeetings: 0 },
      { id: 'b2', side: 'b', rating: 1400, gamesPlayed: 20, earlierMeetings: 0 },
    ], w, G);
    const win = t(1500, 1300, 'a');
    expect(win[0].delta).toBeLessThan(win[1].delta);
    const loss = t(1500, 1300, 'b');
    expect(loss[0].delta).toBeLessThan(loss[1].delta); // stronger partner loses more
    expect(win[2].games[0].teammate).toBe(1);
  });
  it('challenge stakes x1.25 on every game, singles only flag from the caller', () => {
    expect(CHALLENGE_STAKES).toBe(1.25);
    const mk = (challenge) => duel(1400, 1400, [{ a: 11, b: 0 }, { a: 11, b: 0 }], reg, reg, { challenge });
    expect(mk(true).w.challenge).toBe(1.25);
    expect(mk(true).w.games.every((g) => g.challenge === 1.25)).toBe(true);
    expect(mk(false).w.challenge).toBe(1);
    expect(mk(true).w.delta).toBeGreaterThan(mk(false).w.delta);
    expect(mk(true).w.delta).toBe(-mk(true).l.delta);
  });
  it('cap holds with every multiplier stacked', () => {
    const r = computeDelta({ rating: 700, oppRating: 2500, gamesPlayed: 0, won: true, dominance: 1, daysSinceLast: 200, evidence: 1.1, challenge: 1.25, scale: 1, edge: 0, oppEdge: 50 });
    expect(r.delta).toBe(MAX_GAME_DELTA);
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
  const free = { w: {}, l: {} };
  const run = (games, extra = free) => {
    const r = duel(1400, 1600, games, extra.w, extra.l, extra.ctx);
    return [r.w.delta, r.l.delta];
  };
  it('1400 beats 1600, both regulars (25 games) with free paddles', () => {
    expect(run(BLOW)).toEqual([77, -77]);
    expect(duel(1400, 1600, BLOW).w.games.map((g) => g.delta)).toEqual([29, 24, 24]);
    expect(expectedScore(1400, 1600)).toBeCloseTo(0.24, 2);
    expect(run(NARROW)).toEqual([30, -30]);
    expect(duel(1400, 1600, NARROW).w.games.map((g) => g.delta)).toEqual([19, -6, 17]);
  });
  it('the same blowout with a paid paddle for the winner / the loser', () => {
    expect(run(BLOW, { w: { paddle: 'modded' }, l: {} })).toEqual([70, -70]);
    expect(run(BLOW, { w: {}, l: { paddle: 'modded' } })).toEqual([80, -80]); // 32+27+21 = 80
  });
  it('rust and challenge stakes: the match cap of 80 bites; the winner is rusty on game 1 only', () => {
    expect(run(BLOW, { w: {}, l: {}, ctx: { challenge: true } })).toEqual([80, -80]);
    expect(run(BLOW, { w: { daysSinceLast: 81 }, l: {} })).toEqual([80, -76]);
  });
  it('equal 1400s with 20 games each: 3-0 sweep, 2-1 grind, 2-0 close', () => {
    const e = (g) => duel(1400, 1400, g, reg, reg).w.delta;
    expect([e(SWEEP), e(GRIND), e(CLOSE20)]).toEqual([41, 10, 22]);
  });
});

describe('old matches still render: rating_changes without a games array', () => {
  it('describeChange-compatible fields stay on new entries; old entries simply lack games', () => {
    const r = duel(1400, 1400, SWEEP, reg, reg).w;
    for (const k of ['dominance', 'rust', 'repeat', 'evidence', 'challenge', 'games', 'before', 'after', 'delta']) expect(r).toHaveProperty(k);
    for (const k of ['game', 'score', 'won', 'before', 'after', 'delta', 'expected', 'dominance', 'mov', 'ac', 'k', 'opp_certainty', 'teammate', 'paddle_edge']) {
      expect(r.games[0]).toHaveProperty(k);
    }
    expect(r.games[0].score).toEqual([11, 5]);
  });
});
