import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { app, appWith, env, dispose, reset, signUp, call, get, mkPlayer, makeAdmin } from './helpers.js';
import worker from '../src/worker.js';
import { hashPassword, verifyPassword } from '../src/password.js';

beforeEach(reset);
afterAll(() => dispose());
const past = () => new Date(Date.now() - 3600e3).toISOString();
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();

const games = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
const submit = (u, p, q, extra = {}) =>
  call(u, 'submitMatch', {
    format: 'singles', target: 11, side_a: [{ player_id: p.id }], side_b: [{ player_id: q.id }], games, ...extra,
  });

describe('auth + health', () => {
  it('health and session shape', async () => {
    expect((await get('/api/health')).body).toEqual({ ok: true });
    const u = await signUp('a@x.test', 'alice');
    const s = await get('/api/auth/get-session', u);
    expect(s.body.user).toMatchObject({ email: 'a@x.test', name: 'alice', role: 'user' });
  });
  it('nobody is auto-promoted by email; admin only via the DB role', async () => {
    const u = await signUp('admin@penged.test', 'boss');
    expect((await get('/api/auth/get-session', u)).body.user.role).toBe('user');
    await makeAdmin(u);
    expect((await get('/api/auth/get-session', u)).body.user.role).toBe('admin');
  });
  it('functions require a session', async () => {
    const r = await call(null, 'syncLadder');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'Sign in required' });
    expect((await call(await signUp('z@x.test', 'z'), 'nope')).status).toBe(404);
  });
});

describe('players', () => {
  it('create, uniqueness, validation, update', async () => {
    const a = await mkPlayer('Alice');
    expect(a.player).toMatchObject({ singles_rating: 1400, doubles_rating: 1400, singles_rank: 1, xp: 0, level: 1, display_name: 'Alice' });
    const b = await signUp('b@x.test', 'bob');
    expect((await call(b, 'createPlayer', { username: 'alice' })).status).toBe(409);
    expect((await call(b, 'createPlayer', { username: 'x' })).status).toBe(400);
    expect((await call(b, 'createPlayer', { username: 'bad name' })).status).toBe(400);
    expect((await call(b, 'createPlayer', { username: 'Bobby', avatar_url: 'javascript:alert(1)' })).status).toBe(400);
    const ok = await call(b, 'createPlayer', { username: 'Bobby' });
    expect(ok.body.player.singles_rank).toBe(2);
    expect((await call(b, 'createPlayer', { username: 'Bobby2' })).status).toBe(409);
    const up = await call(b, 'updatePlayer', { bio: 'hi', display_name: 'Bob B' });
    expect(up.body.player).toMatchObject({ bio: 'hi', display_name: 'Bob B' });
    expect((await call(b, 'updatePlayer', { username: 'ALICE' })).status).toBe(409);
    expect((await call(b, 'updatePlayer', { bio: 'x'.repeat(281) })).status).toBe(400);
  });
});

describe('match flow', () => {
  it('submit, accept, verify with ratings, xp and rating-derived ranks', async () => {
    const a = await mkPlayer('Alice'); // rank 1
    const b = await mkPlayer('Bobby'); // rank 2
    // Bob (rank 2) submits and wins; Alice must confirm
    const sub = await call(b, 'submitMatch', {
      format: 'singles', target: 11, side_a: [{ player_id: b.player.id }], side_b: [{ player_id: a.player.id }], games,
    });
    expect(sub.status).toBe(200);
    const m = sub.body.match;
    expect(m).toMatchObject({ status: 'pending', winner_side: 'a', games_a: 2, games_b: 0, accepted_user_ids: [b.id] });
    expect(m.side_a[0]).toMatchObject({ user_id: b.id, username: 'Bobby', paddle: 'default' });
    // non-participant cannot respond
    const c = await mkPlayer('Carol');
    expect((await call(c, 'respondMatch', { match_id: m.id, decision: 'accept' })).status).toBe(403);
    // already accepted submitter can't respond again
    expect((await call(b, 'respondMatch', { match_id: m.id, decision: 'accept' })).status).toBe(400);
    const acc = await call(a, 'respondMatch', { match_id: m.id, decision: 'accept' });
    expect(acc.status).toBe(200);
    expect(acc.body.match.status).toBe('verified');
    const rc = acc.body.match.rating_changes;
    expect(rc.find((x) => x.player_id === b.player.id)).toMatchObject({ before: 1400, after: 1427, delta: 27, xp_gained: 25 + 25 + 10 + 10 });
    expect(rc.find((x) => x.player_id === a.player.id)).toMatchObject({ delta: -27, xp_gained: 25 + 10 });
    const players = (await get('/api/entities/Player?sort=singles_rank')).body.items;
    expect(players.map((p) => [p.username, p.singles_rank])).toEqual([['Bobby', 1], ['Carol', 2], ['Alice', 3]]);
    expect(players[0]).toMatchObject({ singles_wins: 1, xp: 70, level: 2, singles_rating: 1427, singles_win_streak: 1, singles_best_streak: 1 });
    expect(players[2]).toMatchObject({ singles_losses: 1, xp: 35, singles_rating: 1373, singles_win_streak: 0 });
    // second response after verification is rejected
    expect((await call(a, 'respondMatch', { match_id: m.id, decision: 'accept' })).status).toBe(400);
  });

  it('repeat meetings shrink the gain', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const play = async () => {
      const s = await submit(a, a.player, b.player);
      return (await call(b, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match.rating_changes;
    };
    const first = await play();
    const second = await play();
    const d = (rc, id) => rc.find((x) => x.player_id === id).delta;
    expect(d(first, a.player.id)).toBe(27);
    expect(d(second, a.player.id)).toBeLessThan(d(first, a.player.id));
  });

  it('decline and dispute; validation errors', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const m1 = (await submit(a, a.player, b.player)).body.match;
    expect((await call(b, 'respondMatch', { match_id: m1.id, decision: 'decline' })).body.match.status).toBe('declined');
    const m2 = (await submit(a, a.player, b.player)).body.match;
    expect((await call(b, 'respondMatch', { match_id: m2.id, decision: 'dispute' })).body.match.status).toBe('disputed');
    expect((await get('/api/entities/Player?sort=singles_rank')).body.items[0].singles_wins).toBe(0);
    const bad1 = await submit(a, a.player, b.player, { games: [{ a: 11, b: 10 }] });
    expect(bad1).toMatchObject({ status: 400, body: { error: 'A game at 11 needs a two-point lead.' } });
    expect((await submit(a, a.player, a.player)).status).toBe(400);
    expect((await submit(b, a.player, b.player)).status).toBe(400); // submitter not in side_a
    expect((await submit(a, a.player, { id: 'ghost' })).status).toBe(400);
  });

  it('doubles needs all four sign-offs and never moves the ladder', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    const s = await call(d, 'submitMatch', {
      format: 'doubles', target: 21, side_a: [{ player_id: d.player.id }, { player_id: c.player.id }],
      side_b: [{ player_id: a.player.id }, { player_id: b.player.id }], games: [{ a: 21, b: 15 }],
    });
    expect(s.status).toBe(200);
    const id = s.body.match.id;
    expect((await call(a, 'respondMatch', { match_id: id, decision: 'accept' })).body.match.status).toBe('pending');
    expect((await call(b, 'respondMatch', { match_id: id, decision: 'accept' })).body.match.status).toBe('pending');
    const last = await call(c, 'respondMatch', { match_id: id, decision: 'accept' });
    expect(last.body.match.status).toBe('verified');
    const ps = (await get('/api/entities/Player?sort=singles_rank')).body.items;
    expect(ps.map((p) => p.username)).toEqual(['Aa1', 'Bb2', 'Cc3', 'Dd4']);
    expect(ps.find((p) => p.username === 'Dd4')).toMatchObject({ doubles_wins: 1, doubles_game_wins: 1, doubles_game_losses: 0, singles_game_wins: 0, doubles_rating: 1413, singles_rating: 1400 });
  });
});

