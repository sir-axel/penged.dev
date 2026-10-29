import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, signUp, call, get, mkPlayer, seasoned } from './helpers.js';
import { CHALLENGE_STAKES } from '../src/rating.js';
import { compose } from '../src/notify.js';

beforeEach(reset);
afterAll(() => dispose());
const past = () => new Date(Date.now() - 3600e3).toISOString();
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const ent = async (name, id) => (await get(`/api/entities/${name}/${id}`)).body;
const ladder = async (...names) => {
  const ps = [];
  for (const n of names) ps.push(await mkPlayer(n));
  await seasoned(...ps); // ranks follow join order: first name = #1
  return ps;
};
const single = (u, def) => call(u, 'createChallenge', { defender_player_id: def.player.id });
const doubles = (u, partner, d1, d2, extra = {}) => call(u, 'createChallenge', {
  format: 'doubles', partner_player_id: partner.player.id, defender_player_id: d1.player.id, defender_partner_player_id: d2.player.id, ...extra,
});
const answer = (u, ch, decision) => call(u, 'respondChallenge', { challenge_id: ch.id, decision });

describe('weekly challenge caps', () => {
  it('a player can receive at most 2 challenges in a rolling 7 days', async () => {
    const [, b, c, d, e] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4', 'Ee5');
    expect((await single(d, b)).status).toBe(200);
    expect((await single(e, b)).status).toBe(200);
    const r = await single(c, b);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/^Bb2 has already been challenged twice this week\. Try again after .* UTC\.$/);
    const lim = (await call(c, 'challengeLimits')).body;
    expect(Object.keys(lim.at_limit)).toEqual([b.player.id]);
    expect(lim).toMatchObject({ sends_left: 3, received_cap: 2, sent_cap: 3 });
    // a challenge older than 7 days no longer counts
    await sql('UPDATE challenges SET created_date = ? WHERE challenger_player_id = ?', new Date(Date.now() - 8 * 86400e3).toISOString(), d.player.id);
    expect((await single(c, b)).status).toBe(200);
  });

  it('a player can send at most 3 challenges in a rolling 7 days (singles and doubles combined)', async () => {
    const [a, b, c, d, e, f] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4', 'Ee5', 'Ff6');
    for (const def of [c, d]) {
      const ch = (await single(e, def)).body.challenge;
      expect((await answer(def, ch, 'decline')).body.challenge.status).toBe('declined');
    }
    expect((await doubles(e, f, a, b)).status).toBe(200);
    const lim = (await call(e, 'challengeLimits')).body;
    expect(lim).toMatchObject({ sent: 3, sends_left: 0 });
    expect(lim.send_again_at > new Date().toISOString()).toBe(true);
    const r = await single(e, b);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/^You have sent 3 challenges this week\. You can send another after .* UTC\.$/);
  });
});

