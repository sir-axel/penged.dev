import { describe, it, expect } from 'vitest';
import * as R from '../src/rating.js';
import {
  xpForMatch, levelForXp, xpForLevel, challengePenalty, dodgeBase, closeness, rankFactor, DODGE_RANK_FACTOR, RATING_FLOOR,
  validateGames, summarizeGames, rankPlayers, repeatFactor, RANK_SQL,
} from '../src/rating.js';

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
    expect(DODGE_RANK_FACTOR).toEqual({ 1: 1.0, 2: 0.8, 3: 0.6, 4: 0.4, 5: 0.4, 6: 0.25 });
    expect([1, 2, 3, 4, 5, 6, 7, 40].map(rankFactor)).toEqual([1, 0.8, 0.6, 0.4, 0.4, 0.25, 0.25, 0.25]);
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
    // same standing (1600): the 200-point gap costs less than an equal challenger
    expect(pen('expired', { defRating: 1600 }).penalty).toBeLessThan(pen('expired', { defRating: 1600, chalRating: 1590 }).penalty);
  });
  it('rank gap 3 pays less than rank gap 1 at the same ratings', () => {
    const g1 = pen('expired', { rankGap: 1 }).penalty;
    const g2 = pen('expired', { rankGap: 2 }).penalty;
    const g3 = pen('expired', { rankGap: 3 }).penalty;
    expect(g1).toBeGreaterThan(g2);
    expect(g2).toBeGreaterThan(g3);
    expect([g1, g2, g3]).toEqual([24, 19, 14]);
  });
  it('far gaps keep decaying: gap 4-5 and 6+ cost less than gap 3', () => {
    expect([3, 4, 5, 6, 12].map((rankGap) => pen('expired', { rankGap }).penalty)).toEqual([14, 10, 10, 6, 6]);
  });
  it('downward: declining or ignoring costs half the upward penalty, never a walkover', () => {
    expect(pen('declined', { direction: 'down' })).toMatchObject({ penalty: 6, reason: 'declined_down', dropsRank: true, walkover: false });
    expect(pen('declined', { direction: 'down', rankGap: 2 }).penalty).toBeLessThan(pen('declined', { rankGap: 2 }).penalty);
    expect(pen('declined', { direction: 'down', rankGap: 6 })).toMatchObject({ reason: 'declined_down', dropsRank: true });
    expect(pen('declined', { direction: 'down', rankGap: 6 }).penalty).toBeGreaterThan(0);
    expect(pen('expired', { direction: 'down' })).toMatchObject({ penalty: 12, reason: 'expired_down', dropsRank: true, walkover: false });
    expect(pen('expired', { direction: 'down', rankGap: 6 }).penalty).toBe(3);
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
    expect(pen('expired', { defRating: 102, chalRating: 102 }).penalty).toBe(2);
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
    expect(validateGames(11, Array(10).fill({ a: 11, b: 0 }))).toBeNull();
    expect(validateGames(11, Array(11).fill({ a: 11, b: 0 }))).toBe('A match is at most 10 games.');
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
  const P = (id, rating, played = 1, created_date = '2026-01-01T00:00:00.000Z') => ({ id, rating, played, created_date });
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
  it('players with no verified match get no rank, whatever their rating', () => {
    const r = rankPlayers([P('a', 1400, 3), P('fresh', 1500, 0), P('b', 1350, 1)]);
    expect(r).toEqual({ a: 1, b: 2 });
    expect(r.fresh).toBeUndefined();
  });
});



describe('active ranking', () => {
  const P = (id, rating, last) => ({ id, rating, played: 3, created_date: '2026-01-01', last_verified_at: last });
  it('inactive players (last verified match older than cutoff) get no rank', () => {
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
    expect(RANK_SQL).toContain('(singles_wins + singles_losses) > 0');
  });
});




describe('close-loss credit', () => {
  const P = (id, side, rating, extra = {}) => ({ id, side, rating, rd: 60, vol: 0.06, daysSinceLast: 3, gamesPlayed: 60, earlierMeetings: 0, novel: false, ...extra });
  const G = (arr) => arr.map(([a, b]) => ({ a, b }));
  const run = (games, extra = {}) => Object.fromEntries(R.rateMatch([P('top', 'a', 1700, extra), P('low', 'b', 1250, extra)], 'a', G(games), {}).map((x) => [x.id, x]));
  it('expected point share comes from real game-to-11 odds (deuce included)', () => {
    expect(R.gameWinFromPoint(0.5)).toBeCloseTo(0.5, 9);
    expect(R.expectedPointShare(0.5)).toBeCloseTo(0.5, 6);
    expect(R.expectedPointShare(R.expectedScore(1250, 1700))).toBeCloseTo(0.351, 3);
    expect(R.expectedPointShare(0.07, 21)).toBeGreaterThan(R.expectedPointShare(0.07, 11)); // longer games: closer to 50%
  });
  it('a close loss to a much stronger player is a gain; the favourite\'s win is worth +0..+3', () => {
    const r = run([[11, 9], [11, 9]]);
    expect(r.low.delta).toBe(15);
    expect(r.low.close_loss).toMatchObject({ credit: 15, gap: 450 });
    expect(r.top.delta).toBe(0); // across a class gap the favourite's win is worth +0 (close) to +3 (blowout)
    const mid = run([[11, 7], [11, 8]]);
    expect([mid.low.delta, mid.top.delta]).toEqual([8, 0]);
    const blow = run([[11, 2], [11, 1]]);
    expect(blow.top.delta).toBe(3);
    expect(blow.low.delta).toBeLessThan(0);
  });
  it('a clear beating is an ordinary loss; peers (gap < 100) get nothing extra', () => {
    const r = run([[11, 5], [11, 6]]);
    expect(r.low.delta).toBeLessThan(0);
    expect(r.low.delta).toBeGreaterThanOrEqual(-R.TIER_DOG_LOSS_MAX); // across a class gap the underdog's loss is small
    expect(r.low.close_loss).toBeUndefined();
    expect(R.TIER_DOG_LOSS_MAX).toBe(6);
    expect(run([[11, 1], [11, 0]]).low.delta).toBe(-4);
    // the reported case: Bronze 1315 crushed 1-11 by Platinum 1570 in a challenge (was −16)
    const rc = R.rateMatch([P('dog', 'a', 1315, { rd: 112, daysSinceLast: 1, matchesPlayed: 8 }), P('fav', 'b', 1570, { rd: 112, daysSinceLast: 1, matchesPlayed: 8 })], 'b', G([[1, 11]]), { target: 11, challenge: true });
    expect(rc.map((x) => x.delta)).toEqual([-6, 3]);
    const peers = Object.fromEntries(R.rateMatch([P('a', 'a', 1400), P('b', 'b', 1350)], 'a', G([[11, 9], [11, 9]]), {}).map((x) => [x.id, x]));
    expect(peers.b.close_loss).toBeUndefined();
    expect(peers.b.delta).toBeLessThan(0);
  });
  it('rematches earn less of it', () => {
    expect(run([[11, 9], [11, 9]], { earlierMeetings: 2 }).low.delta).toBeLessThan(15);
  });
  it('took a shot: XP for losing to someone 100+ above', () => {
    expect(R.xpForMatch({ won: false, ratingGap: 150 }).parts.map((p) => p.key)).toContain('shot');
    expect(R.xpForMatch({ won: false, ratingGap: 50 }).parts.map((p) => p.key)).not.toContain('shot');
  });
});