describe('challenges', () => {
  it('create rules and respond', async () => {
    const ps = [];
    for (const n of ['Aa1', 'Bb2', 'Cc3', 'Dd4', 'Ee5']) ps.push(await mkPlayer(n));
    const [a, b, c, d, e] = ps;
    expect((await call(e, 'createChallenge', { defender_player_id: a.player.id })).status).toBe(400); // 4 above
    expect((await call(e, 'createChallenge', { defender_player_id: e.player.id })).status).toBe(400);
    expect((await call(a, 'createChallenge', { defender_player_id: e.player.id })).status).toBe(400); // below
    const ch = await call(e, 'createChallenge', { defender_player_id: b.player.id, message: 'bring it' });
    expect(ch.status).toBe(200);
    expect(ch.body.challenge).toMatchObject({ status: 'open', challenger_rank: 5, defender_rank: 2, defender_name: 'Bb2' });
    expect((await call(e, 'createChallenge', { defender_player_id: c.player.id })).status).toBe(409);
    expect((await call(c, 'respondChallenge', { challenge_id: ch.body.challenge.id, decision: 'accept' })).status).toBe(403);
    const r = await call(b, 'respondChallenge', { challenge_id: ch.body.challenge.id, decision: 'accept' });
    expect(r.body.challenge.status).toBe('accepted');
    expect((await get('/api/entities/Player/' + b.player.id)).body.xp).toBe(0); // responding earns no XP
    expect(r.body.challenge.expires_at > r.body.challenge.responded_at).toBe(true);
    expect((await call(b, 'respondChallenge', { challenge_id: ch.body.challenge.id, decision: 'decline' })).status).toBe(400);
    void d;
  });

  it('expires pending matches', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const m = (await submit(a, a.player, b.player)).body.match;
    await sql('UPDATE matches SET expires_at = ?', past());
    expect((await call(b, 'respondMatch', { match_id: m.id, decision: 'accept' })).status).toBe(400);
    expect((await call(a, 'syncLadder')).body.expired_matches).toBe(1);
    expect((await get('/api/entities/Match/' + m.id)).body.status).toBe('expired');
  });
});

