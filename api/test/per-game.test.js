import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import { env, dispose, reset, call, get, mkPlayer } from './helpers.js';

beforeEach(reset);
afterAll(() => dispose());
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const ent = async (u) => (await get('/api/entities/Player/' + u.player.id)).body;
const ids = (...ps) => ps.map((p) => ({ player_id: p.player.id }));

async function verified(format, win, lose, games, target = 11) {
  const [wa, wb] = [win, lose];
  const s = await call(wa[0], 'submitMatch', { format, target, side_a: ids(...wa), side_b: ids(...wb), games });
  expect(s.status).toBe(200);
  let m;
  for (const u of [...wa.slice(1), ...wb]) m = (await call(u, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
  return m;
}

describe('per-game ratings through verification', () => {
  it('stores the per-game sequence and a match total that matches the rating move', async () => {
    const a = await mkPlayer('Aa1');
    const b = await mkPlayer('Bb2');
    const m = await verified('singles', [a], [b], [{ a: 11, b: 4 }, { a: 9, b: 11 }, { a: 11, b: 6 }]);
    const w = m.rating_changes.find((x) => x.player_id === a.player.id);
    expect(w.games).toHaveLength(3);
    expect(w.games.map((g) => g.score)).toEqual([[11, 4], [9, 11], [11, 6]]);
    expect(w.games.map((g) => g.won)).toEqual([true, false, true]);
    expect(w.games[0].before).toBe(1400);
    expect(w.games[1].before).toBe(w.games[0].after);
    expect(w.games[2].after).toBe(w.after);
    expect(w.delta).toBe(w.games.reduce((t, g) => t + g.delta, 0));
    expect(w.games[0].dominance).toBeCloseTo(7 / 15, 6);
    expect((await ent(a)).singles_rating).toBe(w.after);
    expect((await ent(b)).singles_rating).toBe(m.rating_changes.find((x) => x.player_id === b.player.id).after);
  });

  it('game counts move per format; match W-L moves once; the other format is untouched', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await verified('singles', [a], [b], [{ a: 11, b: 4 }, { a: 9, b: 11 }, { a: 11, b: 6 }]); // a wins 2-1
    let pa = await ent(a);
    let pb = await ent(b);
    expect(pa).toMatchObject({ singles_wins: 1, singles_losses: 0, singles_game_wins: 2, singles_game_losses: 1, doubles_game_wins: 0, doubles_game_losses: 0 });
    expect(pb).toMatchObject({ singles_wins: 0, singles_losses: 1, singles_game_wins: 1, singles_game_losses: 2 });
    await verified('doubles', [c, a], [d, b], [{ a: 11, b: 5 }, { a: 11, b: 7 }]); // c+a win 2-0
    pa = await ent(a);
    expect(pa).toMatchObject({ singles_wins: 1, singles_game_wins: 2, singles_game_losses: 1, doubles_wins: 1, doubles_game_wins: 2, doubles_game_losses: 0 });
    expect(await ent(d)).toMatchObject({ doubles_losses: 1, doubles_game_wins: 0, doubles_game_losses: 2, singles_game_wins: 0, singles_game_losses: 0 });
    // K now reads GAMES: a has 3 singles games behind them, so game 1 of the next match uses kSmooth(3)
    const m = await verified('singles', [a], [b], [{ a: 11, b: 1 }]);
    expect(m.rating_changes.find((x) => x.player_id === a.player.id).games[0].k).toBeCloseTo(32 + 16 * Math.exp(-3 / 30), 6);
  });

  it('doubles partners keep independent per-game sequences', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await sql('UPDATE players SET doubles_rating = 1500 WHERE id = ?', a.player.id);
    const m = await verified('doubles', [a, b], [c, d], [{ a: 11, b: 5 }, { a: 9, b: 11 }, { a: 11, b: 6 }]);
    const ra = m.rating_changes.find((x) => x.player_id === a.player.id);
    const rb = m.rating_changes.find((x) => x.player_id === b.player.id);
    expect(ra.games[0].before).toBe(1500);
    expect(rb.games[0].before).toBe(1400);
    expect(ra.games[0].teammate).toBeLessThan(1);
    expect(rb.games[0].teammate).toBeGreaterThan(1);
    expect((await ent(a)).doubles_rating).toBe(ra.after);
    expect((await ent(b)).doubles_rating).toBe(rb.after);
  });

  it('the match total is capped at 80 and the stored games add up to it', async () => {
    const a = await mkPlayer('Aa1');
    const b = await mkPlayer('Bb2');
    await sql('UPDATE players SET singles_rating = 1000 WHERE id = ?', a.player.id);
    await sql('UPDATE players SET singles_rating = 1900 WHERE id = ?', b.player.id);
    const m = await verified('singles', [a], [b], Array(3).fill({ a: 11, b: 0 }));
    const w = m.rating_changes.find((x) => x.player_id === a.player.id);
    expect(w.delta).toBeLessThanOrEqual(80);
    expect(w.games.reduce((t, g) => t + g.delta, 0)).toBe(w.delta);
    expect(w.games.every((g) => Math.abs(g.delta) <= 40)).toBe(true);
  });

  it('old matches keep their flat rating_changes entries and are served unchanged', async () => {
    const a = await mkPlayer('Aa1');
    const b = await mkPlayer('Bb2');
    const m = await verified('singles', [a], [b], [{ a: 11, b: 5 }]);
    const legacy = [{ player_id: a.player.id, name: 'Aa1', before: 1400, after: 1427, delta: 27, expected: 0.5, mov: 1.5, ac: 1, dominance: 0.5, k: 48, xp_gained: 60, xp_parts: [{ label: 'played', xp: 25 }] }];
    await sql('UPDATE matches SET rating_changes = ? WHERE id = ?', JSON.stringify(legacy), m.id);
    const got = (await get('/api/entities/Match/' + m.id)).body;
    expect(got.rating_changes).toEqual(legacy);
    expect(got.rating_changes[0].games).toBeUndefined();
  });
});