describe('anyone can challenge anyone (singles)', () => {
  const rate = async (u, r) => { await sql('UPDATE players SET singles_rating = ? WHERE id = ?', r, u.player.id); await call(u, 'syncLadder'); };

  it('any gap either way; direction is decided by rating at creation; both need a ladder position', async () => {
    const [a, , , , e, f] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4', 'Ee5', 'Ff6');
    expect((await single(f, a)).body.challenge).toMatchObject({ direction: 'up', challenger_rank: 6, defender_rank: 1, format: 'singles' });
    await rate(a, 1401);
    expect((await single(a, e)).body.challenge).toMatchObject({ direction: 'down', challenger_rank: 1, defender_rank: 5 });
    const g = await mkPlayer('Gg7'); // never played: no ladder position
    expect((await single(g, a)).status).toBe(400);
    expect((await single(e, g)).status).toBe(400);
  });

  it('downward: declining is free (but starts the pair cooldown)', async () => {
    const [a, b] = await ladder('Aa1', 'Bb2', 'Cc3');
    await rate(a, 1401);
    const ch = (await single(a, b)).body.challenge;
    const pv = (await call(b, 'challengePenaltyPreview', { challenge_id: ch.id })).body;
    expect(pv.decline).toMatchObject({ penalty: 0, reason: 'declined_down', drops_rank: false, challenger_gain: 0 });
    expect(pv.expire).toMatchObject({ penalty: 12, reason: 'expired_down', drops_rank: true, challenger_gain: 0 });
    const r = (await answer(b, ch, 'decline')).body.challenge;
    expect(r).toMatchObject({ status: 'declined', penalty_rating: 0, penalty_reason: 'declined_down' });
    expect(await ent('Player', b.player.id)).toMatchObject({ singles_rating: 1400, singles_rank: 2 });
    expect((await single(a, b)).status).toBe(409); // same-pair cooldown
  });

  it('downward: ignoring it costs half the upward expiry, with no walkover for the challenger', async () => {
    const [a, b] = await ladder('Aa1', 'Bb2', 'Cc3');
    await rate(a, 1401);
    const ch = (await single(a, b)).body.challenge;
    await sql('UPDATE challenges SET expires_at = ? WHERE id = ?', past(), ch.id);
    await call(a, 'syncLadder');
    expect(await ent('Challenge', ch.id)).toMatchObject({ status: 'expired', penalty_rating: 12, penalty_reason: 'expired_down', challenger_rating_gain: 0 });
    expect(await ent('Player', b.player.id)).toMatchObject({ singles_rating: 1388, singles_rank: 3 });
    expect(await ent('Player', a.player.id)).toMatchObject({ singles_rating: 1401, xp: 0 });
  });

  it('at most one ducking penalty per defender per 7 days', async () => {
    const [, b, c, d] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4');
    const ch1 = (await single(c, b)).body.challenge;
    expect((await answer(b, ch1, 'decline')).body.challenge.penalty_rating).toBe(12);
    await rate(d, 1300); // rated below b: an upward challenge that would normally cost b
    const ch2 = (await single(d, b)).body.challenge;
    expect(ch2.direction).toBe('up');
    const pv = (await call(b, 'challengePenaltyPreview', { challenge_id: ch2.id })).body;
    expect(pv.expire).toMatchObject({ penalty: 0, reason: 'weekly_penalty_cap', challenger_gain: 0 });
    await sql('UPDATE challenges SET expires_at = ? WHERE id = ?', past(), ch2.id);
    await call(d, 'syncLadder');
    expect(await ent('Challenge', ch2.id)).toMatchObject({ status: 'expired', penalty_rating: 0, penalty_reason: 'weekly_penalty_cap', challenger_rating_gain: 0 });
    expect((await ent('Player', b.player.id)).singles_rating).toBe(1388);
    expect(await ent('Player', d.player.id)).toMatchObject({ singles_rating: 1300, xp: 0 });
  });
});