describe('challenge penalties', () => {
  const ent = async (name, id) => (await get(`/api/entities/${name}/${id}`)).body;
  const order = async () => (await get('/api/entities/Player?sort=singles_rank')).body.items.map((p) => p.username);
  const expire = (id) => sql('UPDATE challenges SET expires_at = ? WHERE id = ?', past(), id);
  const trio = async () => {
    const admin = await signUp('admin@penged.test', 'boss');
    await makeAdmin(admin);
    return { admin, a: await mkPlayer('Aa1'), b: await mkPlayer('Bb2'), c: await mkPlayer('Cc3') };
  };
  /** Insert a verified singles match between two players, `ago` ms in the past. */
  const verified = (p, q, ago = 3600e3, format = 'singles') => sql(
    `INSERT INTO matches (id, format, target, side_a, side_b, games, games_a, games_b, winner_side, status, all_player_ids, all_user_ids,
       accepted_user_ids, verified_at, created_date, updated_date) VALUES (?,?,11,'[]','[]','[]',2,0,'a','verified',?,'[]','[]',?,?,?)`,
    crypto.randomUUID(), format, JSON.stringify([p.player.id, q.player.id]), new Date(Date.now() - ago).toISOString(),
    new Date(Date.now() - ago).toISOString(), new Date(Date.now() - ago).toISOString());

  it('decline: defender loses half the dodge and drops below the equal-rated players; idempotent', async () => {
    const { a, b, c } = await trio();
    const ch = (await call(c, 'createChallenge', { defender_player_id: b.player.id })).body.challenge;
    const pv = await call(b, 'challengePenaltyPreview', { challenge_id: ch.id });
    expect(pv.body.decline).toMatchObject({ penalty: 12, reason: 'declined', drops_rank: true, rank_after: 3 });
    expect(pv.body.expire.penalty).toBe(24);
    expect((await call(c, 'challengePenaltyPreview', { challenge_id: ch.id })).status).toBe(403);
    const r = await call(b, 'respondChallenge', { challenge_id: ch.id, decision: 'decline' });
    expect(r.body.challenge).toMatchObject({ status: 'declined', penalty_rating: 12, penalty_rank_before: 2, penalty_rank_after: 3, penalty_reason: 'declined', reversed: false });
    expect(r.body.challenge.penalized_at).toBeTruthy();
    expect((await ent('Player', b.player.id)).singles_rating).toBe(1388);
    expect((await ent('Player', c.player.id)).singles_rating).toBe(1400);
    expect(await order()).toEqual(['Aa1', 'Cc3', 'Bb2']);
    expect((await call(b, 'respondChallenge', { challenge_id: ch.id, decision: 'decline' })).status).toBe(400);
    expect((await ent('Player', b.player.id)).singles_rating).toBe(1388);
    void a;
  });

  it('expiry: defender loses P, challenger gains P (+15 xp walkover), ranks follow rating, cron + syncLadder penalise once', async () => {
    const { a, c } = await trio();
    const ch = (await call(c, 'createChallenge', { defender_player_id: a.player.id })).body.challenge; // rank gap 2
    await expire(ch.id);
    const pending = [];
    await worker.scheduled({}, env, { waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
    const sync = await call(c, 'syncLadder');
    expect(sync.body.expired_challenges).toBe(0);
    const row = await ent('Challenge', ch.id);
    expect(row).toMatchObject({ status: 'expired', penalty_rating: 19, penalty_reason: 'expired', penalty_rank_before: 1, penalty_rank_after: 3, challenger_rating_gain: 19 });
    expect((await ent('Player', a.player.id)).singles_rating).toBe(1381);
    const chal = await ent('Player', c.player.id);
    expect(chal).toMatchObject({ singles_rating: 1419, xp: 15, singles_rank: 1 });
    expect(await order()).toEqual(['Cc3', 'Bb2', 'Aa1']);
    expect((await ent('Player', a.player.id)).unanswered_challenges).toBe(1);
  });

  it('a verified match between the pair in the last 7 days waives a decline (no loss, no drop) but starts the cooldown', async () => {
    const { b, c } = await trio();
    await verified(b, c, 2 * 86400e3);
    const ch = (await call(c, 'createChallenge', { defender_player_id: b.player.id })).body.challenge;
    expect((await call(b, 'challengePenaltyPreview', { challenge_id: ch.id })).body.decline).toMatchObject({ penalty: 0, reason: 'waived_recent_match', drops_rank: false });
    const r = (await call(b, 'respondChallenge', { challenge_id: ch.id, decision: 'decline' })).body.challenge;
    expect(r).toMatchObject({ status: 'declined', penalty_rating: 0, penalty_reason: 'waived_recent_match', penalty_rank_before: 2, penalty_rank_after: 2 });
    expect(await order()).toEqual(['Aa1', 'Bb2', 'Cc3']);
    expect((await ent('Player', b.player.id)).singles_rating).toBe(1400);
    const again = await call(c, 'createChallenge', { defender_player_id: b.player.id });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/challenged Bb2 recently.*again after .* UTC/);
    // an old match (8 days) does not waive
  });

  it('an 8-day-old match does not waive; repeat meetings reduce the cost', async () => {
    const { b, c } = await trio();
    await verified(b, c, 8 * 86400e3);
    const ch = (await call(c, 'createChallenge', { defender_player_id: b.player.id })).body.challenge;
    // 1 earlier meeting in 180d: repeatFactor 0.3 + 0.7/1.75 = 0.7 => 12 * 0.7 = 8.4 -> 8
    expect((await call(b, 'respondChallenge', { challenge_id: ch.id, decision: 'decline' })).body.challenge.penalty_rating).toBe(8);
  });

  it('fatigue: 3+ verified matches in 7 days halve a decline', async () => {
    const { a, b, c } = await trio();
    for (let i = 0; i < 3; i++) await verified(b, a, (i + 1) * 3600e3);
    const ch = (await call(c, 'createChallenge', { defender_player_id: b.player.id })).body.challenge;
    // facts: 3 matches, K48 (0 played in wins/losses columns), repeat vs c none, pair c-b none
    const r = (await call(b, 'respondChallenge', { challenge_id: ch.id, decision: 'decline' })).body.challenge;
    expect(r).toMatchObject({ penalty_rating: 6, penalty_reason: 'fatigue_halved' });
  });

  it('respects the 700 floor', async () => {
    const { b, c } = await trio();
    await sql('UPDATE players SET singles_rating = 702, doubles_rating = 702 WHERE id = ?', b.player.id);
    await sql('UPDATE players SET singles_rating = 702 WHERE id = ?', c.player.id);
    const ch = (await call(c, 'createChallenge', { defender_player_id: b.player.id })).body.challenge;
    await expire(ch.id);
    await call(c, 'syncLadder');
    expect((await ent('Player', b.player.id)).singles_rating).toBe(700);
    expect((await ent('Challenge', ch.id)).penalty_rating).toBe(2);
    expect((await ent('Player', c.player.id)).singles_rating).toBe(704);
    expect(await order()).toEqual(['Aa1', 'Cc3', 'Bb2']);
  });

  it('admin reverse restores rating, rank and xp; reversing twice and non-admin reversal are rejected', async () => {
    const { admin, a, b, c } = await trio();
    const ch1 = (await call(c, 'createChallenge', { defender_player_id: b.player.id })).body.challenge;
    await call(b, 'respondChallenge', { challenge_id: ch1.id, decision: 'decline' });
    expect((await call(b, 'resolveChallenge', { challenge_id: ch1.id, action: 'reverse' })).status).toBe(403);
    expect((await call(c, 'resolveChallenge', { challenge_id: ch1.id, action: 'reverse' })).status).toBe(403);
    // defender may ask for a review, once; challenger may not
    expect((await call(c, 'resolveChallenge', { challenge_id: ch1.id, action: 'request' })).status).toBe(403);
    expect((await call(b, 'resolveChallenge', { challenge_id: ch1.id, action: 'request' })).body.challenge.review_requested).toBe(true);
    expect((await call(b, 'resolveChallenge', { challenge_id: ch1.id, action: 'request' })).status).toBe(400);
    const rev = await call(admin, 'resolveChallenge', { challenge_id: ch1.id, action: 'reverse' });
    expect(rev.body.challenge.reversed).toBe(true);
    expect((await ent('Player', b.player.id)).singles_rating).toBe(1400);
    expect(await order()).toEqual(['Aa1', 'Bb2', 'Cc3']);
    expect((await call(admin, 'resolveChallenge', { challenge_id: ch1.id, action: 'reverse' })).status).toBe(400);
    // reversing a penalty clears the cooldown
    expect((await call(c, 'createChallenge', { defender_player_id: b.player.id })).status).toBe(200);
    // expiry reverse
    await sql('DELETE FROM challenges WHERE id <> ?', ch1.id);
    const ch2 = (await call(c, 'createChallenge', { defender_player_id: a.player.id })).body.challenge;
    await expire(ch2.id);
    await call(c, 'syncLadder');
    expect(await order()).toEqual(['Cc3', 'Bb2', 'Aa1']);
    expect((await ent('Player', c.player.id)).xp).toBe(15);
    expect((await ent('Player', c.player.id)).singles_rating).toBe(1419);
    await call(admin, 'resolveChallenge', { challenge_id: ch2.id, action: 'reverse' });
    expect((await ent('Player', c.player.id)).xp).toBe(0);
    expect((await ent('Player', c.player.id)).singles_rating).toBe(1400); // walkover gain removed
    expect((await ent('Player', a.player.id)).singles_rating).toBe(1400);
    expect(await order()).toEqual(['Aa1', 'Bb2', 'Cc3']); // ratings back, ranks follow
    expect((await ent('Player', a.player.id)).unanswered_challenges).toBe(0);
  });

  it('an accepted-then-unplayed challenge expiring carries no penalty', async () => {
    const { a, c } = await trio();
    const ch = (await call(c, 'createChallenge', { defender_player_id: a.player.id })).body.challenge;
    await call(a, 'respondChallenge', { challenge_id: ch.id, decision: 'accept' });
    await expire(ch.id);
    await call(c, 'syncLadder');
    expect(await ent('Challenge', ch.id)).toMatchObject({ status: 'expired', penalty_reason: null });
    expect((await ent('Player', a.player.id)).singles_rating).toBe(1400);
    expect(await order()).toEqual(['Aa1', 'Bb2', 'Cc3']);
  });
});

describe('rating-derived ranks', () => {
  const ranks = async () => (await get('/api/entities/Player?sort=singles_rank')).body.items.map((p) => [p.username, p.singles_rank, p.singles_rating]);
  const win = async (w, l) => {
    const s = await submit(w, w.player, l.player);
    return call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' });
  };

  it('a win moves you past everyone you now out-rate, not just the opponent', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2'); const c = await mkPlayer('Cc3');
    await win(c, a); // c 1427, a 1373, b 1400
    expect(await ranks()).toEqual([['Cc3', 1, 1427], ['Bb2', 2, 1400], ['Aa1', 3, 1373]]);
    void b;
  });

  it('a lower-rated winner who stays below the loser does not take the loser spot', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2');
    await sql('UPDATE players SET singles_rating = 1600 WHERE id = ?', a.player.id);
    await sql('UPDATE players SET singles_rating = 1400 WHERE id = ?', b.player.id);
    await call(a, 'syncLadder'); // recompute
    await win(b, a); // upset worth < 200 points
    const r = await ranks();
    expect(r[0][0]).toBe('Aa1');
    expect(r[0][2]).toBeGreaterThan(r[1][2]);
  });

  it('new players join at 1400 in the right position; deleting leaves no gaps', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2');
    await win(a, b); // a 1427, b 1373
    const c = await mkPlayer('Cc3'); // 1400 -> between them
    expect(await ranks()).toEqual([['Aa1', 1, 1427], ['Cc3', 2, 1400], ['Bb2', 3, 1373]]);
    expect(c.player.singles_rank).toBe(2); // derived in the same batch as the insert
    await call(c, 'deleteAccount', { confirm: 'DELETE' });
    expect(await ranks()).toEqual([['Aa1', 1, 1427], ['Bb2', 2, 1373]]);
  });

  it('ties are deterministic: more games played first, then earlier joiner', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2'); const c = await mkPlayer('Cc3');
    expect((await ranks()).map((x) => x[0])).toEqual(['Aa1', 'Bb2', 'Cc3']);
    await sql('UPDATE players SET singles_wins = 3 WHERE id = ?', c.player.id);
    await call(a, 'syncLadder');
    expect((await ranks()).map((x) => x[0])).toEqual(['Cc3', 'Aa1', 'Bb2']);
    void b;
  });

  it('challenge eligibility reads the rating order (1-3 places above)', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2'); const c = await mkPlayer('Cc3');
    await win(c, a); await call(c, 'syncLadder'); // order: Cc3, Bb2, Aa1
    expect((await call(c, 'createChallenge', { defender_player_id: a.player.id })).status).toBe(400); // a is below c now
    const ok = await call(a, 'createChallenge', { defender_player_id: c.player.id }); // 2 above
    expect(ok.status).toBe(200);
    expect(ok.body.challenge).toMatchObject({ challenger_rank: 3, defender_rank: 1 });
    void b;
  });

  it('ranks swap when an expiry walkover makes the points cross', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2');
    await sql('UPDATE players SET singles_rating = 1405 WHERE id = ?', a.player.id);
    await call(a, 'syncLadder');
    const ch = (await call(b, 'createChallenge', { defender_player_id: a.player.id })).body.challenge;
    await sql('UPDATE challenges SET expires_at = ? WHERE id = ?', past(), ch.id);
    await call(b, 'syncLadder');
    const row = (await get('/api/entities/Challenge/' + ch.id)).body;
    expect(row.penalty_rank_before).toBe(1);
    expect(row.penalty_rank_after).toBe(2);
    expect(row.challenger_rating_gain).toBe(row.penalty_rating);
    const r = await ranks();
    expect(r.map((x) => x[0])).toEqual(['Bb2', 'Aa1']);
    expect(r[0][2] - 1400).toBe(row.penalty_rating);
    expect(1405 - r[1][2]).toBe(row.penalty_rating);
  });

  it('migration/recompute SQL equals the pure helper on a mixed roster', async () => {
    const ps = [];
    for (const n of ['Aa1', 'Bb2', 'Cc3', 'Dd4']) ps.push(await mkPlayer(n));
    await sql('UPDATE players SET singles_rating = 1500 WHERE id = ?', ps[3].player.id);
    await sql('UPDATE players SET singles_rating = 1300, singles_wins = 2 WHERE id = ?', ps[0].player.id);
    await sql('UPDATE players SET singles_rating = 1300, singles_wins = 4 WHERE id = ?', ps[1].player.id);
    await call(ps[0], 'syncLadder');
    expect((await ranks()).map((x) => x[0])).toEqual(['Dd4', 'Cc3', 'Bb2', 'Aa1']);
  });
});

