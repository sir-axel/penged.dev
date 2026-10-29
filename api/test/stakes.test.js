// "What's on the line" preview, novelty and New rival XP: pure functions and the matchStakes endpoint end to end.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, get, mkPlayer } from './helpers.js';
import {
  stakes, stakesGames, rateMatch, xpForMatch, NOVELTY_BONUS, NOVELTY_DAYS, XP_NEW_RIVAL, RATING_FLOOR, MAX_DELTA, STAKES_GAMES,
  CHALLENGE_STAKES, meetingWeight,
} from '../src/rating.js';
import { tierChange } from '../src/tiers.js';

beforeEach(reset);
afterAll(() => dispose());
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const ent = async (u) => (await get('/api/entities/Player/' + u.player.id)).body;
const ids = (...ps) => ps.map((p) => ({ player_id: p.player.id }));
const pl = (id, o = {}) => ({ id, rating: 1400, gamesPlayed: 40, matchesPlayed: 15, earlierMeetings: 0, ...o });

describe('stakes (pure)', () => {
  it('assumes a typical 2-1 win with 11-7, 7-11, 11-7 (21: 21-15, 15-21, 21-15), mirrored for the loss', () => {
    expect(stakesGames(11, 'a')).toEqual([{ a: 11, b: 7 }, { a: 7, b: 11 }, { a: 11, b: 7 }]);
    expect(stakesGames(11, 'b')).toEqual([{ a: 7, b: 11 }, { a: 11, b: 7 }, { a: 7, b: 11 }]);
    expect(stakesGames(21, 'a')[0]).toEqual({ a: 21, b: 15 });
    expect(Object.keys(STAKES_GAMES)).toEqual(['11', '21']);
  });
  it('preview equals the actual rateMatch delta for the assumed scores, both ways, for every player', () => {
    const a = pl('a', { rating: 1450, gamesPlayed: 12, daysSinceLast: 50, novel: true });
    const b = pl('b', { rating: 1380, earlierMeetings: 1.3 });
    const s = stakes({ format: 'singles', target: 21, sides: { a: [a], b: [b] }, paddles: { b: 'modded' } });
    const parts = [{ ...a, side: 'a', paddle: 'default' }, { ...b, side: 'b', paddle: 'modded' }];
    const winA = rateMatch(parts, 'a', stakesGames(21, 'a'), { target: 21 });
    const winB = rateMatch(parts, 'b', stakesGames(21, 'b'), { target: 21 });
    expect(s.map((x) => [x.win, x.lose])).toEqual([[winA[0].delta, winB[0].delta], [winB[1].delta, winA[1].delta]]);
    expect(s[0].win_after).toBe(winA[0].after);
    expect(s[1].lose_after).toBe(winA[1].after);
    // singles between two players in the same state: what one gains the other drops
    const eq = stakes({ format: 'singles', target: 11, sides: { a: [pl('x')], b: [pl('y')] } });
    expect(eq[0].win).toBe(-eq[1].lose);
  });
  it('doubles: each player gets their own numbers (partner split), from doubles inputs only', () => {
    const s = stakes({
      format: 'doubles', target: 11,
      sides: { a: [pl('a1', { rating: 1500 }), pl('a2', { rating: 1300 })], b: [pl('b1'), pl('b2')] },
    });
    expect(s).toHaveLength(4);
    const [a1, a2] = s;
    expect(a1.win).toBeLessThan(a2.win); // the stronger partner gains less
    expect(a1.lose).toBeLessThan(a2.lose); // and loses more
    expect(() => stakes({ format: 'doubles', target: 11, sides: { a: [pl('a')], b: [pl('b')] } })).toThrow();
  });
  it('a challenge raises both numbers by the challenge stakes', () => {
    const base = stakes({ format: 'singles', target: 11, sides: { a: [pl('a')], b: [pl('b')] } })[0];
    const ch = stakes({ format: 'singles', target: 11, sides: { a: [pl('a')], b: [pl('b')] }, challenge: true })[0];
    expect(ch.win).toBeGreaterThan(base.win);
    expect(ch.win / base.win).toBeCloseTo(CHALLENGE_STAKES, 0);
    // challenges are singles only
    const d = (challenge) => stakes({ format: 'doubles', target: 11, sides: { a: [pl('a'), pl('c')], b: [pl('b'), pl('d')] }, challenge })[0].win;
    expect(d(true)).toBe(d(false));
  });
  it('tier crossings only for placed players', () => {
    const s = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 1445 })], b: [pl('b', { rating: 1452 })] } }, tierChange);
    expect(s[0].tier_win).toEqual({ tier_before: 'silver', tier_after: 'gold' });
    expect(s[0].tier_lose).toBeNull();
    expect(s[1].tier_lose).toEqual({ tier_before: 'gold', tier_after: 'silver' });
    const placing = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 1445, matchesPlayed: 2 })], b: [pl('b', { rating: 1452 })] } }, tierChange);
    expect(placing[0]).toMatchObject({ placing: true, tier_win: null });
    expect(stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 1445 })], b: [pl('b')] } })[0].tier_win).toBeNull(); // no tierChange passed
  });
  it('floor and caps hold in the preview; repeats never preview zero', () => {
    const low = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 705, gamesPlayed: 0 })], b: [pl('b', { rating: 705 })] } })[0];
    expect(low.lose_after).toBe(RATING_FLOOR);
    expect(low.lose).toBe(RATING_FLOOR - 705);
    const huge = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { rating: 900, gamesPlayed: 0, daysSinceLast: 200 })], b: [pl('b', { rating: 2200 })] } })[0];
    expect(huge.win).toBeLessThanOrEqual(MAX_DELTA);
    let daily = 0;
    for (let d = 1; d <= 30; d++) daily += meetingWeight(d);
    const rep = stakes({ format: 'singles', target: 11, sides: { a: [pl('a', { earlierMeetings: daily + 1 })], b: [pl('b', { earlierMeetings: daily + 1 })] } })[0];
    expect(rep.win).toBeGreaterThan(0);
    expect(rep.lose).toBeLessThan(0);
  });
});

