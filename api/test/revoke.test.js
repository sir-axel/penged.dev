import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, get, mkPlayer, seasoned } from './helpers.js';
import { CHALLENGES_SENT_PER_WEEK } from '../src/rating.js';

beforeEach(reset);
afterAll(() => dispose());
const ent = async (name, id) => (await get(`/api/entities/${name}/${id}`)).body;
const ladder = async (...names) => {
  const ps = [];
  for (const n of names) ps.push(await mkPlayer(n));
  await seasoned(...ps);
  return ps;
};
const single = (u, def) => call(u, 'createChallenge', { defender_player_id: def.player.id });

describe('taking back a challenge you sent', () => {
  it('swap: free, sends to the new player, the old one counts toward nobody\'s caps', async () => {
    const [a, b, c] = await ladder('Aa1', 'Bb2', 'Cc3');
    const ch = (await single(c, a)).body.challenge;
    const before = (await call(c, 'challengeLimits')).body.sends_left;
    const rating = (await ent('Player', c.player.id)).singles_rating;
    const r = await call(c, 'revokeChallenge', { challenge_id: ch.id, swap_to_player_id: b.player.id, message: 'you instead' });
    expect(r.status).toBe(200);
    expect(r.body.challenge).toMatchObject({ defender_player_id: b.player.id, status: 'open', message: 'you instead' });
    expect(await ent('Challenge', ch.id)).toMatchObject({ status: 'cancelled', revoke_kind: 'swapped', revoke_penalty: 0, swapped_to_id: r.body.challenge.id });
    expect((await ent('Player', c.player.id)).singles_rating).toBe(rating); // free
    expect((await call(c, 'challengeLimits')).body.sends_left).toBe(before); // the swap did not use a send
    expect((await call(a, 'challengeLimits')).body.at_limit[a.player.id]).toBeUndefined();
  });

  it('revoke for good: costs what ducking them would, still counts as a send', async () => {
    const [a, , c] = await ladder('Aa1', 'Bb2', 'Cc3');
    const ch = (await single(c, a)).body.challenge;
    const rating = (await ent('Player', c.player.id)).singles_rating;
    const q = (await call(c, 'revokeQuote', { challenge_id: ch.id })).body;
    expect(q.revoke.penalty).toBeGreaterThan(0);
    expect(q.can_swap).toBe(true);
    const r = await call(c, 'revokeChallenge', { challenge_id: ch.id });
    expect(r.body.penalty).toBe(q.revoke.penalty);
    expect(await ent('Challenge', ch.id)).toMatchObject({ status: 'cancelled', revoke_kind: 'revoked', revoke_penalty: q.revoke.penalty });
    expect((await ent('Player', c.player.id)).singles_rating).toBe(rating - q.revoke.penalty);
    expect((await call(c, 'challengeLimits')).body.sends_left).toBe(CHALLENGES_SENT_PER_WEEK - 1);
    // and they can send a new one right away (the old one is no longer live)
    expect((await single(c, a)).status).toBe(200);
  });

  it('only your own live regular challenges; accepted ones can be revoked (with the cost) but not swapped', async () => {
    const [a, b, c] = await ladder('Aa1', 'Bb2', 'Cc3');
    const ch = (await single(c, a)).body.challenge;
    expect((await call(a, 'revokeChallenge', { challenge_id: ch.id })).status).toBe(403);
    await call(a, 'respondChallenge', { challenge_id: ch.id, decision: 'accept' });
    expect((await call(c, 'revokeChallenge', { challenge_id: ch.id, swap_to_player_id: b.player.id })).status).toBe(400);
    expect((await call(c, 'revokeChallenge', { challenge_id: ch.id })).status).toBe(200);
    expect((await call(c, 'revokeChallenge', { challenge_id: ch.id })).status).toBe(400); // already gone
  });

  it('cannot swap to someone at their weekly receive limit, or to the same player', async () => {
    const [a, b, c, d, e] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4', 'Ee5');
    await single(d, b);
    await single(e, b); // b has received 2
    const ch = (await single(c, a)).body.challenge;
    expect((await call(c, 'revokeChallenge', { challenge_id: ch.id, swap_to_player_id: b.player.id })).status).toBe(409);
    expect((await call(c, 'revokeChallenge', { challenge_id: ch.id, swap_to_player_id: a.player.id })).status).toBe(400);
    expect((await ent('Challenge', ch.id)).status).toBe('open');
  });
});