describe('streaks and daily bonus', () => {
  const play = async (w, l, extra = {}) => {
    const s = await submit(w, w.player, l.player, extra);
    return (await call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match.rating_changes;
  };
  const part = (rc, id, key) => rc.find((x) => x.player_id === id).xp_parts.find((p) => p.key === key)?.xp;
  const ent = async (id) => (await get('/api/entities/Player/' + id)).body;

  it('win streak increments, best_streak sticks, a loss resets; streak XP applies from 2', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const r1 = await play(a, b);
    expect(part(r1, a.player.id, 'streak')).toBeUndefined();
    const r2 = await play(a, b);
    expect(part(r2, a.player.id, 'streak')).toBe(10);
    const r3 = await play(a, b);
    expect(part(r3, a.player.id, 'streak')).toBe(20);
    expect(await ent(a.player.id)).toMatchObject({ singles_win_streak: 3, singles_best_streak: 3 });
    expect(await ent(b.player.id)).toMatchObject({ singles_win_streak: 0, singles_best_streak: 0 });
    await play(b, a);
    expect(await ent(a.player.id)).toMatchObject({ singles_win_streak: 0, singles_best_streak: 3 });
    expect(await ent(b.player.id)).toMatchObject({ singles_win_streak: 1, singles_best_streak: 1 });
    expect((await get('/api/entities/Player?sort=-singles_best_streak')).body.items[0].singles_best_streak).toBe(3);
  });

  it('first verified match of the UTC day pays once per day per player', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const r1 = await play(a, b);
    expect(part(r1, a.player.id, 'first_of_day')).toBe(10);
    expect(part(r1, b.player.id, 'first_of_day')).toBe(10);
    const r2 = await play(a, b);
    expect(part(r2, a.player.id, 'first_of_day')).toBeUndefined();
    await sql("UPDATE players SET last_match_day = '2000-01-01'");
    const r3 = await play(a, b);
    expect(part(r3, a.player.id, 'first_of_day')).toBe(10);
    expect((await ent(a.player.id)).last_match_day).toBe(new Date().toISOString().slice(0, 10));
  });

  it('skunk, comeback and upset parts show up in the stored breakdown', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    await sql('UPDATE players SET singles_rating = 1650 WHERE id = ?', b.player.id); // loser is 250 higher
    const rc = await play(a, b, { games: [{ a: 9, b: 11 }, { a: 11, b: 0 }, { a: 11, b: 0 }] });
    expect(part(rc, a.player.id, 'upset')).toBe(50);
    expect(part(rc, a.player.id, 'skunk')).toBe(30);
    expect(part(rc, a.player.id, 'comeback')).toBe(15);
    const w = rc.find((x) => x.player_id === a.player.id);
    expect(w).toMatchObject({ win_streak: 1 });
    expect(w.games[1].mov).toBeGreaterThan(1.9); // an 11-0 game is dominance 1
    expect(w.xp_gained).toBe(w.xp_parts.reduce((n, p) => n + p.xp, 0));
  });
});

