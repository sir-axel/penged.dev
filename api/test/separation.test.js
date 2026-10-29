import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, get, mkPlayer } from './helpers.js';
import { repeatFactor } from '../src/rating.js';

beforeEach(reset);
afterAll(() => dispose());
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const games = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
const ent = async (u) => (await get('/api/entities/Player/' + u.player.id)).body;
const SINGLES = ['singles_rating', 'singles_rank', 'singles_wins', 'singles_losses', 'singles_win_streak', 'singles_best_streak', 'singles_last_verified_at'];
const DOUBLES = ['doubles_rating', 'doubles_rank', 'doubles_wins', 'doubles_losses', 'doubles_win_streak', 'doubles_best_streak', 'doubles_last_verified_at'];
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

async function single(w, l) {
  const s = await call(w, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: w.player.id }], side_b: [{ player_id: l.player.id }], games });
  return (await call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match.rating_changes;
}
/** winners (a-side) beat losers (b-side) in doubles. */
async function double([w1, w2], [l1, l2]) {
  const s = await call(w1, 'submitMatch', {
    format: 'doubles', target: 11, side_a: [{ player_id: w1.player.id }, { player_id: w2.player.id }],
    side_b: [{ player_id: l1.player.id }, { player_id: l2.player.id }], games,
  });
  let m;
  for (const u of [w2, l1, l2]) m = (await call(u, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
  return m.rating_changes;
}
const four = async () => [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];

describe('singles and doubles are separate ladders', () => {
  it('a doubles match never changes any singles field, and vice versa', async () => {
    const [a, b, c, d] = await four();
    await single(a, b);
    await single(a, b);
    const before = await Promise.all([a, b, c, d].map(async (u) => pick(await ent(u), SINGLES)));
    await double([a, c], [b, d]);
    const after = await Promise.all([a, b, c, d].map(async (u) => pick(await ent(u), SINGLES)));
    expect(after).toEqual(before);
    const dBefore = await Promise.all([a, b, c, d].map(async (u) => pick(await ent(u), DOUBLES)));
    await single(b, a);
    const dAfter = await Promise.all([a, b, c, d].map(async (u) => pick(await ent(u), DOUBLES)));
    expect(dAfter).toEqual(dBefore);
    expect((await ent(a)).doubles_wins).toBe(1);
  });

  it('streaks are per format; the XP streak bonus uses the format being played', async () => {
    const [a, b, c, d] = await four();
    await single(a, b);
    await single(a, b);
    const rc = await double([a, c], [b, d]);
    const mine = rc.find((x) => x.player_id === a.player.id);
    expect(mine.win_streak).toBe(1);
    expect(mine.xp_parts.find((p) => p.key === 'streak')).toBeUndefined();
    expect(await ent(a)).toMatchObject({ singles_win_streak: 2, singles_best_streak: 2, doubles_win_streak: 1, doubles_best_streak: 1 });
    await double([b, d], [a, c]);
    expect(await ent(a)).toMatchObject({ singles_win_streak: 2, doubles_win_streak: 0, doubles_best_streak: 1 });
    const rc3 = await single(a, b);
    expect(rc3.find((x) => x.player_id === a.player.id).xp_parts.find((p) => p.key === 'streak').xp).toBe(20);
    expect((await ent(a)).win_streak).toBe(0); // legacy shared column is no longer written
  });

  it('confidence (RD) and sigma are per format', async () => {
    const [a, b, c, d] = await four();
    // A is a settled singles veteran only.
    await sql('UPDATE players SET singles_wins = 40, singles_losses = 10, singles_game_wins = 30, singles_game_losses = 20, singles_rd = 50, singles_vol = 0.07, singles_rd_at = ? WHERE id = ?',
      new Date().toISOString(), a.player.id);
    const rc = await double([a, c], [b, d]);
    const ra = rc.find((x) => x.player_id === a.player.id);
    expect(ra.rd_before).toBeCloseTo(200, 9); // a brand-new doubles player, whatever the singles record
    expect(ra.vol_before).toBe(0.06);
    const rs = await single(a, b);
    const sa = rs.find((x) => x.player_id === a.player.id);
    expect(sa.rd_before).toBeLessThan(55);
    expect(sa.vol_before).toBe(0.07);
    const pa = (await get('/api/entities/Player/' + a.player.id)).body;
    expect(pa.doubles_rd).toBeCloseTo(ra.rd_after, 9);
    expect(pa.singles_rd).toBeCloseTo(sa.rd_after, 9);
  });

  it('time away reads the format\'s own RD date', async () => {
    const [a, b, c, d] = await four();
    await single(a, b);
    await double([a, c], [b, d]);
    const old = new Date(Date.now() - 100 * 86400000).toISOString();
    await sql('UPDATE players SET singles_rd_at = ?, singles_last_verified_at = ? WHERE id = ?', old, old, a.player.id);
    const pa = (await get('/api/entities/Player/' + a.player.id)).body;
    const rc = await double([a, c], [b, d]);
    expect(rc.find((x) => x.player_id === a.player.id).rd_before).toBeLessThan(pa.doubles_rd + 1); // doubles: not away
    const rs = await single(b, a);
    expect(rs.find((x) => x.player_id === a.player.id).rd_before).toBeGreaterThan(pa.singles_rd + 30); // singles: 100 days away
  });

  it('doubles rematch count ignores singles meetings (and vice versa)', async () => {
    const [a, b, c, d] = await four();
    for (let i = 0; i < 3; i++) await single(a, b);
    const rc = await double([a, c], [b, d]);
    expect(rc.find((x) => x.player_id === a.player.id).repeat).toBe(1);
    const rc2 = await double([a, c], [b, d]);
    expect(rc2.find((x) => x.player_id === a.player.id).repeat).toBeCloseTo(repeatFactor(1), 6);
    const rs = await single(a, b); // 3 earlier singles meetings, the doubles ones do not count
    expect(rs.find((x) => x.player_id === a.player.id).repeat).toBeCloseTo(repeatFactor(3), 6);
  });

  it('doubles_rank orders by doubles rating, then doubles games, then join order', async () => {
    const [a, b, c, d] = await four();
    await sql('UPDATE players SET singles_rating = 1600 WHERE id = ?', a.player.id); // singles lead must not leak
    await sql('UPDATE players SET doubles_rating = 1500 WHERE id = ?', d.player.id);
    await sql('UPDATE players SET doubles_rating = 1450, doubles_wins = 3 WHERE id = ?', c.player.id);
    await sql('UPDATE players SET doubles_rating = 1450, doubles_wins = 1 WHERE id = ?', b.player.id);
    await call(a, 'syncLadder');
    const rows = (await get('/api/entities/Player?limit=10')).body.items;
    const byName = Object.fromEntries(rows.map((p) => [p.username, p]));
    expect(['Dd4', 'Cc3', 'Bb2', 'Aa1'].map((n) => byName[n].doubles_rank)).toEqual([1, 2, 3, 4]);
    expect(byName.Aa1.singles_rank).toBe(1);
    expect(byName.Dd4.singles_rank).not.toBe(1);
  });

  it('inactivity is per format', async () => {
    const [a, b] = await four();
    const old = new Date(Date.now() - 40 * 86400000).toISOString();
    await sql('UPDATE players SET doubles_wins = 2, doubles_last_verified_at = ? WHERE id = ?', old, a.player.id);
    await sql('UPDATE players SET singles_wins = 2, singles_last_verified_at = ? WHERE id = ?', old, b.player.id);
    await call(a, 'syncLadder');
    expect(await ent(a)).toMatchObject({ doubles_rank: null });
    expect((await ent(a)).singles_rank).toBeGreaterThan(0);
    expect(await ent(b)).toMatchObject({ singles_rank: null });
    expect((await ent(b)).doubles_rank).toBeGreaterThan(0);
  });
});