describe('migration 0012 backfill', () => {
  it('counts each player\'s games per format from the verified matches\' games JSON', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    const put = (id, format, side_a, side_b, games, status = 'verified') => {
      const ga = games.filter((g) => g.a > g.b).length;
      const all = [...side_a, ...side_b];
      return sql(
        `INSERT INTO matches (id, format, target, side_a, side_b, games, games_a, games_b, winner_side, status, all_player_ids, all_user_ids, created_date, updated_date)
         VALUES (?, ?, 11, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
        id, format, JSON.stringify(side_a.map((p) => ({ player_id: p.player.id }))), JSON.stringify(side_b.map((p) => ({ player_id: p.player.id }))),
        JSON.stringify(games), ga, games.length - ga, ga * 2 > games.length ? 'a' : 'b', status, JSON.stringify(all.map((p) => p.player.id)));
    };
    await put('m1', 'singles', [a], [b], [{ a: 11, b: 4 }, { a: 9, b: 11 }, { a: 11, b: 6 }]); // a 2-1
    await put('m2', 'singles', [b], [a], [{ a: 11, b: 0 }, { a: 11, b: 3 }]); // b 2-0 over a
    await put('m3', 'doubles', [a, c], [b, d], [{ a: 5, b: 11 }, { a: 11, b: 9 }, { a: 8, b: 11 }]); // b+d 2-1 over a+c
    await put('m4', 'singles', [a], [c], [{ a: 11, b: 0 }], 'pending'); // not verified: ignored
    await put('m5', 'singles', [c], [a], [{ a: 11, b: 9 }], 'disputed'); // ignored
    const mig = fs.readFileSync(new URL('../migrations/0012_per_game_rating.sql', import.meta.url), 'utf8');
    const stmts = mig.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);
    expect(stmts.some((s) => s.startsWith('ALTER TABLE'))).toBe(true);
    for (const s of stmts.filter((x) => !x.startsWith('ALTER TABLE'))) await env.DB.prepare(s).run(); // the columns already exist in the test DB
    const g = async (p) => {
      const e = await ent(p);
      return [e.singles_game_wins, e.singles_game_losses, e.doubles_game_wins, e.doubles_game_losses];
    };
    expect(await g(a)).toEqual([2, 3, 1, 2]); // singles: 2-1 then 0-2 ; doubles: 1-2
    expect(await g(b)).toEqual([3, 2, 2, 1]);
    expect(await g(c)).toEqual([0, 0, 1, 2]);
    expect(await g(d)).toEqual([0, 0, 2, 1]);
    // matches' own games_a/games_b agree with the JSON totals (sanity of the source of truth)
    const rows = (await env.DB.prepare(`SELECT id, games_a FROM matches WHERE status = 'verified' ORDER BY id`).all()).results;
    expect(rows.map((r) => r.games_a)).toEqual([2, 2, 1]);
    // match W-L untouched by the backfill
    expect((await ent(a)).singles_wins).toBe(0);
  });
});