describe('entity layer', () => {
  it('filters, operators, sorting, arrays, counts, errors', async () => {
    const ps = [];
    for (const n of ['Aa1', 'Bb2', 'Cc3', 'Dd4']) ps.push(await mkPlayer(n));
    const q = (e, f, extra = '') => get(`/api/entities/${e}?filter=${encodeURIComponent(JSON.stringify(f))}${extra}`);
    const range = await q('Player', { singles_rank: { $gte: 2, $lte: 3 } }, '&sort=singles_rank');
    expect(range.body.items.map((p) => p.username)).toEqual(['Bb2', 'Cc3']);
    expect((await q('Player', { username_lower: 'dd4' })).body.items).toHaveLength(1);
    expect((await q('Player', { singles_rank: { $in: [1, 4] } }, '&sort=-singles_rank')).body.items.map((p) => p.username)).toEqual(['Dd4', 'Aa1']);
    expect((await q('Player', { singles_rank: { $ne: 1 } })).body.items).toHaveLength(3);
    expect((await get('/api/entities/Player/count')).body).toEqual({ count: 4 });
    expect((await get('/api/entities/Player/count?filter=' + encodeURIComponent('{"singles_rank":{"$gt":2}}'))).body).toEqual({ count: 2 });
    expect((await get('/api/entities/Player?limit=2&skip=1&sort=singles_rank')).body.items.map((p) => p.singles_rank)).toEqual([2, 3]);
    // matches: array contains, default sort -created_date
    const [a, b, c] = ps;
    const m1 = (await submit(a, a.player, b.player)).body.match;
    const m2 = (await submit(a, a.player, c.player)).body.match;
    const mine = await q('Match', { all_user_ids: b.id });
    expect(mine.body.items.map((m) => m.id)).toEqual([m1.id]);
    expect((await q('Match', { all_user_ids: a.id })).body.items.map((m) => m.id)).toEqual([m2.id, m1.id]);
    expect((await q('Match', { all_player_ids: c.player.id, status: 'pending' })).body.items).toHaveLength(1);
    expect((await q('Match', { all_player_ids: c.player.id, status: 'verified' })).body.items).toHaveLength(0);
    expect((await get('/api/entities/Match?sort=created_date')).body.items.map((m) => m.id)).toEqual([m1.id, m2.id]);
    expect((await get('/api/entities/Match/' + m1.id)).body.id).toBe(m1.id);
    expect((await get('/api/entities/Match/nope')).status).toBe(404);
    expect((await get('/api/entities/Nope')).status).toBe(404);
    // rejections
    expect((await q('Player', { password: 'x' })).status).toBe(400);
    expect((await q('Player', { singles_rank: { $regex: 'x' } })).status).toBe(400);
    expect((await q('Player', { singles_rank: 'abc' })).status).toBe(400);
    expect((await q('Player', { 'username"; drop table players; --': 1 })).status).toBe(400);
    expect((await get('/api/entities/Player?sort=email')).status).toBe(400);
    expect((await get('/api/entities/Player?filter=%7Bnotjson')).status).toBe(400);
    expect(JSON.stringify((await get('/api/entities/Player')).body)).not.toContain('@x.test');
  });
});

describe('uploads', () => {
  it('requires a session, stores and serves an image, rejects non-images', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const mk = (buf, type) => {
      const fd = new FormData();
      fd.append('file', new File([buf], 'a.png', { type }));
      return fd;
    };
    expect((await app.request('/api/uploads', { method: 'POST', body: mk(png, 'image/png') })).status).toBe(401);
    const u = await signUp('up@x.test', 'up');
    const res = await app.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: mk(png, 'image/png') });
    expect(res.status).toBe(200);
    const { file_url } = await res.json();
    expect(file_url).toMatch(/^\/api\/files\/[0-9a-f-]{36}\.png$/);
    const got = await app.request(file_url);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await got.arrayBuffer()).equals(png)).toBe(true);
    expect((await app.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: mk(Buffer.from('<svg/>'), 'image/svg+xml') })).status).toBe(400);
    expect((await app.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: mk(Buffer.from('hello'), 'image/png') })).status).toBe(400);
    expect((await app.request('/api/files/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
    // avatar via upload path accepted
    expect((await call(u, 'createPlayer', { username: 'Upper', avatar_url: file_url })).status).toBe(200);
  });
});

