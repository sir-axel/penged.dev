import { describe, it, expect } from 'vitest';
import {
  expectedScore, kFactor, repeatFactor, computeDelta, rateMatch, xpForMatch, levelForXp, xpForLevel,
  challengePenalty, dodgeBase, closeness, rankFactor, DODGE_RANK_FACTOR, RATING_FLOOR,
  dominance, movMultiplier, autocorrMultiplier, MAX_DELTA, MOV_BASE, MOV_SCALE,
  validateGames, summarizeGames, applyLadderSwap,
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
      { id: 'w', side: 'a', rating: wr, matchesPlayed: 0, earlierMeetings: 0, ...extra },
      { id: 'l', side: 'b', rating: lr, matchesPlayed: 0, earlierMeetings: 0, ...extra },
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
  it('first match 1400 beats 1600: blowout +72 / narrow +39, mirrored for the loser', () => {
    const b = single(1400, 1600, BLOW);
    expect([b.w.delta, b.l.delta]).toEqual([72, -72]);
    const n = single(1400, 1600, NARROW);
    expect([n.w.delta, n.l.delta]).toEqual([39, -39]);
    expect(b.w).toMatchObject({ before: 1400, after: 1472 });
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
    expect(crushedByLower).toBe(-72);
    expect(narrowToHigher).toBe(-10);
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
    // teams equal on average (1400 v 1400), no margin info => mov .75: K48 => +18, K24 => +9
    expect(Object.fromEntries(r.map((x) => [x.id, x.delta]))).toEqual({ a1: 18, a2: 9, b1: -18, b2: -18 });
    expect(r.find((x) => x.id === 'a1').after).toBe(1318);
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

describe('applyLadderSwap', () => {
  const ranks = { a: 1, b: 2, c: 3, d: 4, e: 5 };
  it('lower-ranked winner takes the spot and others shift down', () => {
    expect(applyLadderSwap(ranks, 'd', 'b')).toEqual({ a: 1, b: 3, c: 4, d: 2, e: 5 });
    expect(applyLadderSwap(ranks, 'c', 'b')).toEqual({ a: 1, b: 3, c: 2, d: 4, e: 5 });
  });
  it('no movement when the higher-ranked player wins', () => {
    expect(applyLadderSwap(ranks, 'a', 'e')).toEqual(ranks);
  });
  it('does not mutate and ignores unknown ids', () => {
    const before = { ...ranks };
    applyLadderSwap(ranks, 'e', 'a');
    expect(ranks).toEqual(before);
    expect(applyLadderSwap(ranks, 'zz', 'a')).toEqual(ranks);
  });
});