describe('novelty and New rival (pure)', () => {
  it('novelty multiplies every game for a fresh opponent; constants', () => {
    expect(NOVELTY_BONUS).toBe(1.1);
    expect(NOVELTY_DAYS).toBe(30);
    const r = (novel) => rateMatch([
      { id: 'a', side: 'a', rating: 1400, gamesPlayed: 40, earlierMeetings: 0, novel },
      { id: 'b', side: 'b', rating: 1400, gamesPlayed: 40, earlierMeetings: 0, novel },
    ], 'a', [{ a: 11, b: 7 }, { a: 7, b: 11 }, { a: 11, b: 7 }], { target: 11 });
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
  it('Record a match: the preview equals what verification then actually does (singles, typical 2-1)', async () => {
    const [a, b] = [await mkPlayer('Aa1'), await mkPlayer('Bb2')];
    await verified('singles', [b], [a], [{ a: 11, b: 3 }]); // some history: a and b met, ratings and games differ
    await sql('UPDATE players SET singles_rating = 1452, singles_wins = 6 WHERE id = ?', b.player.id);
    const body = { format: 'singles', target: 11, side_a: [{ player_id: a.player.id, paddle: 'modded' }], side_b: [{ player_id: b.player.id }] };
    const pre = await call(a, 'matchStakes', body);
    expect(pre.status).toBe(200);
    expect(pre.body).toMatchObject({ format: 'singles', target: 11, challenge: false });
    const mine = pre.body.players.find((x) => x.you);
    const theirs = pre.body.players.find((x) => !x.you);
    expect(mine).toMatchObject({ player_id: a.player.id, name: 'Aa1', side: 'a' });
    expect(theirs.tier_lose).toEqual({ tier_before: 'gold', tier_after: 'silver' }); // b is placed (6+1 matches)
    // play exactly the assumed scores: a wins 2-1
    const s = await call(a, 'submitMatch', { ...body, games: stakesGames(11, 'a') });
    const m = (await call(b, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
    const rc = (id) => m.rating_changes.find((x) => x.player_id === id).delta;
    expect(rc(a.player.id)).toBe(mine.win);
    expect(rc(b.player.id)).toBe(theirs.lose);
  });
  it('pending match preview (match_id) for To confirm; only its players', async () => {
    const [a, b, c] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3')];
    const s = await call(a, 'submitMatch', { format: 'singles', target: 11, side_a: ids(a), side_b: ids(b), games: [{ a: 11, b: 5 }] });
    const r = await call(b, 'matchStakes', { match_id: s.body.match.id });
    expect(r.status).toBe(200);
    expect(r.body.players.find((x) => x.you).player_id).toBe(b.player.id);
    // brand-new pair: novelty applies, so the preview is bigger than a rematch's
    expect(r.body.players[0].win).toBeGreaterThan(0);
    // the pending match's own scores: `result` is exactly what confirming it does
    const mineB = r.body.players.find((x) => x.you);
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
    await sql('UPDATE players SET singles_rating = 2000, singles_game_wins = 300 WHERE id = ?', a.player.id); // singles must not leak
    const after = (await call(a, 'matchStakes', body)).body.players;
    expect(after).toEqual(before);
    expect(before.every((x) => x.rating === 1400)).toBe(true);
    expect((await call(a, 'matchStakes', { ...body, side_a: ids(a) })).status).toBe(400);
    expect((await call(a, 'matchStakes', { ...body, side_a: ids(c, d), side_b: ids(a, b) })).status).toBe(400); // you must be on side a
    expect((await call(a, 'matchStakes', { ...body, side_b: ids(a, d) })).status).toBe(400); // duplicate
    expect((await call(a, 'matchStakes', { ...body, target: 15 })).status).toBe(400);
    expect((await call(null, 'matchStakes', body)).status).toBe(401);
  });
  it('challenge preview: singles, challenge stakes, only the two players', async () => {
    const [a, b, c] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3')];
    // ranks: a 1, b 2, c 3 -> c may challenge a (2 above)
    const ch = (await call(c, 'createChallenge', { defender_player_id: a.player.id })).body.challenge;
    const r = await call(a, 'matchStakes', { challenge_id: ch.id });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ format: 'singles', challenge: true });
    const plain = (await call(a, 'matchStakes', { format: 'singles', target: 11, side_a: ids(a), side_b: ids(c) })).body.players.find((x) => x.you);
    expect(r.body.players.find((x) => x.you).win).toBeGreaterThan(plain.win);
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

describe('rules copy numbers (RatingExplainer worked example + rematch line)', () => {
  const steady = (gap) => { let w = 0; for (let d = gap; d <= 180; d += gap) w += meetingWeight(d); return w; };
  const p = (id, o = {}) => ({ id, rating: 1400, gamesPlayed: 60, matchesPlayed: 25, earlierMeetings: 0, ...o });
  const st = (o, oo = o) => stakes({ format: 'singles', target: 11, sides: { a: [p('a', o)], b: [p('b', oo)] } })[0];
  it('what is on the line for two equal regulars', () => {
    expect(st({ novel: true })).toMatchObject({ win: 13, lose: -13 });
    expect(st({ earlierMeetings: steady(7) })).toMatchObject({ win: 10, lose: -10 });
    expect(st({ earlierMeetings: steady(1) })).toMatchObject({ win: 6, lose: -6 });
    expect(st({ earlierMeetings: steady(7), daysSinceLast: 42 }, { earlierMeetings: steady(7) })).toMatchObject({ win: 15, lose: -15 });
  });
  it('rematch line: daily x0.48, weekly x0.89', async () => {
    const { repeatFactor } = await import('../src/rating.js');
    expect(repeatFactor(steady(1))).toBeCloseTo(0.48, 2);
    expect(repeatFactor(steady(7))).toBeCloseTo(0.89, 2);
  });
});