describe('deleteAccount', () => {
  it('requires confirm, removes player/pending/open items, keeps verified history, compacts ranks', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const c = await mkPlayer('Carol');
    const done = (await submit(b, b.player, a.player)).body.match;
    await call(a, 'respondMatch', { match_id: done.id, decision: 'accept' });
    const pending = (await submit(a, a.player, c.player)).body.match;
    await call(c, 'createChallenge', { defender_player_id: b.player.id }); // c involved in open challenge? c is rank 3 -> b rank 1 is 2 above
    expect((await call(a, 'deleteAccount', {})).status).toBe(400);
    expect((await call(a, 'deleteAccount', { confirm: 'delete' })).status).toBe(400);
    const del = await call(a, 'deleteAccount', { confirm: 'DELETE' });
    expect(del.body).toEqual({ ok: true });
    expect((await get('/api/entities/Match/' + pending.id)).status).toBe(404);
    expect((await get('/api/entities/Match/' + done.id)).body.status).toBe('verified');
    const ranks = (await get('/api/entities/Player?sort=singles_rank')).body.items.map((p) => [p.username, p.singles_rank]);
    expect(ranks).toEqual([['Bobby', 1], ['Carol', 2]]);
    expect((await env.DB.prepare('SELECT 1 FROM "user" WHERE id = ?').bind(a.id).all()).results).toHaveLength(0);
    expect((await get('/api/auth/get-session', a)).body).toBeNull();
    // deleting b removes the open challenge it was defender of
    await call(b, 'deleteAccount', { confirm: 'DELETE' });
    expect((await get('/api/entities/Challenge/count?filter=' + encodeURIComponent('{"status":"open"}'))).body.count).toBe(0);
  });
});

describe('atomicity / races (D1 batch guards)', () => {
  it('concurrent challenges from one challenger: exactly one succeeds', async () => {
    const [a, b, c] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3')];
    void a;
    const rs = await Promise.all([
      call(c, 'createChallenge', { defender_player_id: a.player.id }),
      call(c, 'createChallenge', { defender_player_id: b.player.id }),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await get('/api/entities/Challenge/count')).body.count).toBe(1);
  });

  it('concurrent final accepts on a doubles match verify exactly once', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    const s = await call(d, 'submitMatch', {
      format: 'doubles', target: 11, side_a: [{ player_id: d.player.id }, { player_id: c.player.id }],
      side_b: [{ player_id: a.player.id }, { player_id: b.player.id }], games,
    });
    const id = s.body.match.id;
    await Promise.all([a, b, c].map((u) => call(u, 'respondMatch', { match_id: id, decision: 'accept' })));
    const m = (await get('/api/entities/Match/' + id)).body;
    expect(m.status).toBe('verified');
    expect(m.rating_changes).toHaveLength(4);
    const ps = (await get('/api/entities/Player')).body.items;
    expect(ps.every((p) => p.doubles_wins + p.doubles_losses === 1)).toBe(true);
    expect(ps.reduce((n, p) => n + p.xp, 0)).toBe(2 * (25 + 25 + 10 + 10) + 2 * (25 + 10));
  });

  it('a stale guard rolls back the whole batch', async () => {
    const { guard, stmt, commit, ConflictError } = await import('../src/db.js');
    const before = (await env.DB.prepare("SELECT value FROM meta WHERE key = 'ladder_version'").first()).value;
    await expect(commit(env, [
      stmt(env, "UPDATE meta SET value = value + 100 WHERE key = 'ladder_version'"),
      guard(env, '0 = 1'),
    ])).rejects.toBeInstanceOf(ConflictError);
    const v = await env.DB.prepare("SELECT value FROM meta WHERE key = 'ladder_version'").first();
    expect(v.value).toBe(before);
  });
});

describe('password hashing (PBKDF2)', () => {
  it('hashes, verifies, salts and honours stored iterations', async () => {
    const h = await hashPassword('correct horse');
    expect(h).toMatch(/^pbkdf2\$20000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassword({ hash: h, password: 'correct horse' })).toBe(true);
    expect(await verifyPassword({ hash: h, password: 'wrong' })).toBe(false);
    expect(await hashPassword('correct horse')).not.toBe(h); // random salt
    // a hash stored with a different iteration count still verifies (and a tampered one does not)
    const [, , salt, hash] = h.split('$');
    expect(await verifyPassword({ hash: `pbkdf2$30000$${salt}$${hash}`, password: 'correct horse' })).toBe(false);
    expect(await verifyPassword({ hash: 'scrypt$x$y', password: 'x' })).toBe(false);
    expect(await verifyPassword({ hash: 'pbkdf2$999999999$a$b', password: 'x' })).toBe(false);
  });
  it('sign-in works end to end and stores a pbkdf2 hash', async () => {
    await signUp('pw@x.test', 'pw');
    const row = await env.DB.prepare(`SELECT password FROM account WHERE providerId = 'credential'`).first();
    expect(row.password).toMatch(/^pbkdf2\$/);
    const ok = await app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787' }, body: JSON.stringify({ email: 'pw@x.test', password: 'password123' }) });
    expect(ok.status).toBe(200);
    const bad = await app.request('/api/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787' }, body: JSON.stringify({ email: 'pw@x.test', password: 'nope-nope-nope' }) });
    expect(bad.status).toBe(401);
  });
});

describe('base URL derived from the request when BETTER_AUTH_URL is unset', () => {
  it('uses the request origin for auth links and CORS; foreign origins are not allowed', async () => {
    const a = appWith({ BETTER_AUTH_URL: undefined, TRUSTED_ORIGINS: 'http://other.example' });
    const hdr = (origin) => ({ 'Content-Type': 'application/json', Origin: origin });
    const ok = await a.request('http://my.site.example/api/auth/sign-up/email', {
      method: 'POST', headers: hdr('http://my.site.example'),
      body: JSON.stringify({ email: 'o@x.test', password: 'password123', name: 'o' }),
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://my.site.example');
    const evil = await a.request('http://my.site.example/api/health', { headers: { Origin: 'http://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const extra = await a.request('http://my.site.example/api/health', { headers: { Origin: 'http://other.example' } });
    expect(extra.headers.get('access-control-allow-origin')).toBe('http://other.example');
  });
});

describe('scheduled handler', () => {
  it('expires overdue challenges via the cron entry', async () => {
    const a = await mkPlayer('Aa1');
    const b = await mkPlayer('Bb2');
    await call(b, 'createChallenge', { defender_player_id: a.player.id });
    await sql('UPDATE challenges SET expires_at = ?', past());
    const pending = [];
    await worker.scheduled({}, env, { waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
    expect((await get('/api/entities/Challenge?filter=' + encodeURIComponent('{"status":"expired"}'))).body.items).toHaveLength(1);
  });
});

describe('avatar storage backends', () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const form = (buf, type = 'image/png') => {
    const fd = new FormData();
    fd.append('file', new File([buf], 'a.png', { type }));
    return fd;
  };
  const big = (n) => Buffer.concat([png, Buffer.alloc(n)]);

  it('D1 path (no R2 binding): stores, serves, caps at 200KB, validates magic bytes', async () => {
    const d1 = appWith({ AVATARS: undefined });
    const u = await signUp('d1@x.test', 'd1');
    const res = await d1.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: form(png) });
    expect(res.status).toBe(200);
    const { file_url } = await res.json();
    const got = await d1.request(file_url);
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await got.arrayBuffer()).equals(png)).toBe(true);
    expect((await d1.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: form(big(210 * 1024)) })).status).toBe(413);
    expect((await d1.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: form(Buffer.from('hello')) })).status).toBe(400);
    expect((await d1.request('/api/files/..%2Fx')).status).toBe(404);
    expect((await d1.request('/api/files/00000000-0000-0000-0000-000000000000.png')).status).toBe(404);
  });

  it('R2 path: accepts up to 2MB (more than the D1 cap), rejects above', async () => {
    const u = await signUp('r2@x.test', 'r2');
    const ok = await app.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: form(big(300 * 1024)) });
    expect(ok.status).toBe(200);
    expect((await app.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: form(big(2 * 1024 * 1024 + 10)) })).status).toBe(413);
  });
});

