// Weekly matchmaking ("This week's match"): generation, the mystery opponent, Accept / Decline, the softened matched loss,
// backing out, week-end settlement, emails.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { env, appWith, dispose, reset, call, mkPlayer, seasoned } from './helpers.js';
import { runSyncLadder } from '../src/functions.js';
import { assignMatchups, matchupScore, whyText, topBonus, cappedStakes, softenLoss } from '../src/matchmaking.js';
import { compose } from '../src/notify.js';
import { MATCHUP_NEVER_PLAYED, MATCHUP_DODGE, MATCHUP_TOP_BONUS, MATCHUP_LOSS_RATIO, MAX_DELTA, RATING_FLOOR } from '../src/rating.js';

beforeEach(reset);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => dispose());

const ORIGIN = 'http://localhost:8787';
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const rows = async (q, ...p) => (await env.DB.prepare(q).bind(...p).all()).results;
const one = async (q, ...p) => (await rows(q, ...p))[0];
const ago = (days) => new Date(Date.now() - days * 86400e3).toISOString();
const rating = async (u) => (await one('SELECT singles_rating AS r FROM players WHERE id = ?', u.player.id)).r;
const sync = () => runSyncLadder({ env });
const games = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
/** Players on the singles ladder, ranked in join order (first name = #1). */
const ladder = async (...names) => {
  const ps = [];
  for (const n of names) ps.push(await mkPlayer(n));
  await seasoned(...ps);
  return ps;
};
let mid = 0;
/** A verified ranked singles match between x and y, `days` ago (no rating change: history only). */
const met = (x, y, days) => {
  const at = ago(days);
  const side = (u) => JSON.stringify([{ player_id: u.player.id, user_id: u.id, username: u.player.username, paddle: 'default' }]);
  return sql(`INSERT INTO matches (id, format, target, side_a, side_b, games, games_a, games_b, winner_side, status, all_player_ids, all_user_ids,
      rating_changes, verified_at, created_date, updated_date, ranked) VALUES (?, 'singles', 11, ?, ?, '[]', 2, 0, 'a', 'verified', ?, ?, '[]', ?, ?, ?, 1)`,
  `hist-${++mid}`, side(x), side(y), JSON.stringify([x.player.id, y.player.id]), JSON.stringify([x.id, y.id]), at, at, at);
};
let cid = 0;
/** `ducker` declined a singles challenge from `from`, `days` ago. */
const ducked = (ducker, from, days = 5) => sql(
  `INSERT INTO challenges (id, challenger_user_id, challenger_player_id, challenger_name, defender_user_id, defender_player_id, defender_name,
     status, responded_at, created_date, updated_date, format, all_user_ids, all_player_ids)
   VALUES (?, ?, ?, 'x', ?, ?, 'y', 'declined', ?, ?, ?, 'singles', '[]', '[]')`,
  `duck-${++cid}`, from.id, from.player.id, ducker.id, ducker.player.id, ago(days), ago(days), ago(days));
const pickOf = async (u) => (await one('SELECT opponent_player_id AS o FROM matchups WHERE player_id = ?', u.player.id))?.o;
const rowOf = (u) => one('SELECT * FROM matchups WHERE player_id = ?', u.player.id);
/**
 * Only `u` owes a match this week, to `opp`: the week is generated with just the two of them in the pool (so the frozen
 * stakes are quoted against `opp`), then everyone's ladder position is restored and the other row is dropped.
 */
const only = async (u, opp) => {
  const ranks = await rows('SELECT id, singles_rank FROM players');
  await sql('UPDATE players SET singles_rank = NULL WHERE id NOT IN (?, ?)', u.player.id, opp.player.id);
  await call(u, 'myMatchup');
  for (const r of ranks) await sql('UPDATE players SET singles_rank = ? WHERE id = ?', r.singles_rank, r.id);
  await sql('DELETE FROM matchups WHERE player_id <> ?', u.player.id);
  expect(await pickOf(u)).toBe(opp.player.id);
};
const endWeek = () => sql('UPDATE matchups SET week_end = ?', ago(1 / 1440));
const submit = async (sub, opp) =>
  (await call(sub, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: sub.player.id }], side_b: [{ player_id: opp.player.id }], games })).body.match;
const play = async (sub, opp) => {
  const m = await submit(sub, opp);
  return (await call(opp, 'respondMatch', { match_id: m.id, decision: 'accept' })).body.match;
};
/** Ladder with set ratings (ranked by rating: first = #1). */
const rated = async (...pairs) => {
  const ps = [];
  for (const [n, r] of pairs) {
    const u = await mkPlayer(n);
    await sql('UPDATE players SET singles_rating = ? WHERE id = ?', r, u.player.id);
    ps.push(u);
  }
  await seasoned(...ps);
  return ps;
};
/** Everything in a response that could identify player u. */
const mentions = (body, u) => {
  const t = JSON.stringify(body);
  return [u.player.id, u.id, u.player.username].some((x) => t.includes(x));
};

