import { describe, it, expect } from 'vitest';
import {
  expectedScore, kFactor, repeatFactor, computeDelta, rateMatch, xpForMatch, levelForXp, xpForLevel,
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
  it('first match 1400 beats 1600 => +36 / -36', () => {
    const w = computeDelta({ rating: 1400, oppRating: 1600, matchesPlayed: 0, won: true });
    const l = computeDelta({ rating: 1600, oppRating: 1400, matchesPlayed: 0, won: false });
    expect(w).toEqual({ delta: 36, after: 1436 });
    expect(l).toEqual({ delta: -36, after: 1564 });
  });
  it('clamps to +-45', () => {
    expect(computeDelta({ rating: 800, oppRating: 2400, matchesPlayed: 0, won: true }).delta).toBe(45);
    expect(computeDelta({ rating: 2400, oppRating: 800, matchesPlayed: 0, won: false }).delta).toBe(-45);
  });
  it('floors rating at 700', () => {
    expect(computeDelta({ rating: 710, oppRating: 710, matchesPlayed: 0, won: false })).toEqual({ delta: -10, after: 700 });
    expect(computeDelta({ rating: 700, oppRating: 700, matchesPlayed: 0, won: false })).toEqual({ delta: 0, after: 700 });
  });
  it('repeat factor', () => {
    expect(repeatFactor(0)).toBe(1);
    expect(repeatFactor(1)).toBeCloseTo(0.5714, 4);
    expect(repeatFactor(2)).toBeCloseTo(0.4, 4);
  });
  it('repeat meetings reduce gain; six+ pays zero to winners, not losers', () => {
    const base = computeDelta({ rating: 1400, oppRating: 1400, matchesPlayed: 0, won: true }).delta;
    const rep = computeDelta({ rating: 1400, oppRating: 1400, matchesPlayed: 0, won: true, earlierMeetings: 1 }).delta;
    expect(base).toBe(24);
    expect(rep).toBe(14);
    expect(computeDelta({ rating: 1400, oppRating: 1400, matchesPlayed: 0, won: true, earlierMeetings: 6 }).delta).toBe(0);
    expect(computeDelta({ rating: 1400, oppRating: 1400, matchesPlayed: 0, won: false, earlierMeetings: 6 }).delta).toBe(-4);
  });
  it('six-meetings boundary: the 7th match (6 earlier) pays a win nothing; 5 earlier still pays', () => {
    const w = (n) => computeDelta({ rating: 1400, oppRating: 1400, matchesPlayed: 0, won: true, earlierMeetings: n }).delta;
    expect(w(5)).toBe(Math.round(24 / (1 + 0.75 * 5))); // 5
    expect(w(5)).toBeGreaterThan(0);
    expect(w(6)).toBe(0);
    expect(w(9)).toBe(0);
  });
  it('doubles uses team averages, own K and floor', () => {
    const r = rateMatch([
      { id: 'a1', side: 'a', rating: 1300, matchesPlayed: 0, earlierMeetings: 0 },
      { id: 'a2', side: 'a', rating: 1500, matchesPlayed: 40, earlierMeetings: 0 },
      { id: 'b1', side: 'b', rating: 1400, matchesPlayed: 0, earlierMeetings: 0 },
      { id: 'b2', side: 'b', rating: 1400, matchesPlayed: 0, earlierMeetings: 0 },
    ], 'a');
    // teams are equal on average (1400 v 1400): K48 => +24, K24 => +12
    expect(Object.fromEntries(r.map((x) => [x.id, x.delta]))).toEqual({ a1: 24, a2: 12, b1: -24, b2: -24 });
    expect(r.find((x) => x.id === 'a1').after).toBe(1324);
  });
});

describe('xp', () => {
  it('formula', () => {
    expect(xpForMatch({ won: false, gamesWon: 1 })).toBe(30);
    expect(xpForMatch({ won: true, gamesWon: 2 })).toBe(60);
    expect(xpForMatch({ won: true, gamesWon: 9 })).toBe(75);
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
