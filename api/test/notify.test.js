import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { appWith, env, dispose, reset, call, mkPlayer, seasoned } from './helpers.js';
import { compose, run, when, NOTIFY_DAILY_CAP } from '../src/notify.js';

beforeEach(reset);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => dispose());

const ORIGIN = 'http://localhost:8787';
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const verify = (...us) => Promise.all(us.map((u) => sql('UPDATE "user" SET emailVerified = 1 WHERE id = ?', u.id)));
const past = () => new Date(Date.now() - 60000).toISOString();
const games = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
const subjects = (msgs) => msgs.map((m) => `${m.to}: ${m.subject}`).sort();

/** Three ranked players with verified emails (Aa1 #1, Bb2 #2, Cc3 #3). */
async function trio() {
  const a = await mkPlayer('Aa1');
  const b = await mkPlayer('Bb2');
  const c = await mkPlayer('Cc3');
  await seasoned(a, b, c);
  await verify(a, b, c);
  return { a, b, c };
}
const challenge = async (from, to, message) =>
  (await call(from, 'createChallenge', { defender_player_id: to.player.id, ...(message ? { message } : {}) })).body.challenge;
const singles = async (sub, opp) =>
  (await call(sub, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: sub.player.id }], side_b: [{ player_id: opp.player.id }], games })).body.match;