describe('pair score and assignment (pure)', () => {
  it('never played and dodgers beat rating-close regulars; the top pulls; ratings never enter', () => {
    expect(matchupScore({ lastDays: null })).toBe(MATCHUP_NEVER_PLAYED);
    expect(matchupScore({ lastDays: 1, dodges: 2 })).toBe(1 + 2 * MATCHUP_DODGE);
    expect(matchupScore({ lastDays: 400 })).toBeLessThan(MATCHUP_NEVER_PLAYED);
    expect(topBonus(1)).toBe(MATCHUP_TOP_BONUS);
    expect(topBonus(1)).toBeGreaterThan(topBonus(2));
    expect(topBonus(6)).toBe(0);
    // same facts, deterministic per week, different weeks may break ties differently
    const ps = [{ id: 'a', rank: 3 }, { id: 'b', rank: 4 }, { id: 'c', rank: 5 }];
    const f = () => ({ lastDays: 10 });
    expect(assignMatchups('w1', ps, f)).toEqual(assignMatchups('w1', ps, f));
    expect(assignMatchups('w1', [ps[0]], f)).toEqual([]);
    expect(whyText({ never_played: 1, opponent_rank: 1, dodged_by_them: 2, dodged_by_me: 0 })).toBe("They dodged you twice lately · You've never played · They're #1");
    expect(whyText({ never_played: 0, last_played_days: 41, opponent_rank: 9, dodged_by_them: 0, dodged_by_me: 1 })).toBe('You dodged them once lately · Last played 41 days ago');
  });
});

describe('generation', () => {
  it('is idempotent and race-safe: one row per ranked player, however many ask at once', async () => {
    const ps = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4', 'Ee5');
    const rs = await Promise.all([...ps, ...ps].map((u) => call(u, 'myMatchup')));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect((await rows('SELECT * FROM matchup_weeks')).length).toBe(1);
    expect((await rows('SELECT * FROM matchups')).length).toBe(5); // odd pool: no bye
    expect((await sync()).matchups_assigned).toBe(0);
    expect((await rows('SELECT * FROM matchups')).length).toBe(5);
    const me = rs[0].body;
    expect(me).toMatchObject({ ranked: true, bye: false, matchup: { status: 'open', frozen: true, mystery: true, opponent: null, why: null } });
    expect(me.matchup.max_win).toBeGreaterThan(0);
    expect(me.matchup.max_loss).toBeGreaterThan(0);
    expect(me.matchup.max_loss).toBeLessThan(me.matchup.max_win);
    expect(me.matchup.backout_cost).toBe(Math.min(MAX_DELTA, 2 * me.matchup.max_loss));
    expect(me.matchup.decline_cost).toBe(Math.min(MAX_DELTA, me.matchup.max_loss));
    // frozen at generation: the row carries the shown numbers
    const row = await rowOf(ps[0]);
    expect([row.max_win, row.max_loss, row.loss_factor]).toEqual([me.matchup.max_win, me.matchup.max_loss, me.matchup.loss_factor]);
    expect(new Date(me.deadline).getUTCDay()).toBe(1); // next Monday 00:00 Chicago (05:00 or 06:00 UTC)
  });

  it('cron makes the week too, and unranked players are told how to join', async () => {
    await ladder('Aa1', 'Bb2');
    const n = await mkPlayer('Nn9');
    expect((await sync()).matchups_assigned).toBe(2);
    expect((await call(n, 'myMatchup')).body).toMatchObject({ ranked: false, matchup: null, reason: 'unranked' });
    const list = (await call(null, 'listMatchups')).body;
    expect(list.items.map((x) => [x.player_name, x.mystery, x.opponent_name, x.opponent_player_id, x.opponent_rank]).sort())
      .toEqual([['Aa1', true, null, null, null], ['Bb2', true, null, null, null]]);
  });

  it('picks never-played, then dodgers, over regulars; many can pick the same (top) target', async () => {
    const [a, b, c, d, e, f] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4', 'Ee5', 'Ff6');
    // F has played everyone but D lately: D (never played) beats the #1 regular
    for (const x of [a, b, c, e]) await met(f, x, 1);
    // E has played everyone, but C ducked E twice
    for (const x of [a, b, c, d]) await met(e, x, 1);
    await ducked(c, e, 3);
    await ducked(c, e, 10);
    await sync();
    expect(await pickOf(f)).toBe(d.player.id);
    expect(await pickOf(e)).toBe(c.player.id);
    expect((await rowOf(e))).toMatchObject({ dodged_by_them: 2, never_played: 0, last_played_days: 1, opponent_rank: 3 });
    // B, C, D never played anyone but E/F: all pull to #1 A; A picks #2
    for (const x of [b, c, d]) expect(await pickOf(x)).toBe(a.player.id);
    expect(await pickOf(a)).toBe(b.player.id);
    // nobody has accepted: A's "matched with you" list is empty (it would tip A off)
    expect((await call(a, 'myMatchup')).body.incoming).toEqual([]);
    for (const x of [b, c, d]) expect((await call(x, 'matchupYes')).status).toBe(200);
    const aView = (await call(a, 'myMatchup')).body;
    expect(aView.incoming.map((x) => x.player.username).sort()).toEqual(['Bb2', 'Cc3', 'Dd4']);
    expect((await call(e, 'myMatchup')).body.matchup.why).toBe(null); // a mystery until E accepts
    expect((await call(e, 'matchupYes')).body.matchup.why).toBe("They dodged you twice lately · Last played 1 day ago · They're #3");
  });

  it('a pool of one gets nothing', async () => {
    const [a] = await ladder('Aa1');
    expect((await call(a, 'myMatchup')).body).toMatchObject({ matchup: null, reason: 'alone' });
  });
});

