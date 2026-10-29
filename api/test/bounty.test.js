import fs from 'node:fs';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, mkPlayer, seasoned } from './helpers.js';
import { bountyFor } from '../src/bounty.js';

beforeEach(reset);
afterAll(() => dispose());
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const games = [{ a: 11, b: 9 }, { a: 11, b: 9 }];
const play = async (w, l, extra = {}) => {
  const s = await call(w, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: w.player.id }], side_b: [{ player_id: l.player.id }], games, ...extra });
  return (await call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
};
const ch = (m, p) => m.rating_changes.find((x) => x.player_id === p.player.id);
const T = (o) => ({ id: 't', rank: null, streak: 0, rise: 0, ...o });
const H = (o) => ({ id: 'h', rank: null, streak: 0, rise: 0, ...o });

describe('bounty rules (pure)', () => {
  it('podium: only for hunters below, worth more the further below', () => {
    expect(bountyFor(H({ rank: 2 }), T({ rank: 1 }))).toMatchObject({ rating: 12, xp: 50 });
    expect(bountyFor(H({ rank: 8 }), T({ rank: 1 }))).toMatchObject({ rating: 22, xp: 80 }); // 12 + min(10, 2*6), 50 + min(30, 5*6)
    expect(bountyFor(H({ rank: 4 }), T({ rank: 3 }))).toMatchObject({ rating: 6, xp: 25 });
    expect(bountyFor(H({ rank: 1 }), T({ rank: 2 }))).toBeNull(); // #1 gets nothing for beating #2 on rank alone
    expect(bountyFor(H({ rank: 5 }), T({ rank: 4 }))).toBeNull();
    expect(bountyFor(null, T({ rank: 1 }))).toMatchObject({ rating: 16, xp: 60 }); // neutral viewer: as if 3 places below
    expect(bountyFor(H({ id: 'x', rank: 3 }), T({ id: 'x', rank: 1 }))).toBeNull();
  });
  it('streaks and fast risers carry a bounty for everyone, #1 included', () => {
    expect(bountyFor(H({ rank: 1 }), T({ rank: 6, streak: 2 }))).toBeNull();
    expect(bountyFor(H({ rank: 1 }), T({ rank: 6, streak: 4 }))).toMatchObject({ rating: 6, xp: 20, parts: [{ key: 'streak' }] });
    expect(bountyFor(H({ rank: 1 }), T({ rank: 6, streak: 20 }))).toMatchObject({ rating: 15, xp: 50 });
    expect(bountyFor(H({ rank: 1 }), T({ rank: 5, rise: 49 }))).toBeNull();
    expect(bountyFor(H({ rank: 1 }), T({ rank: 5, rise: 84 }))).toMatchObject({ rating: 8, xp: 40, parts: [{ key: 'riser', label: '+84 this week' }] });
  });
  it('kinds stack, capped', () => {
    const b = bountyFor(H({ rank: 9 }), T({ rank: 1, streak: 12, rise: 200 }));
    expect(b.parts.map((p) => p.key)).toEqual(['podium', 'streak', 'riser']);
    expect(b).toMatchObject({ rating: 30, xp: 120 });
  });
  it('api and web copies match', () => {
    const body = (u) => fs.readFileSync(new URL(u, import.meta.url), 'utf8').split('\n').slice(1).join('\n');
    expect(body('../src/bounty.js')).toBe(body('../../web/src/lib/bounty.js'));
  });
});

describe('bounties in play', () => {
  it('beating #1 from below pays the podium bounty (taken from them) and XP, once per week per pair', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await seasoned(a, b, c, d); // a #1, d #4
    const m = await play(d, a);
    const won = ch(m, d), lost = ch(m, a);
    expect(won.bounties).toEqual([{ from: a.player.id, name: 'Aa1', parts: ['podium'], rating: 16, xp: 60 }]);
    expect(lost.bounty_paid).toBe(16);
    expect(won.xp_parts.find((x) => x.key === 'bounty')).toEqual({ key: 'bounty', label: 'bounty on Aa1', xp: 60 });
    expect(won.delta + lost.delta).toBe(0);
    await sql('UPDATE players SET singles_rank = 1 WHERE id = ?', a.player.id);
    expect(ch(await play(d, a), d).bounties).toBeUndefined(); // already claimed this week
  });

  it('#1 humbles a player on a streak', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await seasoned(a, b, c, d);
    await sql('UPDATE players SET singles_win_streak = 5 WHERE id = ?', d.player.id);
    const m = await play(a, d);
    expect(ch(m, a).bounties).toEqual([{ from: d.player.id, name: 'Dd4', parts: ['streak'], rating: 9, xp: 30 }]);
    expect(ch(m, d).bounty_paid).toBe(9);
  });

  it('no bounty for a plain win over a lower player, or in unranked matches', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await seasoned(a, b, c, d);
    const m = await play(a, d);
    expect(ch(m, a).bounties).toBeUndefined();
    expect(ch(await play(d, a, { ranked: false }), d).bounties).toBeUndefined();
  });

  it('doubles: each winner gets the XP and their share of the rating', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await sql('UPDATE players SET doubles_rank = 1, doubles_wins = 6 WHERE id = ?', a.player.id);
    const s = await call(c, 'submitMatch', {
      format: 'doubles', target: 11, side_a: [{ player_id: c.player.id }, { player_id: d.player.id }],
      side_b: [{ player_id: a.player.id }, { player_id: b.player.id }], games,
    });
    let m;
    for (const u of [d, a, b]) m = (await call(u, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
    expect(m.status).toBe('verified');
    expect(ch(m, c).bounties).toEqual([{ from: a.player.id, name: 'Aa1', parts: ['podium'], rating: 8, xp: 60 }]); // 16 / 2
    expect(ch(m, a).bounty_paid).toBe(16);
  });

  it('bountyBoard: 7-day rises and the bounties you already claimed; stakes preview matches', async () => {
    const [a, b, c] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3')];
    await seasoned(a, b, c);
    const pre = await call(c, 'matchStakes', { format: 'singles', target: 11, side_a: [{ player_id: c.player.id }], side_b: [{ player_id: a.player.id }] });
    const me = pre.body.players.find((x) => x.you);
    expect(me.bounty_win).toEqual({ rating: 14, xp: 55, from: ['Aa1'] });
    const m = await play(c, a, { games: [{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 11, b: 9 }] });
    expect(ch(m, c).delta).toBe(me.narrow.win);
    const board = (await call(c, 'bountyBoard')).body;
    expect(board.claimed.singles).toEqual([a.player.id]);
    expect(board.rise.singles[c.player.id]).toBe(ch(m, c).delta + 0); // seasoned() losses are not verified matches
    expect((await call(null, 'bountyBoard')).body.claimed.singles).toEqual([]);
  });
});
