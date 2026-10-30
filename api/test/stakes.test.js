// "What's on the line" range preview, novelty and New rival XP: pure functions and the matchStakes endpoint end to end.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, get, mkPlayer, seasoned } from './helpers.js';
import {
  stakes, stakesGames, rateMatch, xpForMatch, NOVELTY_BONUS, NOVELTY_DAYS, XP_NEW_RIVAL, RATING_FLOOR, MAX_DELTA,
  STAKES_NARROW, STAKES_DOMINANT, CHALLENGE_STAKES, meetingWeight,
} from '../src/rating.js';
import { tierChange } from '../src/tiers.js';

beforeEach(reset);
afterAll(() => dispose());
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const ent = async (u) => (await get('/api/entities/Player/' + u.player.id)).body;
const ids = (...ps) => ps.map((p) => ({ player_id: p.player.id }));
const pl = (id, o = {}) => ({ id, rating: 1400, rd: 60, vol: 0.06, daysSinceLast: 3, matchesPlayed: 15, earlierMeetings: 0, ...o });

describe('stakes range (pure)', () => {
  it('narrow 2-1 (11-9, 9-11, 11-9) to dominant 2-0 (11-4, 11-5); 21: 21-19.. / 21-8, 21-10; mirrored for the loss', () => {
    expect(stakesGames(11, 'a')).toEqual([{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 11, b: 9 }]);
    expect(stakesGames(11, 'a', 'dominant')).toEqual([{ a: 11, b: 4 }, { a: 11, b: 5 }]);
    expect(stakesGames(11, 'b', 'dominant')).toEqual([{ a: 4, b: 11 }, { a: 5, b: 11 }]);
    expect(stakesGames(21, 'a', 'dominant')).toEqual([{ a: 21, b: 8 }, { a: 21, b: 10 }]);
    expect(STAKES_NARROW[21][0]).toEqual([21, 19]);
    expect(STAKES_DOMINANT[11]).toEqual([[11, 4], [11, 5]]);
  });
  it('the range equals the actual rateMatch deltas for those scores, both ways, for every player', () => {
    const a = pl('a', { rating: 1450, rd: 110, daysSinceLast: 50, novel: true });
    const b = pl('b', { rating: 1380, earlierMeetings: 1.3 });
    const s = stakes({ format: 'singles', target: 21, sides: { a: [a], b: [b] }, paddles: { b: 'modded' } });
    const parts = [{ ...a, side: 'a', paddle: 'default' }, { ...b, side: 'b', paddle: 'modded' }];
    const run = (w, kind) => rateMatch(parts, w, stakesGames(21, w, kind), { target: 21 });
    const [aN, aD, bN, bD] = [run('a', 'narrow'), run('a', 'dominant'), run('b', 'narrow'), run('b', 'dominant')];
    expect(s[0].narrow).toEqual({ win: aN[0].delta, lose: bN[0].delta });
    expect(s[0].dominant).toEqual({ win: aD[0].delta, lose: bD[0].delta });
    expect(s[1].narrow).toEqual({ win: bN[1].delta, lose: aN[1].delta });
    expect(s[1].dominant).toEqual({ win: bD[1].delta, lose: aD[1].delta });
    expect(s[0].win).toEqual([Math.min(aN[0].delta, aD[0].delta), Math.max(aN[0].delta, aD[0].delta)]);
    expect(s[0].lose).toEqual([Math.max(bN[0].delta, bD[0].delta), Math.min(bN[0].delta, bD[0].delta)]);
    expect(s[0].win[0]).toBeLessThan(s[0].win[1]); // a dominant win is worth more than a narrow one
    const eq = stakes({ format: 'singles', target: 11, sides: { a: [pl('x')], b: [pl('y')] } });
    expect(eq[0].win).toEqual([-eq[1].lose[0], -eq[1].lose[1]]); // equal regulars: losses mirror gains
  });
  it('doubles: each player gets their own range (own RD, partner split)', () => {
    const s = stakes({ format: 'doubles', target: 11, sides: { a: [pl('a1', { rating: 1500 }), pl('a2', { rating: 1300 })], b: [pl('b1'), pl('b2')] } });
    expect(s).toHaveLength(4);
    expect(s[0].win[1]).toBeLessThan(s[1].win[1]);
    expect(s[0].lose[1]).toBeLessThan(s[1].lose[1]);
    expect(() => stakes({ format: 'doubles', target: 11, sides: { a: [pl('a')], b: [pl('b')] } })).toThrow();
  });
  it('a challenge raises the range, in singles and doubles', () => {
    const base = stakes({ format: 'singles', target: 11, sides: { a: [pl('a')], b: [pl('b')] } })[0];
    const ch = stakes({ format: 'singles', target: 11, sides: { a: [pl('a')], b: [pl('b')] }, challenge: true })[0];
    expect(ch.win[1]).toBeGreaterThan(base.win[1]);
    expect(ch.win[1] / base.win[1]).toBeCloseTo(CHALLENGE_STAKES, 0);
    const d = (challenge) => stakes({ format: 'doubles', target: 11, sides: { a: [pl('a'), pl('c')], b: [pl('b'), pl('d')] }, challenge })[0].win;
    expect(d(true)[1]).toBeGreaterThan(d(false)[1]);
  });
  it('tier crossings (best win / worst loss) only for placed players', () => {
    const s = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 1440 })], b: [pl('b', { rating: 1460 })] } }, tierChange);
    expect(s[0].tier_win).toEqual({ tier_before: 'silver', tier_after: 'gold' });
    expect(s[0].tier_lose).toBeNull();
    expect(s[1].tier_lose).toBeNull(); // derank protection: 1460 Gold can only fall to the Gold floor (1450)
    const onFloor = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 1440 })], b: [pl('b', { rating: 1450 })] } }, tierChange);
    expect(onFloor[1].tier_lose).toEqual({ tier_before: 'gold', tier_after: 'silver' });
    const placing = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 1440, matchesPlayed: 2 })], b: [pl('b', { rating: 1460 })] } }, tierChange);
    expect(placing[0]).toMatchObject({ placing: true, tier_win: null });
  });
  it('floor and caps hold; repeats never preview zero', () => {
    const low = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 105, rd: 200, daysSinceLast: null })], b: [pl('b', { rating: 105 })] } })[0];
    expect(low.lose_after).toBe(RATING_FLOOR);
    expect(low.lose[1]).toBe(RATING_FLOOR - 105);
    const huge = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 900, rd: 200, daysSinceLast: null })], b: [pl('b', { rating: 2200 })] } })[0];
    expect(huge.win[1]).toBeLessThanOrEqual(MAX_DELTA);
    let daily = 0;
    for (let d = 1; d <= 30; d++) daily += meetingWeight(d);
    const rep = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { earlierMeetings: daily + 1 })], b: [pl('b', { earlierMeetings: daily + 1 })] } })[0];
    expect(rep.win[0]).toBeGreaterThan(0);
    expect(rep.lose[0]).toBeLessThan(0);
  });
});