describe('mystery opponent', () => {
  it('until the owner accepts, myMatchup, listMatchups and the target\'s list never reveal the opponent; after, everything does', async () => {
    const [a, b, c] = await ladder('Aa1', 'Bb2', 'Cc3');
    await only(c, a);
    const v = (await call(c, 'myMatchup')).body;
    expect(v.matchup).toMatchObject({ status: 'open', mystery: true, opponent: null, why: null, challenge: null, mutual: false });
    expect(v.matchup.max_win).toBeGreaterThan(v.matchup.max_loss);
    expect(mentions(v, a)).toBe(false);
    const hidden = (await call(null, 'listMatchups')).body.items;
    expect(hidden).toEqual([expect.objectContaining({ player_id: c.player.id, mystery: true, opponent_player_id: null, opponent_name: null, opponent_rank: null })]);
    expect(mentions(hidden, a)).toBe(false);
    expect((await call(a, 'myMatchup')).body.incoming).toEqual([]);
    // accept: revealed everywhere
    const yes = (await call(c, 'matchupYes')).body;
    expect(yes.matchup).toMatchObject({ mystery: false, status: 'waiting', opponent: { id: a.player.id }, why: "You've never played · They're #1" });
    expect(yes.matchup.challenge).toMatchObject({ defender_player_id: a.player.id });
    const shown = (await call(null, 'listMatchups')).body.items;
    expect(shown).toEqual([expect.objectContaining({ mystery: false, opponent_player_id: a.player.id, opponent_name: 'Aa1', opponent_rank: 1 })]);
    expect((await call(a, 'myMatchup')).body.incoming.map((x) => x.player.id)).toEqual([c.player.id]);
    void b;
  });

  it('the public list does not order mystery rows by their opponent', async () => {
    const [a, b, c, d] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4');
    await only(d, b); // only D owes, to #2
    await call(d, 'matchupYes');
    // put back a mystery row for C pointing at #1 (would sort first if ordered by opponent rank)
    await sql(`INSERT INTO matchups (id, week_start, week_end, player_id, user_id, opponent_player_id, opponent_user_id, max_win, max_loss, loss_factor, created_date, updated_date)
      SELECT 'mx', week_start, week_end, ?, ?, ?, ?, 50, 30, 0.8, created_date, updated_date FROM matchups WHERE player_id = ?`, c.player.id, c.id, a.player.id, a.id, d.player.id);
    const items = (await call(null, 'listMatchups')).body.items;
    expect(items.map((x) => [x.player_name, x.mystery])).toEqual([['Dd4', false], ['Cc3', true]]);
  });
});