describe('doubles challenges', () => {
  const four = async () => [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
  const queue = async (u) => (await call(u, 'myQueueCount')).body.challenges;

  it('create rules: four different players, one active doubles challenge, separate from the singles one', async () => {
    const [a, b, c, d] = await four();
    const e = await mkPlayer('Ee5');
    expect((await doubles(a, b, c, b)).status).toBe(400);
    expect((await doubles(a, a, c, d)).status).toBe(400);
    expect((await call(a, 'createChallenge', { format: 'doubles', partner_player_id: b.player.id })).status).toBe(400);
    const r = await doubles(a, b, c, d, { message: 'Sat 2pm?' });
    expect(r.status).toBe(200);
    expect(r.body.challenge).toMatchObject({
      format: 'doubles', status: 'open', challenger_name: 'Aa1', challenger_partner_name: 'Bb2', defender_name: 'Cc3', defender_partner_name: 'Dd4',
      accepted_user_ids: [], message: 'Sat 2pm?',
    });
    expect(r.body.challenge.all_user_ids).toEqual([a.id, b.id, c.id, d.id]);
    expect((await doubles(a, c, b, d)).status).toBe(409); // one active doubles challenge
    expect((await doubles(b, a, c, e)).status).toBe(200); // the partner can send their own
    await seasoned(a, b, c, d, e);
    expect((await single(a, b)).status).toBe(200); // does not block a singles challenge
    // participants can filter on it
    const mine = (await get(`/api/entities/Challenge?filter=${encodeURIComponent(JSON.stringify({ all_user_ids: d.id, format: 'doubles' }))}`)).body.items;
    expect(mine.map((x) => x.id)).toEqual([r.body.challenge.id]);
  });

  it('accepted only once the partner and both opponents accept; the challenger cannot answer', async () => {
    const [a, b, c, d] = await four();
    const outsider = await signUp('z@x.test', 'z');
    const ch = (await doubles(a, b, c, d)).body.challenge;
    expect(await queue(b)).toBe(1);
    expect(await queue(c)).toBe(1);
    expect(await queue(a)).toBe(0);
    expect((await answer(a, ch, 'accept')).status).toBe(403);
    expect((await answer(outsider, ch, 'accept')).status).toBe(403);
    expect((await answer(b, ch, 'accept')).body.challenge).toMatchObject({ status: 'open', accepted_user_ids: [b.id] });
    expect((await answer(b, ch, 'accept')).status).toBe(400);
    expect(await queue(b)).toBe(0);
    await answer(c, ch, 'accept');
    const r = (await answer(d, ch, 'accept')).body.challenge;
    expect(r).toMatchObject({ status: 'accepted', accepted_user_ids: [b.id, c.id, d.id] });
    expect(r.responded_at).toBeTruthy();
    expect(r.expires_at > r.responded_at).toBe(true);
    expect(await queue(d)).toBe(0);
    expect((await answer(c, ch, 'decline')).status).toBe(400);
  });

  it('one decline closes it, with no penalty for anyone', async () => {
    const [a, b, c, d] = await four();
    const ch = (await doubles(a, b, c, d)).body.challenge;
    await answer(b, ch, 'accept');
    const r = (await answer(d, ch, 'decline')).body.challenge;
    expect(r).toMatchObject({ status: 'declined', declined_by_user_id: d.id, penalty_reason: null });
    for (const p of [a, b, c, d]) expect(await ent('Player', p.player.id)).toMatchObject({ singles_rating: 1400, doubles_rating: 1400, xp: 0 });
    expect((await answer(c, ch, 'accept')).status).toBe(400);
    expect((await doubles(a, b, c, d)).status).toBe(200); // closed: a may send another
  });

  it('expiry just closes it: no penalty, no walkover, no unanswered strike', async () => {
    const [a, b, c, d] = await four();
    await seasoned(a, b, c, d);
    const ch = (await doubles(a, b, c, d)).body.challenge;
    await answer(c, ch, 'accept');
    await sql('UPDATE challenges SET expires_at = ? WHERE id = ?', past(), ch.id);
    expect((await answer(d, ch, 'accept')).status).toBe(400);
    expect((await call(a, 'syncLadder')).body.expired_challenges).toBe(1);
    expect(await ent('Challenge', ch.id)).toMatchObject({ status: 'expired', penalty_reason: null, challenger_rating_gain: 0 });
    for (const p of [a, b, c, d]) {
      expect(await ent('Player', p.player.id)).toMatchObject({ singles_rating: 1400, doubles_rating: 1400, xp: 0, unanswered_challenges: 0 });
    }
  });

  it('a verified match between exactly those pairs completes it at challenge stakes', async () => {
    const [a, b, c, d] = await four();
    const ch = (await doubles(a, b, c, d)).body.challenge;
    for (const u of [b, c, d]) await answer(u, ch, 'accept');
    // stakes preview for the accepted challenge, from any of the four
    const st = await call(c, 'matchStakes', { challenge_id: ch.id });
    expect(st.body).toMatchObject({ format: 'doubles', challenge: true });
    expect(st.body.players.find((x) => x.you).side).toBe('a');
    expect((await call(await mkPlayer('Ee5'), 'matchStakes', { challenge_id: ch.id })).status).toBe(403);
    const side = (...ps) => ps.map((p) => ({ player_id: p.player.id }));
    const games = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
    // a match with different pairs does not count
    const other = (await call(a, 'submitMatch', { format: 'doubles', target: 11, side_a: side(a, c), side_b: side(b, d), games })).body.match;
    for (const u of [b, c, d]) await call(u, 'respondMatch', { match_id: other.id, decision: 'accept' });
    expect((await ent('Challenge', ch.id)).status).toBe('accepted');
    // the defenders record it, pairs in any order
    const m = (await call(d, 'submitMatch', { format: 'doubles', target: 11, side_a: side(d, c), side_b: side(b, a), games })).body.match;
    const pv = await call(a, 'matchStakes', { match_id: m.id });
    expect(pv.body.challenge).toBe(true);
    for (const u of [a, b, c]) await call(u, 'respondMatch', { match_id: m.id, decision: 'accept' });
    const vm = await ent('Match', m.id);
    expect(vm.status).toBe('verified');
    expect(vm.rating_changes.every((x) => x.challenge === CHALLENGE_STAKES)).toBe(true);
    expect((await ent('Challenge', ch.id)).status).toBe('completed');
    expect((await ent('Match', other.id)).rating_changes.every((x) => x.challenge === 1)).toBe(true);
  });
});

describe('doubles challenge emails', () => {
  it('everyone involved hears about it, in doubles words', async () => {
    const ps = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    for (const p of ps) await sql('UPDATE "user" SET emailVerified = 1 WHERE id = ?', p.id);
    const [a, b, c, d] = ps;
    const subjects = (msgs) => msgs.map((m) => `${m.to}: ${m.subject}`).sort();
    const ch = (await doubles(a, b, c, d)).body.challenge;
    const got = await compose(env, 'challenge_received', { challenge_id: ch.id, actor_user_id: a.id });
    expect(subjects(got)).toEqual(['bb2@x.test', 'cc3@x.test', 'dd4@x.test'].map((t) => `${t}: Aa1 challenged you to doubles`));
    expect(got.find((m) => m.to === 'bb2@x.test').text).toContain('Aa1 wants you as their partner in a doubles challenge: Aa1 & Bb2 vs Cc3 & Dd4.');
    expect(got.find((m) => m.to === 'cc3@x.test').text).toContain('Aa1 challenged you to doubles: Aa1 & Bb2 vs Cc3 & Dd4.');
    await answer(c, ch, 'decline');
    const dec = await compose(env, 'challenge_declined', { challenge_id: ch.id, actor_user_id: c.id });
    expect(subjects(dec)).toEqual(['aa1@x.test', 'bb2@x.test', 'dd4@x.test'].map((t) => `${t}: Cc3 declined the doubles challenge`));
    const ch2 = (await doubles(a, b, c, d)).body.challenge;
    for (const u of [b, c, d]) await answer(u, ch2, 'accept');
    expect(subjects(await compose(env, 'challenge_accepted', { challenge_id: ch2.id, actor_user_id: d.id })))
      .toEqual(['aa1@x.test', 'bb2@x.test', 'cc3@x.test'].map((t) => `${t}: Doubles challenge on`));
    await sql("UPDATE challenges SET status = 'expired' WHERE id = ?", ch2.id);
    expect((await compose(env, 'challenge_expired', { challenge_ids: [ch2.id] }))[0].text).toContain('The doubles challenge Aa1 & Bb2 vs Cc3 & Dd4 ran out of time.');
  });
});