/** Mock fetch -> capture Resend payloads (the network is never touched). */
function mockResend() {
  const sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
  }));
  return sent;
}
const callWith = async (a, who, name, body) => {
  const res = await a.request(`/api/functions/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: who.cookie }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

describe('notify: who gets what', () => {
  it('challenge received: only the defender, with the message, deadline, link and an opt-out link', async () => {
    const { a, c } = await trio();
    const ch = await challenge(c, a, 'bring <it>');
    const msgs = await compose(env, 'challenge_received', { challenge_id: ch.id, actor_user_id: c.id });
    expect(subjects(msgs)).toEqual(['aa1@x.test: Cc3 challenged you']);
    const [m] = msgs;
    expect(m.text).toContain('Their message: "bring <it>"');
    expect(m.text).toContain(when(ch.expires_at, 'America/Chicago'));
    expect(m.text).toContain('https://penged.dev/challenges');
    expect(m.text).toContain('https://penged.dev/profile');
    expect(m.html).toContain('bring &lt;it&gt;');
    expect(m.html).toContain('href="https://penged.dev/profile"');
  });

  it('match verified: score, win/loss from each POV and rating change; the confirmer is not emailed', async () => {
    const { a, b } = await trio();
    const m = await singles(b, a);
    const v = (await call(a, 'respondMatch', { match_id: m.id, decision: 'accept' })).body.match;
    const d = (pid) => v.rating_changes.find((x) => x.player_id === pid).delta;
    const fmtD = (n) => (n > 0 ? `+${n}` : `${n}`);
    expect(subjects(await compose(env, 'match_verified', { match_id: m.id, actor_user_id: a.id })))
      .toEqual([`bb2@x.test: Final: you beat Aa1 2-0 (${fmtD(d(b.player.id))})`]);
    const both = await compose(env, 'match_verified', { match_id: m.id });
    const loser = both.find((x) => x.to === 'aa1@x.test');
    expect(loser.subject).toBe(`Final: you lost to Bb2 0-2 (${fmtD(d(a.player.id))})`);
    expect(loser.text).toContain('Games: 5-11, 7-11.');
    expect(loser.text).toMatch(/Singles rating: \d+ → \d+ \(-\d+\)/);
    // not verified (pending) -> nothing
    const m2 = await singles(b, a);
    expect(await compose(env, 'match_verified', { match_id: m2.id })).toEqual([]);
  });

  it('a tier crossing is spelled out', async () => {
    const { a, b } = await trio();
    const m = await singles(b, a);
    await call(a, 'respondMatch', { match_id: m.id, decision: 'accept' });
    const rc = [{ player_id: b.player.id, before: 1340, after: 1360, delta: 20, tier_before: 'bronze', tier_after: 'silver' }];
    await sql('UPDATE matches SET rating_changes = ? WHERE id = ?', JSON.stringify(rc), m.id);
    const [msg] = await compose(env, 'match_verified', { match_id: m.id, actor_user_id: a.id });
    expect(msg.text).toContain('New tier: Silver (up from Bronze).');
  });

  it('doubles: teammates are named, every other player is told', async () => {
    const ps = [];
    for (const n of ['Dd1', 'Dd2', 'Dd3', 'Dd4']) ps.push(await mkPlayer(n));
    await verify(...ps);
    const [p1, p2, p3, p4] = ps;
    const sub = await call(p1, 'submitMatch', {
      format: 'doubles', target: 11, side_a: [{ player_id: p1.player.id }, { player_id: p2.player.id }],
      side_b: [{ player_id: p3.player.id }, { player_id: p4.player.id }], games,
    });
    for (const p of [p2, p3, p4]) await call(p, 'respondMatch', { match_id: sub.body.match.id, decision: 'accept' });
    const msgs = await compose(env, 'match_verified', { match_id: sub.body.match.id, actor_user_id: p4.id });
    expect(msgs.map((m) => m.to).sort()).toEqual(['dd1@x.test', 'dd2@x.test', 'dd3@x.test']);
    expect(msgs.find((m) => m.to === 'dd2@x.test').subject).toMatch(/^Final: you & Dd1 beat Dd3 & Dd4 2-0/);
    expect(msgs.find((m) => m.to === 'dd3@x.test').subject).toMatch(/^Final: you & Dd4 lost to Dd1 & Dd2 0-2/);
  });
});

describe('notify: preferences and limits', () => {
  it('setEmailNotifications validates, persists, shows in the session and is respected', async () => {
    const { a, c } = await trio();
    expect((await call(a, 'setEmailNotifications', { enabled: 'no' })).status).toBe(400);
    expect((await call(a, 'setEmailNotifications', {})).status).toBe(400);
    const res = await appWith({}).request('/api/auth/get-session', { headers: { Cookie: a.cookie, Origin: ORIGIN } });
    expect((await res.json()).user.email_notifications).toBe(1);
    expect((await call(a, 'setEmailNotifications', { enabled: false })).body).toEqual({ email_notifications: false });
    const ch = await challenge(c, a);
    expect(await compose(env, 'challenge_received', { challenge_id: ch.id })).toEqual([]);
    await call(a, 'setEmailNotifications', { enabled: true });
    expect(await compose(env, 'challenge_received', { challenge_id: ch.id })).toHaveLength(1);
  });

  it('unverified addresses are skipped; the actor is never emailed', async () => {
    const { a, c } = await trio();
    await sql('UPDATE "user" SET emailVerified = 0 WHERE id = ?', a.id);
    const ch = await challenge(c, a);
    expect(await compose(env, 'challenge_received', { challenge_id: ch.id })).toEqual([]);
    await verify(a);
    expect(await compose(env, 'challenge_received', { challenge_id: ch.id, actor_user_id: a.id })).toEqual([]);
  });

  it('stops at the notification daily cap', async () => {
    const { a, c } = await trio();
    const ch = await challenge(c, a);
    const sent = mockResend();
    const day = new Date().toISOString().slice(0, 10);
    await sql(`INSERT INTO "verification" (id, identifier, value, expiresAt) VALUES (?, 'email-guard', ?, ?)
       ON CONFLICT(id) DO UPDATE SET value = excluded.value`,
      `emailguard:notify:${day}`, String(NOTIFY_DAILY_CAP), new Date(Date.now() + 3600e3).toISOString());
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await run({ ...env, RESEND_API_KEY: 'k' }, 'challenge_received', { challenge_id: ch.id })).toEqual([{ sent: false, blocked: true }]);
    expect(sent).toHaveLength(0);
  });
});

describe('notify: wired into the functions (Resend stubbed)', () => {
  const KEY_ENV = { RESEND_API_KEY: 're_test_key', EMAIL_LOG: 'off' };

  it('createChallenge emails the defender', async () => {
    const { a, c } = await trio();
    const sent = mockResend();
    const r = await callWith(appWith(KEY_ENV), c, 'createChallenge', { defender_player_id: a.player.id });
    expect(r.status).toBe(200);
    expect(sent.map((s) => [s.body.to[0], s.body.subject])).toEqual([['aa1@x.test', 'Cc3 challenged you']]);
  });

  it('submitting sends nothing; verifying emails the submitter the final score', async () => {
    const { a, b } = await trio();
    const sent = mockResend();
    const app = appWith(KEY_ENV);
    const m = (await callWith(app, b, 'submitMatch', {
      format: 'singles', target: 11, side_a: [{ player_id: b.player.id }], side_b: [{ player_id: a.player.id }], games,
    })).body.match;
    expect(sent).toHaveLength(0);
    const v = await callWith(app, a, 'respondMatch', { match_id: m.id, decision: 'accept' });
    expect(v.body.match.status).toBe('verified');
    expect(sent).toHaveLength(1);
    expect(sent[0].body.to).toEqual(['bb2@x.test']);
    expect(sent[0].body.subject).toMatch(/^Final: you beat Aa1 2-0 \(\+\d+\)$/);
  });

  it('a failing email provider never fails the request', async () => {
    const { a, c } = await trio();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const r = await callWith(appWith(KEY_ENV), c, 'createChallenge', { defender_player_id: a.player.id });
    expect(r.status).toBe(200);
    expect(r.body.challenge.status).toBe('open');
  });

  it('with an execution context the send is handed to waitUntil (the response does not wait)', async () => {
    const { a, c } = await trio();
    const sent = mockResend();
    const { createApp } = await import('../src/app.js');
    const pending = [];
    const res = await createApp().request('/api/functions/createChallenge', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: c.cookie }, body: JSON.stringify({ defender_player_id: a.player.id }),
    }, { ...env, ...KEY_ENV }, { waitUntil: (p) => pending.push(p), passThroughOnException() {} });
    expect(res.status).toBe(200);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(sent.map((s) => s.body.subject)).toEqual(['Cc3 challenged you']);
  });
});