describe('max win > max loss', () => {
  it('the max loss is always under the max win, scaled by f = min(1, 0.75 x win / loss)', () => {
    expect(MATCHUP_LOSS_RATIO).toBe(0.75);
    for (const w of [1, 2, 3, 5, 8, 13, 21, 40, 63, 80]) {
      for (const l of [1, 2, 4, 9, 20, 41, 60, 79, 80, 95]) {
        const q = cappedStakes({ max_win: w, max_loss: l });
        const W = Math.max(5, w); // a matched win is worth at least +5
        expect(q.max_win).toBe(W);
        expect(q.max_loss).toBeLessThan(q.max_win);
        expect(q.max_loss).toBeLessThanOrEqual(l);
        expect(q.max_loss).toBeGreaterThanOrEqual(1);
        expect(q.loss_factor).toBeCloseTo(Math.min(1, (0.75 * W) / l), 3);
      }
    }
    expect(cappedStakes({ max_win: 80, max_loss: 80 })).toEqual({ max_win: 80, max_loss: 60, loss_factor: 0.75 });
    expect(cappedStakes({ max_win: 40, max_loss: 10 })).toEqual({ max_win: 40, max_loss: 10, loss_factor: 1 });
    // a heavy favourite (whose 2-0 can even cost rating): the win counts as at least +5, the loss stays below it
    expect(cappedStakes({ max_win: -15, max_loss: 98 })).toEqual({ max_win: 5, max_loss: 4, loss_factor: 0.0383 });
    expect(cappedStakes({ max_win: 1, max_loss: 30 })).toEqual({ max_win: 5, max_loss: 4, loss_factor: 0.125 });
    expect(cappedStakes({ max_win: 6, max_loss: 30 })).toEqual({ max_win: 6, max_loss: 5, loss_factor: 0.15 });
    expect(cappedStakes({ max_win: 30, max_loss: 0 })).toEqual({ max_win: 30, max_loss: 0, loss_factor: 1 });
    expect(softenLoss(1500, -40, 0.25)).toBe(-10);
    expect(softenLoss(1500, 12, 0.25)).toBe(12); // wins untouched
    expect(softenLoss(RATING_FLOOR + 3, -3, 0.5)).toBe(-1); // round(-1.5)
    expect(softenLoss(RATING_FLOOR + 1, -1, 0)).toBe(0);
  });

  it('holds across a spread-out ladder, including #1 matched with the bottom player (and the bottom with #1)', async () => {
    const ps = await rated(['Top', 2300], ['High', 1900], ['Mid', 1500], ['Low', 1150], ['Bot', 850]);
    await call(ps[0], 'myMatchup');
    for (const r of await rows('SELECT * FROM matchups')) {
      expect(r.max_win).toBeGreaterThan(r.max_loss);
      expect(r.max_loss).toBeLessThanOrEqual(Math.round(MATCHUP_LOSS_RATIO * r.max_win));
    }
    // regenerate with #1 and the bottom player alone in the pool: each one's only possible pick is the other
    const [top, , , , bot] = ps;
    await sql('DELETE FROM matchups');
    await sql('DELETE FROM matchup_weeks');
    await sql('UPDATE players SET singles_rank = NULL WHERE id NOT IN (?, ?)', top.player.id, bot.player.id);
    const vt = (await call(top, 'myMatchup')).body.matchup;
    const vb = (await call(bot, 'myMatchup')).body.matchup;
    for (const v of [vt, vb]) expect(v.max_win).toBeGreaterThan(v.max_loss);
    const rt = await rowOf(top);
    expect(rt.opponent_player_id).toBe(bot.player.id);
    // #1 vs the bottom (only 1 rank apart in this two-player pool): a 2-0 win is tiny, so the matched win is topped up to +5
    expect(rt.quote_win).toBeLessThan(5);
    expect(rt.quote_loss).toBeGreaterThan(0);
    expect(vt).toMatchObject({ max_win: 5, max_loss: 4 });
    expect(vt.decline_cost).toBeGreaterThan(0);
    // the bottom player has everything to win and nothing to lose
    expect(vb.max_win).toBeGreaterThan(40);
    expect(vb.max_loss).toBe(0);
  });
});

describe('decline', () => {
  it('costs the max loss right away, settles the week (no week-end charge) and never reveals the opponent', async () => {
    const [a, , c] = await ladder('Aa1', 'Bb2', 'Cc3');
    await only(c, a);
    const v = (await call(c, 'myMatchup')).body.matchup;
    const r0 = await rating(c);
    const d = await call(c, 'matchupDecline');
    expect(d.status).toBe(200);
    expect(d.body.matchup).toMatchObject({ status: 'declined', penalty_reason: 'declined', penalty_rating: v.decline_cost, mystery: true, opponent: null });
    expect(v.decline_cost).toBe(Math.min(MAX_DELTA, v.max_loss));
    expect(mentions(d.body, a)).toBe(false);
    expect(await rating(c)).toBe(r0 - v.max_loss);
    const row = await rowOf(c);
    expect(row).toMatchObject({ status: 'declined', penalty_rating: v.max_loss });
    expect(row.settled_at).toBeTruthy();
    expect(row.penalty_rank_before).not.toBe(null);
    expect((await call(c, 'matchupDecline')).status).toBe(400); // idempotent: once
    expect((await call(c, 'matchupYes')).status).toBe(400);
    expect((await rows('SELECT * FROM challenges')).length).toBe(0);
    expect((await call(null, 'listMatchups')).body.items[0]).toMatchObject({ mystery: true, opponent_name: null, status: 'declined' });
    await endWeek();
    await sync();
    expect(await rating(c)).toBe(r0 - v.max_loss); // no week-end charge on top
  });

  it('is gone once you accept: backing out is the only way out', async () => {
    const [a, b] = await ladder('Aa1', 'Bb2');
    await only(b, a);
    await call(b, 'matchupYes');
    expect((await call(b, 'matchupDecline')).status).toBe(400);
  });

  it('ignoring it costs the same max loss at week end', async () => {
    const [a, b] = await ladder('Aa1', 'Bb2');
    await only(b, a);
    const v = (await call(b, 'myMatchup')).body.matchup;
    const r0 = await rating(b);
    await endWeek();
    await sync();
    expect(await rowOf(b)).toMatchObject({ status: 'missed', penalty_rating: Math.min(MAX_DELTA, v.max_loss) });
    expect(await rating(b)).toBe(r0 - Math.min(MAX_DELTA, v.max_loss));
  });
});

