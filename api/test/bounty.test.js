import fs from 'node:fs';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, mkPlayer, seasoned } from './helpers.js';
import { bountyFor } from '../src/bounty.js';

beforeEach(reset);
afterAll(() => dispose());
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const row = (id) => env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
const games = [{ a: 11, b: 9 }, { a: 11, b: 9 }];
const play = async (w, l, extra = {}) => {
  const s = await call(w, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: w.player.id }], side_b: [{ player_id: l.player.id }], games, ...extra });
  return (await call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
};
const ch = (m, p) => m.rating_changes.find((x) => x.player_id === p.player.id);

describe('bounties', () => {
  it('rules: top 3 only, streak adds up to a cap; api and web copies match', () => {
    expect(bountyFor(1)).toEqual({ rank: 1, rating: 20, xp: 60 });
    expect(bountyFor(2, 2)).toEqual({ rank: 2, rating: 20, xp: 60 });
    expect(bountyFor(3, 99)).toEqual({ rank: 3, rating: 23, xp: 75 });
    expect(bountyFor(4)).toBeNull();
    expect(bountyFor(null)).toBeNull();
    const api = fs.readFileSync(new URL('../src/bounty.js', import.meta.url), 'utf8').split('\n').slice(1).join('\n');
    const web = fs.readFileSync(new URL('../../web/src/lib/bounty.js', import.meta.url), 'utf8').split('\n').slice(1).join('\n');
    expect(api).toBe(web);
  });

  it('beating #1 pays their bounty in rating (taken from them) and XP, once per week per pair', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await seasoned(a, b, c, d); // a #1
    await sql('UPDATE players SET singles_win_streak = 2 WHERE id = ?', a.player.id);
    const m = await play(d, a);
    const won = ch(m, d), lost = ch(m, a);
    expect(won.bounties).toEqual([{ from: a.player.id, name: 'Aa1', rank: 1, rating: 26, xp: 80 }]);
    expect(lost.bounty_paid).toBe(26);
    expect(won.xp_parts.find((x) => x.key === 'bounty')).toEqual({ key: 'bounty', label: 'bounty on Aa1', xp: 80 });
    // zero-sum on top of the (symmetric) match result
    expect(won.delta + lost.delta).toBe(0);
    // claim again within a week: nothing
    await sql('UPDATE players SET singles_rating = 1700, singles_rank = 1 WHERE id = ?', a.player.id);
    const again = await play(d, a);
    expect(ch(again, d).bounties).toBeUndefined();
    // someone else can still collect
    await sql('UPDATE players SET singles_rank = 1 WHERE id = ?', a.player.id);
    expect(ch(await play(c, a), c).bounties).toHaveLength(1);
  });

  it('no bounty off the podium, in unranked matches, or for beating #4', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await seasoned(a, b, c, d);
    await sql('UPDATE players SET singles_rank = 4 WHERE id = ?', c.player.id);
    expect(ch(await play(d, c), d).bounties).toBeUndefined();
    expect(ch(await play(d, a, { ranked: false }), d).bounties).toBeUndefined();
    expect((await row(a.player.id)).xp).toBeGreaterThan(0);
    await sql('UPDATE players SET singles_rank = 4 WHERE id = ?', d.player.id);
    const m = await play(a, d); // the bountied #1 wins: they never pay, and d (#4) has no bounty
    expect(ch(m, a).bounties).toBeUndefined();
    expect(ch(m, a).bounty_paid).toBeUndefined();
  });

  it('doubles: each winner gets the XP and an equal share of the rating', async () => {
    const ps = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    const [a, b, c, d] = ps;
    await sql('UPDATE players SET doubles_rank = 1, doubles_wins = 6 WHERE id = ?', a.player.id);
    const s = await call(c, 'submitMatch', {
      format: 'doubles', target: 11, side_a: [{ player_id: c.player.id }, { player_id: d.player.id }],
      side_b: [{ player_id: a.player.id }, { player_id: b.player.id }], games,
    });
    let m;
    for (const u of [d, a, b]) m = (await call(u, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
    expect(m.status).toBe('verified');
    expect(ch(m, c).bounties).toEqual([{ from: a.player.id, name: 'Aa1', rank: 1, rating: 10, xp: 60 }]);
    expect(ch(m, d).bounties[0].rating).toBe(10);
    expect(ch(m, a).bounty_paid).toBe(20);
  });

  it('the stakes preview shows it before you play', async () => {
    const [a, b, c] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3')];
    await seasoned(a, b, c);
    const pre = await call(c, 'matchStakes', { format: 'singles', target: 11, side_a: [{ player_id: c.player.id }], side_b: [{ player_id: a.player.id }] });
    const me = pre.body.players.find((x) => x.you);
    expect(me.bounty_win).toEqual({ rating: 20, xp: 60, from: ['Aa1'] });
    expect(pre.body.players.find((x) => !x.you).bounty_risk).toBe(20);
    const m = await play(c, a, { games: [{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 11, b: 9 }] });
    expect(ch(m, c).delta).toBe(me.narrow.win);
  });
});
