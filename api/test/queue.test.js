import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, mkPlayer, seasoned } from './helpers.js';

beforeEach(reset);
afterAll(() => dispose());
const games = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
const submit = (u, p, q) =>
  call(u, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: p.id }], side_b: [{ player_id: q.id }], games });

describe('myQueueCount', () => {
  it('requires a session', async () => {
    expect((await call(null, 'myQueueCount')).status).toBe(401);
  });

  it('counts only items waiting on me, drops them once answered or expired', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const c = await mkPlayer('Carol');
    await seasoned(a, b, c); // on the ladder, so Carol can challenge up
    expect((await call(b, 'myQueueCount')).body).toEqual({ matches: 0, challenges: 0, total: 0 });
    const m = (await submit(a, a.player, b.player)).body.match;
    expect((await call(a, 'myQueueCount')).body.total).toBe(0); // submitter already accepted
    expect((await call(b, 'myQueueCount')).body).toEqual({ matches: 1, challenges: 0, total: 1 });
    expect((await call(c, 'myQueueCount')).body.total).toBe(0); // not a participant
    // a challenge against Bobby (Carol ranks below and may challenge up)
    const ch = await call(c, 'createChallenge', { defender_player_id: b.player.id });
    expect(ch.status).toBe(200);
    expect((await call(b, 'myQueueCount')).body).toEqual({ matches: 1, challenges: 1, total: 2 });
    expect((await call(c, 'myQueueCount')).body.total).toBe(0);
    await call(b, 'respondMatch', { match_id: m.id, decision: 'accept' });
    expect((await call(b, 'myQueueCount')).body).toEqual({ matches: 0, challenges: 1, total: 1 });
    await call(b, 'respondChallenge', { challenge_id: ch.body.challenge.id, decision: 'accept' });
    expect((await call(b, 'myQueueCount')).body.total).toBe(0);
    // expired pending items are not counted
    await submit(a, a.player, b.player);
    expect((await call(b, 'myQueueCount')).body.matches).toBe(1);
    await env.DB.prepare('UPDATE matches SET expires_at = ?').bind(new Date(Date.now() - 3600e3).toISOString()).run();
    expect((await call(b, 'myQueueCount')).body.matches).toBe(0);
  });
});