describe('the matched game', () => {
  it("the owner losing it has their loss scaled by f; the opponent's change is untouched; a win is normal", async () => {
    const [top, , low] = await rated(['Top', 1700], ['Mid', 1500], ['Low', 1300]);
    await only(top, low); // the favourite owes: raw loss > win, so f < 1
    const v = (await call(top, 'matchupYes')).body.matchup;
    expect(v.loss_factor).toBeLessThan(1);
    expect((await call(low, 'respondChallenge', { challenge_id: v.challenge.id, decision: 'accept' })).status).toBe(200);
    // the stakes line on the challenge shows the softened loss for the owner
    const st = (await call(top, 'matchStakes', { challenge_id: v.challenge.id })).body.players;
    const mine = st.find((x) => x.you), theirs = st.find((x) => !x.you);
    expect(mine.loss_factor).toBe(v.loss_factor);
    expect(-mine.lose[1]).toBeLessThan(mine.win[1]);
    expect(Math.abs(-mine.lose[1] - v.max_loss)).toBeLessThanOrEqual(3); // frozen at generation; ratings' RD drifts a little
    expect(theirs.loss_factor).toBeUndefined();
    const before = await rating(top);
    const m = await submit(low, top); // Low wins 2-0
    const preview = (await call(top, 'matchStakes', { match_id: m.id })).body.players;
    const done = (await call(top, 'respondMatch', { match_id: m.id, decision: 'accept' })).body.match;
    expect(done.status).toBe('verified');
    const ownerCh = done.rating_changes.find((x) => x.player_id === top.player.id);
    const oppCh = done.rating_changes.find((x) => x.player_id === low.player.id);
    expect(ownerCh.matched).toEqual({ loss_factor: v.loss_factor, unsoftened: expect.any(Number) });
    expect(ownerCh.delta).toBe(softenLoss(ownerCh.before, ownerCh.matched.unsoftened, v.loss_factor));
    expect(ownerCh.delta).toBeGreaterThan(ownerCh.matched.unsoftened);
    expect(ownerCh.delta).toBeLessThan(0);
    expect(await rating(top)).toBe(before + ownerCh.delta);
    expect(oppCh.matched).toBeUndefined();
    expect(oppCh.delta).toBeGreaterThan(0);
    expect(preview.find((x) => x.player_id === low.player.id).result).toBe(oppCh.delta); // same as an unsoftened preview
    expect(preview.find((x) => x.player_id === top.player.id).result).toBe(ownerCh.delta);
    expect(await rowOf(top)).toMatchObject({ status: 'played', match_id: m.id });
  });

  it('the owner winning it is a normal win (no factor recorded)', async () => {
    const [top, , low] = await rated(['Top', 1700], ['Mid', 1500], ['Low', 1300]);
    await only(top, low);
    const v = (await call(top, 'matchupYes')).body.matchup;
    await call(low, 'respondChallenge', { challenge_id: v.challenge.id, decision: 'accept' });
    const done = await play(top, low);
    const ownerCh = done.rating_changes.find((x) => x.player_id === top.player.id);
    expect(ownerCh.matched).toBeUndefined();
    expect(ownerCh.delta).toBe(ownerCh.after - ownerCh.before);
    expect(ownerCh.delta).toBeGreaterThan(0);
  });
});

