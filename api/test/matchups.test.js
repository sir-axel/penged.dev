// Weekly matchmaking ("This week's match"): generation, assignment, "I'm in", backing out, week-end settlement, emails.
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { env, appWith, dispose, reset, call, mkPlayer, seasoned } from './helpers.js';
import { runSyncLadder } from '../src/functions.js';
import { assignMatchups, matchupScore, whyText, topBonus } from '../src/matchmaking.js';
import { compose } from '../src/notify.js';
import { MATCHUP_NEVER_PLAYED, MATCHUP_DODGE, MATCHUP_TOP_BONUS, MAX_DELTA } from '../src/rating.js';

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
/** Only `u` owes a match this week, to `opp` (the rest of the generated rows are dropped). */
const only = async (u, opp) => {
  await call(u, 'myMatchup');
  await sql('DELETE FROM matchups WHERE player_id <> ?', u.player.id);
  await sql('UPDATE matchups SET opponent_player_id = ?, opponent_user_id = ? WHERE player_id = ?', opp.player.id, opp.id, u.player.id);
};
const endWeek = () => sql('UPDATE matchups SET week_end = ?', ago(1 / 1440));
const submit = async (sub, opp) =>
  (await call(sub, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: sub.player.id }], side_b: [{ player_id: opp.player.id }], games })).body.match;
const play = async (sub, opp) => {
  const m = await submit(sub, opp);
  return (await call(opp, 'respondMatch', { match_id: m.id, decision: 'accept' })).body.match;
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
    expect(me).toMatchObject({ ranked: true, bye: false, matchup: { status: 'open', frozen: false } });
    expect(me.matchup.max_win).toBeGreaterThan(0);
    expect(me.matchup.max_loss).toBeGreaterThan(0);
    expect(me.matchup.backout_cost).toBe(Math.min(MAX_DELTA, 2 * me.matchup.max_loss));
    expect(new Date(me.deadline).getUTCDay()).toBe(1); // next Monday 00:00 Chicago (05:00 or 06:00 UTC)
  });

  it('cron makes the week too, and unranked players are told how to join', async () => {
    await ladder('Aa1', 'Bb2');
    const n = await mkPlayer('Nn9');
    expect((await sync()).matchups_assigned).toBe(2);
    expect((await call(n, 'myMatchup')).body).toMatchObject({ ranked: false, matchup: null, reason: 'unranked' });
    const list = (await call(null, 'listMatchups')).body;
    expect(list.items.map((x) => x.opponent_name).sort()).toEqual(['Aa1', 'Bb2']);
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
    const aView = (await call(a, 'myMatchup')).body;
    expect(aView.incoming.map((x) => x.player.username).sort()).toEqual(['Bb2', 'Cc3', 'Dd4']);
    expect((await call(e, 'myMatchup')).body.matchup.why).toBe("They dodged you twice lately · Last played 1 day ago · They're #3");
  });

  it('a pool of one gets nothing', async () => {
    const [a] = await ladder('Aa1');
    expect((await call(a, 'myMatchup')).body).toMatchObject({ matchup: null, reason: 'alone' });
  });
});

describe("I'm in", () => {
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
    expect(m).toMatchObject({ status: 'waiting', frozen: true, max_loss: before.max_loss, max_win: before.max_win });
    expect(m.challenge).toMatchObject({ challenger_player_id: e.player.id, defender_player_id: a.player.id, status: 'open', matchup_id: m.id });
    // the stakes it froze are what the challenge's own stakes line shows (dominant 2-0 each way)
    const st = (await call(e, 'matchStakes', { challenge_id: m.challenge.id })).body.players.find((x) => x.you);
    expect([st.win[1], -st.lose[1]]).toEqual([m.max_win, m.max_loss]);
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

  it('backing out costs 2x the stored max loss and cancels the challenge', async () => {
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
    const r = await rating(a);
    await endWeek();
    await sync();
    expect(await rowOf(a)).toMatchObject({ status: 'cleared' });
    expect(await rating(a)).toBe(r);
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
    expect(sent.map((s) => `${s.to[0]}: ${s.subject}`).sort()).toEqual(['aa1@x.test: Your match this week: Bb2', 'bb2@x.test: Your match this week: Aa1']);
    const row = await rowOf(b);
    const t = sent.find((s) => s.to[0] === 'bb2@x.test').text;
    expect(t).toContain(`max win +${row.quote_win}, max loss −${row.quote_loss}`);
    expect(t).toContain("Why them: You've never played · They're #1.");
    expect(t).toContain(`or lose ${row.quote_loss}`);
    expect(t).toContain(`(−${Math.min(MAX_DELTA, 2 * row.quote_loss)})`);
    expect(t).toMatch(/Play it by Sun, \w+ \d+, 11:59pm C[SD]T/);
    expect(t).toContain('https://penged.dev/challenges');
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