describe('ducking costs more the higher you stand', () => {
  it('x1 up to 1400, x2 from 1800', () => {
    expect([1200, 1400, 1600, 1800, 2100].map(R.duckStanding)).toEqual([1, 1, 1.5, 2, 2]);
    const pen = (defRating) => R.challengePenalty({ kind: 'expired', defRating, defRd: 60, chalRating: defRating - 100, rankGap: 1 }).penalty;
    expect(pen(1700)).toBeGreaterThan(pen(1400));
    expect(pen(1800)).toBeGreaterThanOrEqual(Math.round(2 * pen(1400)) - 1);
  });
});

describe('close-loss credit needs a class gap (Platinum vs Bronze); a win always gains', () => {
  const P = (id, side, rating) => ({ id, side, rating, rd: 60, vol: 0.06, daysSinceLast: 3, gamesPlayed: 60, earlierMeetings: 0, novel: false });
  const G = (arr) => arr.map(([a, b]) => ({ a, b }));
  const run = (games, top, low) => Object.fromEntries(R.rateMatch([P('top', 'a', top), P('low', 'b', low)], 'a', G(games), {}).map((x) => [x.id, x]));
  it('Platinum (1559) vs Silver (1397), the Franklin vs jucey 11-9: no credit, the winner gains', () => {
    const r = run([[11, 9]], 1559, 1397);
    expect(r.top.close_loss).toBeUndefined();
    expect(r.top.delta).toBeGreaterThan(0);
    expect(r.low.delta).toBeLessThan(0);
  });
  it('Platinum vs Bronze: the credit applies to the underdog, the favourite wins +0..+3', () => {
    const r = run([[11, 9], [11, 9]], 1580, 1300);
    expect(r.low.close_loss).toBeDefined();
    expect(r.top.delta).toBe(0);
    expect(run([[11, 2], [11, 1]], 1580, 1300).top.delta).toBe(3);
  });
  it('Bronze beating Platinum is a big upset: both changes x1.5', () => {
    const r = Object.fromEntries(R.rateMatch([P('top', 'a', 1580), P('low', 'b', 1300)], 'b', G([[9, 11], [9, 11]]), { tierShield: false }).map((x) => [x.id, x]));
    expect(r.low.class_gap).toMatchObject({ upset_mult: 1.5 });
    expect(r.low.delta).toBe(Math.round(r.low.class_gap.raw * 1.5));
    expect(r.top.delta).toBe(-Math.round(-r.top.class_gap.raw * 1.5));
  });
  it('a 3-2 win with two close losses still gains at least +3', () => {
    const r = run([[10, 12], [11, 5], [9, 11], [11, 6], [11, 5]], 1557, 1399);
    expect(r.top.delta).toBe(R.MATCH_WIN_MIN);
    expect(r.top.win_floor).toBe(R.MATCH_WIN_MIN);
  });
});

describe('derank protection', () => {
  it('a loss lands you on your tier floor; only a loss from the floor drops you, and never more than one tier', () => {
    expect(R.tierShield(1580, 1520)).toBe(1550); // Platinum 1580 -> Platinum 0
    expect(R.tierShield(1550, 1494)).toBe(1494); // from the floor: into Gold
    expect(R.tierShield(1550, 1300)).toBe(1450); // never two tiers in one match
    expect(R.tierShield(1580, 1560)).toBe(1560); // stays in the tier: untouched
    expect(R.tierShield(1580, 1520, false)).toBe(1520); // still placing: no protection
    const P = (id, side, rating) => ({ id, side, rating, rd: 60, vol: 0.06, daysSinceLast: 3, gamesPlayed: 60, matchesPlayed: 30, earlierMeetings: 0, novel: false });
    const r = R.rateMatch([P('plat', 'a', 1580), P('dog', 'b', 1280)], 'b', [{ a: 5, b: 11 }, { a: 4, b: 11 }], {});
    expect(r[0].after).toBe(1550);
    expect(r[0].tier_shield).toMatchObject({ tier: 'platinum' });
  });
});