describe('Accept', () => {
  it('sends a matched challenge that skips the weekly caps, the one-active rule and the cooldown', async () => {
    const [a, b, c, d, e] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4', 'Ee5');
    // E has used all 3 sends (one still open, to D), A declined E (cooldown) and A has received 2 this week
    const send = async (from, to, decline) => {
      const t = (await call(from, 'createChallenge', { defender_player_id: to.player.id })).body.challenge;
      expect(t).toBeTruthy();
      if (decline) await call(to, 'respondChallenge', { challenge_id: t.id, decision: 'decline' });
    };
    await send(e, a, true);
    await send(e, b, true);
    await send(e, d, false);
    await send(d, a, true);
    expect((await call(c, 'createChallenge', { defender_player_id: a.player.id })).status).toBe(409);
    expect((await call(e, 'createChallenge', { defender_player_id: c.player.id })).status).toBe(409);
    await only(e, a);
    const before = (await call(e, 'myMatchup')).body.matchup;
    const r = await call(e, 'matchupYes');
    expect(r.status).toBe(200);
    const m = r.body.matchup;
    expect(m).toMatchObject({ status: 'waiting', frozen: true, max_loss: before.max_loss, max_win: before.max_win, loss_factor: before.loss_factor });
    expect(m.challenge).toMatchObject({ challenger_player_id: e.player.id, defender_player_id: a.player.id, status: 'open', matchup_id: m.id });
    // the challenge's own stakes line shows the same (frozen at generation, so within a point or two), the loss softened
    const st = (await call(e, 'matchStakes', { challenge_id: m.challenge.id })).body.players.find((x) => x.you);
    expect(st.loss_factor).toBe(m.loss_factor);
    expect(Math.abs(st.win[1] - m.max_win)).toBeLessThanOrEqual(3);
    expect(Math.abs(-st.lose[1] - m.max_loss)).toBeLessThanOrEqual(3);
    // matched challenges don't use up anyone's weekly allowance
    expect((await call(e, 'challengeLimits')).body.sent).toBe(3);
    expect((await call(e, 'matchupYes')).status).toBe(400);
    // the opponent answers it like any challenge
    expect((await call(a, 'respondChallenge', { challenge_id: m.challenge.id, decision: 'accept' })).body.challenge.status).toBe('accepted');
    expect((await call(e, 'myMatchup')).body.matchup.status).toBe('accepted');
  });

  it("the other side's yes accepts the challenge; one verified match settles both rows", async () => {
    const [a, b] = await ladder('Aa1', 'Bb2'); // a pool of two: each is the other's pick
    expect((await call(b, 'matchupYes')).body.matchup.status).toBe('waiting');
    const r = (await call(a, 'matchupYes')).body.matchup;
    expect(r.status).toBe('accepted');
    expect(r.mutual).toBe(true);
    const ch = await one('SELECT * FROM challenges WHERE id = ?', r.challenge.id);
    expect(ch).toMatchObject({ status: 'accepted', challenger_player_id: b.player.id });
    expect((await rows('SELECT * FROM challenges')).length).toBe(1);
    const m = await play(a, b);
    expect(m.status).toBe('verified');
    for (const u of [a, b]) expect(await rowOf(u)).toMatchObject({ status: 'played', match_id: m.id });
    expect((await one('SELECT status FROM challenges WHERE id = ?', ch.id)).status).toBe('completed');
    await endWeek();
    const ra = await rating(a);
    await sync();
    expect(await rating(a)).toBe(ra);
  });

  it('backing out costs 2x the stored (capped) max loss and cancels the challenge', async () => {
    const [a, b, c] = await rated(['Aa1', 2000], ['Bb2', 1600], ['Cc3', 1500]);
    await only(a, c); // the favourite owes: raw loss > win, so the capped max loss is what doubles
    const yes = (await call(a, 'matchupYes')).body.matchup;
    const row = await rowOf(a);
    expect(row.quote_loss).toBeGreaterThan(yes.max_loss);
    expect(yes.max_loss).toBeLessThan(yes.max_win);
    expect(2 * yes.max_loss).toBeLessThan(MAX_DELTA); // so the cap doesn't hide which loss was doubled
    await sql('UPDATE players SET singles_rating = 1700 WHERE id = ?', c.player.id); // stakes drift after accept: the cost doesn't
    const r0 = await rating(a);
    const r = await call(a, 'matchupBackOut');
    expect(r.status).toBe(200);
    expect(r.body.matchup).toMatchObject({ status: 'backed_out', penalty_reason: 'backed_out', penalty_rating: 2 * yes.max_loss });
    expect(await rating(a)).toBe(r0 - 2 * yes.max_loss);
    expect((await one('SELECT status FROM challenges WHERE id = ?', yes.challenge.id)).status).toBe('cancelled');
    expect((await call(a, 'matchupBackOut')).status).toBe(400);
    await endWeek();
    await sync();
    expect(await rating(a)).toBe(r0 - 2 * yes.max_loss); // settled once
    void b;
  });

  it('backing out (old shape): 2x, at most MAX_DELTA', async () => {
    const [a, b, c] = await ladder('Aa1', 'Bb2', 'Cc3');
    await only(c, a);
    const yes = (await call(c, 'matchupYes')).body.matchup;
    await sql('UPDATE players SET singles_rating = 1500 WHERE id = ?', a.player.id); // stakes drift after yes: the cost doesn't
    const r0 = await rating(c);
    const r = await call(c, 'matchupBackOut');
    expect(r.status).toBe(200);
    expect(r.body.matchup).toMatchObject({ status: 'backed_out', penalty_reason: 'backed_out', penalty_rating: Math.min(MAX_DELTA, 2 * yes.max_loss) });
    expect(await rating(c)).toBe(r0 - Math.min(MAX_DELTA, 2 * yes.max_loss));
    expect((await one('SELECT status FROM challenges WHERE id = ?', yes.challenge.id)).status).toBe('cancelled');
    expect((await call(c, 'matchupBackOut')).status).toBe(400);
    await endWeek();
    await sync();
    expect(await rating(c)).toBe(r0 - Math.min(MAX_DELTA, 2 * yes.max_loss)); // settled once
    void b;
  });

  it('opponent declines: the normal penalty is theirs and the owner is cleared', async () => {
    const [a, , c] = await ladder('Aa1', 'Bb2', 'Cc3');
    await only(c, a);
    const yes = (await call(c, 'matchupYes')).body.matchup;
    const pv = (await call(a, 'challengePenaltyPreview', { challenge_id: yes.challenge.id })).body.decline;
    const ra = await rating(a);
    const d = (await call(a, 'respondChallenge', { challenge_id: yes.challenge.id, decision: 'decline' })).body.challenge;
    expect(d.penalty_rating).toBe(pv.penalty);
    expect(await rating(a)).toBe(ra - pv.penalty);
    expect((await call(c, 'myMatchup')).body.matchup.status).toBe('cleared');
    const rc = await rating(c);
    await endWeek();
    await sync();
    expect(await rowOf(c)).toMatchObject({ status: 'cleared', penalty_rating: null });
    expect(await rating(c)).toBe(rc);
    expect(await rating(a)).toBe(ra - pv.penalty); // not charged twice
  });
});