describe('review fixes', () => {
  const g1 = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
  const single = (u, p, q) => call(u, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: p.id }], side_b: [{ player_id: q.id }], games: g1 });

  it('H1: playing an accepted challenge completes it and frees the challenger', async () => {
    const a = await mkPlayer('Aa1');
    const b = await mkPlayer('Bb2');
    const ch = (await call(b, 'createChallenge', { defender_player_id: a.player.id })).body.challenge;
    await call(a, 'respondChallenge', { challenge_id: ch.id, decision: 'accept' });
    expect((await call(b, 'createChallenge', { defender_player_id: a.player.id })).status).toBe(409);
    const m = (await single(b, b.player, a.player)).body.match;
    await call(a, 'respondMatch', { match_id: m.id, decision: 'accept' });
    expect((await get('/api/entities/Challenge/' + ch.id)).body.status).toBe('completed');
    // challenger (now rank 1) can challenge again once someone is above... at least no 409 lockout:
    const r = await call(b, 'createChallenge', { defender_player_id: a.player.id });
    expect(r.status).toBe(400); // rule violation (a is now below), not the active-challenge 409
  });

  it('H1: a match submitted BEFORE acceptance does not complete the challenge; unplayed accepted challenges expire', async () => {
    const a = await mkPlayer('Aa1');
    const b = await mkPlayer('Bb2');
    const m = (await single(b, b.player, a.player)).body.match; // submitted first
    const ch = (await call(b, 'createChallenge', { defender_player_id: a.player.id })).body.challenge;
    await call(a, 'respondChallenge', { challenge_id: ch.id, decision: 'accept' });
    await call(a, 'respondMatch', { match_id: m.id, decision: 'accept' });
    expect((await get('/api/entities/Challenge/' + ch.id)).body.status).toBe('accepted');
    await sql('UPDATE challenges SET expires_at = ?', past());
    expect((await call(a, 'syncLadder')).body.expired_challenges).toBe(1);
    const row = (await get('/api/entities/Challenge/' + ch.id)).body;
    expect(row.status).toBe('expired');
    // not the defender's fault: no unanswered strike, and no review path
    expect((await get('/api/entities/Player/' + a.player.id)).body.unanswered_challenges).toBe(0);
    expect((await call(a, 'resolveChallenge', { challenge_id: ch.id, action: 'request' })).status).toBe(400);
    expect((await call(b, 'createChallenge', { defender_player_id: a.player.id })).status).not.toBe(409);
  });

  it('M4: only the submitter can cancel a pending match', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const m = (await single(a, a.player, b.player)).body.match;
    expect((await call(b, 'respondMatch', { match_id: m.id, decision: 'cancel' })).status).toBe(403);
    const c = await call(a, 'respondMatch', { match_id: m.id, decision: 'cancel' });
    expect(c.body.match.status).toBe('cancelled');
    expect((await call(a, 'respondMatch', { match_id: m.id, decision: 'cancel' })).status).toBe(400); // no longer pending
    expect((await call(b, 'respondMatch', { match_id: m.id, decision: 'accept' })).status).toBe(400);
  });

  it('L6: at most 10 pending submissions per user', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    for (let i = 0; i < 10; i++) expect((await single(a, a.player, b.player)).status).toBe(200);
    const r = await single(a, a.player, b.player);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/10 results waiting/);
  });

  it('M5: the flags recompute only writes player rows whose values changed', async () => {
    const { flagsStmt } = await import('../src/functions.js');
    await mkPlayer('Aa1');
    const b = await mkPlayer('Bb2');
    expect((await flagsStmt(env).run()).meta.changes).toBe(0);
    await sql('UPDATE players SET unanswered_challenges = 7 WHERE id = ?', b.player.id);
    expect((await flagsStmt(env).run()).meta.changes).toBe(1);
    expect((await flagsStmt(env).run()).meta.changes).toBe(0);
  });

  it('L3: cross-origin POSTs to functions and uploads are rejected', async () => {
    const u = await signUp('csrf@x.test', 'csrf');
    const bad = await app.request('/api/functions/syncLadder', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie, Origin: 'http://evil.example' }, body: '{}' });
    expect(bad.status).toBe(403);
    const up = await app.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie, Origin: 'http://evil.example' }, body: new FormData() });
    expect(up.status).toBe(403);
    const ok = await app.request('/api/functions/syncLadder', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie, Origin: 'http://localhost:8787' }, body: '{}' });
    expect(ok.status).toBe(200);
    const none = await app.request('/api/functions/syncLadder', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: u.cookie }, body: '{}' });
    expect(none.status).toBe(200); // no Origin = non-browser client
  });

  it('H4: rate limiting (database storage, cf-connecting-ip) throttles sign-in', async () => {
    const rl = appWith({ RATE_LIMIT: 'on' });
    const hdr = { 'Content-Type': 'application/json', Origin: 'http://localhost:8787', 'cf-connecting-ip': '203.0.113.9' };
    const body = JSON.stringify({ email: 'nobody@x.test', password: 'whatever123' });
    const statuses = [];
    for (let i = 0; i < 10; i++) statuses.push((await rl.request('/api/auth/sign-in/email', { method: 'POST', headers: hdr, body })).status);
    expect(statuses.slice(0, 8).every((x) => x === 401)).toBe(true);
    expect(statuses.slice(8)).toEqual([429, 429]);
    // a different client IP is unaffected
    const other = await rl.request('/api/auth/sign-in/email', { method: 'POST', headers: { ...hdr, 'cf-connecting-ip': '203.0.113.10' }, body });
    expect(other.status).toBe(401);
  });

  it('L1/L2: avatar must be your own uploaded file; replaced and account-deleted avatars are removed', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const up = async (u) => {
      const fd = new FormData();
      fd.append('file', new File([png], 'a.png', { type: 'image/png' }));
      return (await (await app.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: fd })).json()).file_url;
    };
    const exists = async (url) => (await app.request(url)).status === 200;
    const u = await signUp('av@x.test', 'av');
    const other = await signUp('av2@x.test', 'av2');
    const mine = await up(u);
    const theirs = await up(other);
    for (const bad of ['https://example.com/x.png', 'http://example.com/x.png', '/api/files/%2e%2e/x.png', '/api/files/../../etc.png',
      '/api/files/00000000-0000-0000-0000-000000000000.png', theirs]) {
      expect((await call(u, 'createPlayer', { username: 'Avy', avatar_url: bad })).status).toBe(400);
    }
    expect((await call(u, 'createPlayer', { username: 'Avy', avatar_url: mine })).status).toBe(200);
    // replacing deletes the old object
    const mine2 = await up(u);
    expect((await call(u, 'updatePlayer', { avatar_url: mine2 })).body.player.avatar_url).toBe(mine2);
    expect(await exists(mine)).toBe(false);
    expect(await exists(mine2)).toBe(true);
    expect((await call(u, 'updatePlayer', { bio: 'same avatar kept' })).status).toBe(200);
    // deleteAccount removes the current avatar
    await call(u, 'deleteAccount', { confirm: 'DELETE' });
    expect(await exists(mine2)).toBe(false);
    expect(await exists(theirs)).toBe(true);
  });
});

