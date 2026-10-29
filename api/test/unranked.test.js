import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, mkPlayer } from './helpers.js';

beforeEach(reset);
afterAll(() => dispose());
const row = (id) => env.DB.prepare('SELECT * FROM players WHERE id = ?').bind(id).first();
const games = [{ a: 11, b: 5 }, { a: 11, b: 0 }];
const play = async (w, l, extra = {}) => {
  const s = await call(w, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: w.player.id }], side_b: [{ player_id: l.player.id }], games, ...extra });
  expect(s.status).toBe(200);
  return (await call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
};

describe('unranked matches', () => {
  it('earn XP only: ratings, records, streaks and ranks stay put', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const before = [await row(a.player.id), await row(b.player.id)];
    const m = await play(a, b, { ranked: false });
    expect(m).toMatchObject({ status: 'verified', ranked: false });
    const [ra, rb] = [await row(a.player.id), await row(b.player.id)];
    for (const [r, was] of [[ra, before[0]], [rb, before[1]]]) {
      expect(r).toMatchObject({
        singles_rating: was.singles_rating, singles_wins: was.singles_wins, singles_losses: was.singles_losses, singles_rank: was.singles_rank,
        singles_win_streak: 0, singles_rd: was.singles_rd, singles_last_verified_at: was.singles_last_verified_at,
      });
      expect(r.xp).toBeGreaterThan(was.xp);
    }
    const ca = m.rating_changes.find((c) => c.player_id === a.player.id);
    expect(ca).toMatchObject({ delta: 0, unranked: true });
    expect(ca.xp_parts.map((p) => p.key)).toEqual(['played', 'win', 'games', 'skunk', 'first_of_day']); // no streak, no new rival
  });

  it('never counts as a meeting: a later ranked match is still a new rival', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    await play(a, b, { ranked: false });
    await play(a, b, { ranked: false });
    const m = await play(a, b);
    const ca = m.rating_changes.find((c) => c.player_id === a.player.id);
    expect(ca.novelty).toBeCloseTo(1.1, 9);
    expect(ca.repeat).toBe(1);
    expect(ca.delta).toBeGreaterThan(0);
  });

  it('ranked is the default and must be a boolean', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    expect((await play(a, b)).ranked).toBe(true);
    const bad = await call(a, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: a.player.id }], side_b: [{ player_id: b.player.id }], games, ranked: 'no' });
    expect(bad.status).toBe(400);
  });

  it('stakes preview says unranked', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const s = await call(a, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: a.player.id }], side_b: [{ player_id: b.player.id }], games, ranked: false });
    const st = await call(b, 'matchStakes', { match_id: s.body.match.id });
    expect(st.body.ranked).toBe(false);
    expect(st.body.players.every((p) => p.result == null)).toBe(true);
  });
});