describe('week end', () => {
  it('missed players pay their max loss, once; a played matchup costs nothing', async () => {
    const [a, b, c, d] = await ladder('Aa1', 'Bb2', 'Cc3', 'Dd4');
    await call(a, 'myMatchup');
    await sql('DELETE FROM matchups WHERE player_id NOT IN (?, ?)', c.player.id, d.player.id);
    await sql('UPDATE matchups SET opponent_player_id = ?, opponent_user_id = ? WHERE player_id = ?', a.player.id, a.id, c.player.id);
    await sql('UPDATE matchups SET opponent_player_id = ?, opponent_user_id = ? WHERE player_id = ?', b.player.id, b.id, d.player.id);
    await play(d, b);
    expect(await rowOf(d)).toMatchObject({ status: 'played' });
    const quoted = (await call(c, 'myMatchup')).body.matchup.max_loss;
    const owe = Math.min(MAX_DELTA, quoted);
    const [rc, rd] = [await rating(c), await rating(d)];
    await endWeek();
    expect((await sync()).matchups_settled).toBe(1);
    expect(await rowOf(c)).toMatchObject({ status: 'missed', penalty_reason: 'missed_match', penalty_rating: owe, max_loss: quoted });
    expect(await rating(c)).toBe(rc - owe);
    expect(await rating(d)).toBe(rd);
    expect((await sync()).matchups_settled).toBe(0);
    expect(await rating(c)).toBe(rc - owe);
  });

  it('both committed (accepted) but never played: both pay their stored max loss', async () => {
    const [a, b] = await ladder('Aa1', 'Bb2');
    const yb = (await call(b, 'matchupYes')).body.matchup;
    const ya = (await call(a, 'matchupYes')).body.matchup;
    const [ra, rb] = [await rating(a), await rating(b)];
    await endWeek();
    await sync();
    const cap = (n) => Math.min(MAX_DELTA, n); // one week's miss never costs more than one match can
    expect(await rowOf(a)).toMatchObject({ status: 'missed', penalty_rating: cap(ya.max_loss), max_loss: ya.max_loss });
    expect(await rowOf(b)).toMatchObject({ status: 'missed', penalty_rating: cap(yb.max_loss), max_loss: yb.max_loss });
    expect(await rating(a)).toBe(ra - cap(ya.max_loss));
    expect(await rating(b)).toBe(rb - cap(yb.max_loss));
  });

  it('a result waiting for sign-off holds the row until it resolves', async () => {
    const [a, b] = await ladder('Aa1', 'Bb2');
    await only(a, b);
    const m = await submit(a, b);
    await sql('UPDATE matches SET created_date = ? WHERE id = ?', ago(2 / 1440), m.id); // recorded before the week ended
    await endWeek();
    expect((await sync()).matchups_settled).toBe(0);
    await call(b, 'respondMatch', { match_id: m.id, decision: 'accept' });
    expect(await rowOf(a)).toMatchObject({ status: 'played', match_id: m.id });
  });

  it('an open matched challenge at week end clears the owner (they did their part)', async () => {
    const [a, b] = await ladder('Aa1', 'Bb2');
    await only(a, b);
    await call(a, 'matchupYes');
    const [ra, rb] = [await rating(a), await rating(b)];
    await endWeek();
    await sync();
    expect(await rowOf(a)).toMatchObject({ status: 'cleared' });
    // the matched challenge was due at week end: b ignored it, so b pays the normal expiry and a gets the walkover
    const ch = await one('SELECT * FROM challenges WHERE id = ?', (await rowOf(a)).challenge_id);
    expect(ch.status).toBe('expired');
    expect(await rating(b)).toBe(rb - ch.penalty_rating);
    expect(await rating(a)).toBe(ra + (ch.challenger_rating_gain || 0));
  });
});