describe('rating factors wired through verification', () => {
  const play = async (w, l, extra = {}) => {
    const s = await submit(w, w.player, l.player, extra);
    return (await call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
  };
  const player = async (p) => (await get('/api/entities/Player/' + p.player.id)).body;

  it('stores every factor, paddle edge, and stamps last verified time', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2');
    expect((await player(a)).singles_last_verified_at).toBeNull();
    const m = await play(a, b, { side_a: [{ player_id: a.player.id, paddle: 'modded' }] });
    const w = m.rating_changes.find((x) => x.player_id === a.player.id);
    expect(w).toMatchObject({ rust: 1, challenge: 1, evidence: 1 });
    expect(w.games[0]).toMatchObject({ paddle_edge: -50, rust: 1, challenge: 1, teammate: 1, opp_certainty: 0.8, evidence: 1 });
    expect(w.games[0].k).toBe(48);
    expect(w.games[1].k).toBeLessThan(48); // K eases game by game
    expect(typeof w.repeat).toBe('number');
    expect((await player(a)).singles_last_verified_at).toBeTruthy();
    // second match: K shrinks, certainty grows
    const m2 = await play(a, b);
    const w2 = m2.rating_changes.find((x) => x.player_id === a.player.id);
    expect(w2.games[0].k).toBeLessThan(w.games[1].k);
    expect(w2.games[0].opp_certainty).toBeGreaterThan(0.8);
  });

  it('rust: a long-absent player gets a larger K', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2');
    await play(a, b);
    await sql('UPDATE players SET singles_last_verified_at = ? WHERE id = ?', new Date(Date.now() - 80 * 86400e3).toISOString(), a.player.id);
    const m = await play(a, b);
    expect(m.rating_changes.find((x) => x.player_id === a.player.id).rust).toBeGreaterThan(1.4);
    expect(m.rating_changes.find((x) => x.player_id === b.player.id).rust).toBe(1);
  });

  it('players idle more than 30 days drop off the ranked ladder and re-rank when they play', async () => {
    const a = await mkPlayer('Aa1'); const b = await mkPlayer('Bb2'); const c = await mkPlayer('Cc3');
    await play(a, b);
    await sql('UPDATE players SET singles_last_verified_at = ? WHERE id = ?', new Date(Date.now() - 40 * 86400e3).toISOString(), b.player.id);
    await call(a, 'syncLadder');
    const rows = (await get('/api/entities/Player?sort=singles_rank')).body.items;
    const rk = Object.fromEntries(rows.map((p) => [p.username, p.singles_rank]));
    expect(rk.Bb2).toBeNull();
    expect(rk.Aa1).toBe(1);
    expect(rk.Cc3).toBe(2); // never played: stays ranked
    expect((await call(c, 'createChallenge', { defender_player_id: b.player.id })).status).toBe(400); // not ranked
    await play(b, a);
    const rows2 = (await get('/api/entities/Player?sort=singles_rank')).body.items;
    expect(rows2.find((p) => p.username === 'Bb2').singles_rank).toBeGreaterThan(0);
  });

  it('a match that plays an accepted challenge counts x1.25', async () => {
    const [a, b, c] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3')];
    const ch = (await call(c, 'createChallenge', { defender_player_id: b.player.id })).body.challenge;
    await call(b, 'respondChallenge', { challenge_id: ch.id, decision: 'accept' });
    await new Promise((r) => setTimeout(r, 5));
    const m = await play(c, b);
    expect(m.rating_changes.find((x) => x.player_id === c.player.id).challenge).toBe(1.25);
    const plain = await play(a, b);
    expect(plain.rating_changes.find((x) => x.player_id === a.player.id).challenge).toBe(1);
  });

  it('doubles stores the teammate factor and uses doubles history', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    await sql('UPDATE players SET doubles_rating = 1500 WHERE id = ?', a.player.id);
    const s = await call(a, 'submitMatch', {
      format: 'doubles', target: 11, side_a: [{ player_id: a.player.id }, { player_id: b.player.id }],
      side_b: [{ player_id: c.player.id }, { player_id: d.player.id }], games,
    });
    let m;
    for (const u of [b, c, d]) m = (await call(u, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
    const ra = m.rating_changes.find((x) => x.player_id === a.player.id);
    const rb = m.rating_changes.find((x) => x.player_id === b.player.id);
    expect(ra.games[0].teammate).toBeLessThan(1);
    expect(rb.games[0].teammate).toBeGreaterThan(1);
    expect((await player(a)).doubles_last_verified_at).toBeTruthy();
    expect((await player(a)).singles_last_verified_at).toBeNull();
  });
});