describe('novelty and New rival (pure)', () => {
  it('novelty multiplies every game for a fresh opponent; constants', () => {
    expect(NOVELTY_BONUS).toBe(1.1);
    expect(NOVELTY_DAYS).toBe(30);
    const r = (novel) => rateMatch([
      { id: 'a', side: 'a', rating: 1400, gamesPlayed: 40, earlierMeetings: 0, novel },
      { id: 'b', side: 'b', rating: 1400, gamesPlayed: 40, earlierMeetings: 0, novel },
    ], 'a', [{ a: 11, b: 3 }, { a: 11, b: 4 }, { a: 11, b: 2 }], { target: 11 }); // big enough that x1.1 survives rounding
    const fresh = r(true), old = r(false);
    expect(fresh[0].games.every((g) => g.novelty === 1.1)).toBe(true);
    expect(fresh[0].novelty).toBe(1.1);
    expect(old[0].novelty).toBe(1);
    expect(fresh[0].delta).toBeGreaterThan(old[0].delta);
    expect(fresh[0].delta).toBe(-fresh[1].delta);
  });
  it('New rival: +10 xp', () => {
    expect(XP_NEW_RIVAL).toBe(10);
    const x = xpForMatch({ won: false, newRival: true });
    expect(x.parts).toContainEqual({ key: 'new_rival', label: 'new rival', xp: 10 });
    expect(xpForMatch({ won: false }).parts.some((p) => p.key === 'new_rival')).toBe(false);
  });
});