describe('emails', () => {
  const KEY_ENV = { RESEND_API_KEY: 're_test_key', EMAIL_LOG: 'off' };
  const mockResend = () => {
    const sent = [];
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
    }));
    return sent;
  };
  const verify = (...us) => Promise.all(us.map((u) => sql('UPDATE "user" SET emailVerified = 1 WHERE id = ?', u.id)));

  it('matchup_assigned goes out once per owner when the week is generated (opt-out respected)', async () => {
    const [a, b, c] = await ladder('Aa1', 'Bb2', 'Cc3');
    await verify(a, b, c);
    await sql('UPDATE "user" SET email_notifications = 0 WHERE id = ?', c.id);
    const sent = mockResend();
    await runSyncLadder({ env: { ...env, ...KEY_ENV } });
    await runSyncLadder({ env: { ...env, ...KEY_ENV } });
    const [ra, rb] = [await rowOf(a), await rowOf(b)];
    expect(sent.map((s) => `${s.to[0]}: ${s.subject}`).sort())
      .toEqual([`aa1@x.test: Your mystery match this week: max win +${ra.max_win}`, `bb2@x.test: Your mystery match this week: max win +${rb.max_win}`]);
    const t = sent.find((s) => s.to[0] === 'bb2@x.test').text;
    expect(t).toContain(`Your mystery match this week: max win +${rb.max_win}, max loss −${rb.max_loss}; accept to reveal who.`);
    expect(t).toContain(`Decline and you lose ${rb.max_loss} right away. Ignore it and you lose ${rb.max_loss} at the end of the week`);
    expect(t).toContain(`(−${Math.min(MAX_DELTA, 2 * rb.max_loss)})`);
    expect(t).toMatch(/end of the week \(Sun, \w+ \d+, 11:59pm C[SD]T\)/);
    expect(t).toContain('https://penged.dev/challenges');
    // never names (or describes) the opponent
    for (const s of sent) {
      const opp = s.to[0] === 'aa1@x.test' ? 'Bb2' : 'Aa1';
      for (const n of [opp, opp.toLowerCase(), '#1', '#2', 'never played', 'Why them']) expect(`${s.subject}\n${s.text}`).not.toContain(n);
      for (const n of [opp, opp.toLowerCase(), 'never played', 'Why them']) expect(s.html).not.toContain(n);
    }
  });

  it("the matched challenge email says it is this week's matched game", async () => {
    const [a, b] = await ladder('Aa1', 'Bb2');
    await verify(a, b);
    await only(b, a);
    const r = await call(b, 'matchupYes');
    const msgs = await compose(env, 'challenge_received', { challenge_id: r.body.matchup.challenge.id, actor_user_id: b.id });
    expect(msgs.map((m) => m.subject)).toEqual(["Bb2 wants this week's matched game with you"]);
    expect(msgs[0].text).toContain("this week's match");
    void appWith; void ORIGIN;
  });
});

describe('weekly match deadlines', () => {
  it('a matched challenge is due exactly when the week ends: when sent, when accepted, and repaired by sync', async () => {
    const [a, b] = await ladder('Aa1', 'Bb2');
    await only(a, b);
    await call(a, 'matchupYes');
    const row = await rowOf(a);
    const ch = await one('SELECT * FROM challenges WHERE id = ?', row.challenge_id);
    expect(ch.expires_at).toBe(row.week_end);
    expect((await call(b, 'respondChallenge', { challenge_id: ch.id, decision: 'accept' })).status).toBe(200);
    expect((await one('SELECT expires_at FROM challenges WHERE id = ?', ch.id)).expires_at).toBe(row.week_end);
    // an older row that runs past the week (the bug this guards against) is pulled back in by the next sync
    const later = new Date(Date.parse(row.week_end) + 2 * 86400e3).toISOString();
    await sql('UPDATE challenges SET expires_at = ? WHERE id = ?', later, ch.id);
    await sync();
    expect((await one('SELECT expires_at FROM challenges WHERE id = ?', ch.id)).expires_at).toBe(row.week_end);
  });
});

describe('matched win floor', () => {
  it('the owner of the row wins their matched game for at least +5, even as the heavy favourite', async () => {
    const ps = await rated(['Top', 2300], ['Bot', 850]);
    const [top, bot] = ps;
    await only(top, bot);
    await call(top, 'matchupYes');
    const ch = (await rowOf(top)).challenge_id;
    await call(bot, 'respondChallenge', { challenge_id: ch, decision: 'accept' });
    // a close 2-0: the underdog's close-loss credit would normally cost the favourite rating
    const s = await call(top, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: top.player.id }], side_b: [{ player_id: bot.player.id }], games: [{ a: 11, b: 9 }, { a: 11, b: 9 }] });
    const m = (await call(bot, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
    const t = m.rating_changes.find((x) => x.player_id === top.player.id);
    expect(t.delta).toBe(5);
    expect(t.matched).toMatchObject({ min_win: 5 });
  });
});