async function verified(format, win, lose, games, target = 11) {
  const s = await call(win[0], 'submitMatch', { format, target, side_a: ids(...win), side_b: ids(...lose), games });
  expect(s.status).toBe(200);
  let m;
  for (const u of [...win.slice(1), ...lose]) m = (await call(u, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
  return m;
}

describe('matchStakes endpoint', () => {
  it('Record a match: each end of the range equals what verification then actually does', async () => {
    const [a, b] = [await mkPlayer('Aa1'), await mkPlayer('Bb2')];
    await verified('singles', [b], [a], [{ a: 11, b: 3 }]);
    await sql('UPDATE players SET singles_rating = 1452, singles_wins = 6, singles_rd = 60 WHERE id = ?', b.player.id);
    await sql('UPDATE players SET singles_rd = 70 WHERE id = ?', a.player.id);
    const body = { format: 'singles', target: 11, side_a: [{ player_id: a.player.id, paddle: 'modded' }], side_b: [{ player_id: b.player.id }] };
    for (const kind of ['narrow', 'dominant']) {
      const pre = await call(a, 'matchStakes', body);
      expect(pre.status).toBe(200);
      expect(pre.body).toMatchObject({ format: 'singles', target: 11, challenge: false });
      const mine = pre.body.players.find((x) => x.you);
      const theirs = pre.body.players.find((x) => !x.you);
      expect(mine).toMatchObject({ player_id: a.player.id, name: 'Aa1', side: 'a' });
      const s = await call(a, 'submitMatch', { ...body, games: stakesGames(11, 'a', kind) });
      const m = (await call(b, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
      const rc = (id) => m.rating_changes.find((x) => x.player_id === id).delta;
      expect(rc(a.player.id)).toBe(mine[kind].win);
      expect(rc(b.player.id)).toBe(theirs[kind].lose);
    }
  });
  it('pending match preview (match_id) for To confirm, with the exact "if confirmed"; only its players', async () => {
    const [a, b, c] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3')];
    const s = await call(a, 'submitMatch', { format: 'singles', target: 11, side_a: ids(a), side_b: ids(b), games: [{ a: 11, b: 5 }] });
    const r = await call(b, 'matchStakes', { match_id: s.body.match.id });
    expect(r.status).toBe(200);
    const mineB = r.body.players.find((x) => x.you);
    expect(mineB.player_id).toBe(b.player.id);
    expect(mineB.win[1]).toBeGreaterThan(0);
    const m = (await call(b, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
    expect(m.status).toBe('verified');
    expect(mineB.result).toBe(m.rating_changes.find((x) => x.player_id === b.player.id).delta);
    expect(mineB.result_after).toBe(m.rating_changes.find((x) => x.player_id === b.player.id).after);
    expect((await call(c, 'matchStakes', { match_id: s.body.match.id })).status).toBe(403);
    expect((await call(c, 'matchStakes', { match_id: 'nope' })).status).toBe(404);
  });
  it('doubles preview reads doubles state only; validation errors', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    const body = { format: 'doubles', target: 11, side_a: ids(a, b), side_b: ids(c, d) };
    const before = (await call(a, 'matchStakes', body)).body.players;
    await sql('UPDATE players SET singles_rating = 2000, singles_game_wins = 300, singles_rd = 50 WHERE id = ?', a.player.id); // singles must not leak
    const after = (await call(a, 'matchStakes', body)).body.players;
    expect(after).toEqual(before);
    expect(before.every((x) => x.rating === 1400)).toBe(true);
    expect((await call(a, 'matchStakes', { ...body, side_a: ids(a) })).status).toBe(400);
    expect((await call(a, 'matchStakes', { ...body, side_a: ids(c, d), side_b: ids(a, b) })).status).toBe(400);
    expect((await call(a, 'matchStakes', { ...body, side_b: ids(a, d) })).status).toBe(400);
    expect((await call(a, 'matchStakes', { ...body, target: 15 })).status).toBe(400);
    expect((await call(null, 'matchStakes', body)).status).toBe(401);
  });
  it('challenge preview: singles, challenge stakes, only the two players', async () => {
    const [a, b, c] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3')];
    await seasoned(a, b, c);
    await sql('UPDATE players SET singles_rd = 60');
    const ch = (await call(c, 'createChallenge', { defender_player_id: a.player.id })).body.challenge;
    const r = await call(a, 'matchStakes', { challenge_id: ch.id });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ format: 'singles', challenge: true });
    const plain = (await call(a, 'matchStakes', { format: 'singles', target: 11, side_a: ids(a), side_b: ids(c) })).body.players.find((x) => x.you);
    expect(r.body.players.find((x) => x.you).win[1]).toBeGreaterThan(plain.win[1]);
    expect((await call(c, 'matchStakes', { challenge_id: ch.id })).status).toBe(200);
    expect((await call(b, 'matchStakes', { challenge_id: ch.id })).status).toBe(403);
  });
});

describe('New rival through verification', () => {
  it('first meeting earns New rival and novelty; a rematch within 30 days does not; after 30+ days it does again', async () => {
    const [a, b] = [await mkPlayer('Aa1'), await mkPlayer('Bb2')];
    const g = [{ a: 11, b: 6 }];
    const m1 = await verified('singles', [a], [b], g);
    const e1 = m1.rating_changes.find((x) => x.player_id === a.player.id);
    expect(e1.xp_parts.some((p) => p.key === 'new_rival')).toBe(true);
    expect(e1.games[0].novelty).toBeCloseTo(1.1, 9);
    const m2 = await verified('singles', [a], [b], g);
    const e2 = m2.rating_changes.find((x) => x.player_id === a.player.id);
    expect(e2.xp_parts.some((p) => p.key === 'new_rival')).toBe(false);
    expect(e2.novelty).toBe(1);
    // age both earlier meetings past NOVELTY_DAYS
    await sql(`UPDATE matches SET verified_at = ? WHERE status = 'verified'`, new Date(Date.now() - 31 * 86400e3).toISOString());
    const m3 = await verified('singles', [b], [a], g);
    expect(m3.rating_changes.every((x) => x.xp_parts.some((p) => p.key === 'new_rival'))).toBe(true);
    // per format: a doubles match with the same people is a first meeting in doubles
    const [c, d] = [await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await verified('singles', [c], [d], g);
    const md = await verified('doubles', [c, a], [d, b], g);
    expect(md.rating_changes.every((x) => x.xp_parts.some((p) => p.key === 'new_rival'))).toBe(true);
    expect((await ent(a)).xp).toBeGreaterThan(0);
  });
});


describe('preview as a challenge', () => {
  it('as_challenge: true previews the x1.25 a challenge is worth', async () => {
    const { mkPlayer: mk, call: c } = await import('./helpers.js');
    const [a, b] = [await mk('Aa1'), await mk('Bb2')];
    const body = { format: 'singles', target: 11, side_a: [{ player_id: a.player.id }], side_b: [{ player_id: b.player.id }] };
    const plain = (await c(a, 'matchStakes', body)).body;
    const ch = (await c(a, 'matchStakes', { ...body, as_challenge: true })).body;
    expect(plain.challenge).toBe(false);
    expect(ch.challenge).toBe(true);
    expect(ch.players.find((p) => p.you).win[1]).toBeGreaterThanOrEqual(plain.players.find((p) => p.you).win[1]);
  });
});
