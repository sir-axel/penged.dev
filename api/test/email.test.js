import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { appWith, env, dispose, reset, signUp, get } from './helpers.js';
import { sendEmail, passwordReset, verifyEmail, esc, allowSend, DAILY_EMAIL_CAP } from '../src/email.js';

beforeEach(reset);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
afterAll(() => dispose());

const ORIGIN = 'http://localhost:8787';
const KEY_ENV = { RESEND_API_KEY: 're_test_key', EMAIL_LOG: 'off' };
const post = (a, path, body) =>
  a.request(`/api/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });
const resetReq = (a, email) => post(a, '/request-password-reset', { email, redirectTo: `${ORIGIN}/reset-password` });

/** Mock fetch -> capture Resend payloads (the network is never touched). */
function mockResend() {
  const sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
  }));
  return sent;
}
const linkIn = (m) => /https?:\/\/\S+/.exec(m.body.text)[0];
const token = (url) => /reset-password\/([A-Za-z0-9_-]+)/.exec(url)[1];
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('email.js unit', () => {
  it('escapes user values in the HTML template, text keeps the raw link', () => {
    const url = 'http://x.test/a?b=1&c="2"';
    const m = passwordReset({ url, name: '<script>alert(1)</script>' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('b=1&amp;c=&quot;2&quot;');
    expect(m.text).toContain(url);
    expect(verifyEmail({ url, name: 'Tom' }).subject).toMatch(/Verify/);
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('no API key: logs subject and link, returns {logged:true}, never fetches', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const m = passwordReset({ url: 'http://x.test/reset/abc', name: 'Al' });
    expect(await sendEmail({}, { to: 'a@x.test', ...m })).toEqual({ logged: true });
    expect(f).not.toHaveBeenCalled();
    expect(log.mock.calls.join('\n')).toContain('http://x.test/reset/abc');
    expect(log.mock.calls.join('\n')).toContain('Reset your Penged.dev password');
  });

  it('with a key: POSTs to Resend with bearer auth, default sender, optional reply_to', async () => {
    const sent = mockResend();
    const m = verifyEmail({ url: 'http://x.test/v', name: 'Al' });
    expect(await sendEmail({ RESEND_API_KEY: 'k1' }, { to: 'a@x.test', ...m })).toEqual({ sent: true, id: 'em_1' });
    expect(sent[0].url).toBe('https://api.resend.com/emails');
    expect(sent[0].headers.Authorization).toBe('Bearer k1');
    expect(sent[0].body).toMatchObject({ from: 'Penged.dev <no-reply@mail.penged.dev>', to: ['a@x.test'], subject: m.subject });
    expect(sent[0].body.reply_to).toBeUndefined();
    await sendEmail({ RESEND_API_KEY: 'k1', EMAIL_FROM: 'X <x@mail.penged.dev>', EMAIL_REPLY_TO: 'help@penged.dev' }, { to: 'b@x.test', ...m });
    expect(sent[1].body).toMatchObject({ from: 'X <x@mail.penged.dev>', reply_to: 'help@penged.dev' });
  });

  it('provider errors and timeouts are logged, not thrown', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = { to: 'a@x.test', subject: 's', text: 't', html: 'h' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })));
    expect(await sendEmail({ RESEND_API_KEY: 'k' }, msg)).toMatchObject({ sent: false });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('t', 'TimeoutError'); }));
    expect(await sendEmail({ RESEND_API_KEY: 'k' }, msg)).toMatchObject({ sent: false });
  });
});

describe('password reset flow', () => {
  it('unknown email: same response as known, nothing sent', async () => {
    const sent = mockResend();
    const a = appWith(KEY_ENV);
    await signUp('known@x.test', 'known');
    sent.length = 0; // drop the sign-up verification mail
    const known = await resetReq(a, 'known@x.test');
    const unknown = await resetReq(a, 'ghost@x.test');
    expect(unknown.status).toBe(known.status);
    expect(await unknown.json()).toEqual(await known.json());
    expect(sent.map((m) => m.body.to[0])).toEqual(['known@x.test']);
  });

  it('known email sends one message with a working link; the per-address cap blocks the 4th', async () => {
    const sent = mockResend();
    const a = appWith(KEY_ENV);
    await signUp('cap@x.test', 'cap');
    sent.length = 0;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await resetReq(a, 'cap@x.test');
    expect(sent).toHaveLength(1);
    expect(sent[0].body.subject).toMatch(/Reset your/);
    expect(linkIn(sent[0])).toMatch(/\/api\/auth\/reset-password\//);
    for (let i = 0; i < 3; i++) await resetReq(a, 'cap@x.test');
    expect(sent).toHaveLength(3);
  });

  it('reset with the emailed token changes the password and revokes sessions', async () => {
    const sent = mockResend();
    const a = appWith(KEY_ENV);
    const u = await signUp('rs@x.test', 'rs');
    sent.length = 0;
    expect((await get('/api/auth/get-session', u)).body).not.toBeNull();
    await resetReq(a, 'rs@x.test');
    const t = token(linkIn(sent[0]));
    expect((await post(a, '/reset-password', { newPassword: 'brandnewpass1', token: t })).status).toBe(200);
    expect((await get('/api/auth/get-session', u)).body).toBeNull();
    expect((await post(a, '/sign-in/email', { email: 'rs@x.test', password: 'brandnewpass1' })).status).toBe(200);
    expect((await post(a, '/sign-in/email', { email: 'rs@x.test', password: 'password123' })).status).toBeGreaterThanOrEqual(400);
    // single use
    expect((await post(a, '/reset-password', { newPassword: 'another-pass-2', token: t })).status).toBeGreaterThanOrEqual(400);
  });

  it('invalid and expired tokens are rejected', async () => {
    const sent = mockResend();
    const a = appWith(KEY_ENV);
    await signUp('ex@x.test', 'ex');
    sent.length = 0;
    expect((await post(a, '/reset-password', { newPassword: 'brandnewpass1', token: 'bogus' })).status).toBeGreaterThanOrEqual(400);
    await resetReq(a, 'ex@x.test');
    const t = token(linkIn(sent[0]));
    await env.DB.prepare(`UPDATE "verification" SET expiresAt = ? WHERE identifier LIKE 'reset-password:%'`).bind(new Date(Date.now() - 1000).toISOString()).run();
    expect((await post(a, '/reset-password', { newPassword: 'brandnewpass1', token: t })).status).toBeGreaterThanOrEqual(400);
  });

  it('rate-limits /request-password-reset to 3 per hour per IP', async () => {
    mockResend();
    const a = appWith({ ...KEY_ENV, RATE_LIMIT: 'on' });
    const call = () =>
      a.request('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'cf-connecting-ip': '203.0.113.77' },
        body: JSON.stringify({ email: 'x@x.test', redirectTo: `${ORIGIN}/reset-password` }),
      });
    const st = [];
    for (let i = 0; i < 5; i++) st.push((await call()).status);
    expect(st.slice(0, 3)).toEqual([200, 200, 200]);
    expect(st[4]).toBe(429);
  });
});

describe('email verification', () => {
  it('sign-up sends a verification email; the link marks the user verified and signs them in', async () => {
    const sent = mockResend();
    const a = appWith(KEY_ENV);
    const res = await post(a, '/sign-up/email', { email: 'v@x.test', password: 'password123', name: 'vee', callbackURL: '/verify-email?done=1' });
    expect(res.status).toBe(200);
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0].body.to).toEqual(['v@x.test']);
    expect(sent[0].body.subject).toMatch(/Verify/);
    const link = linkIn(sent[0]);
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    expect((await get('/api/auth/get-session', { cookie })).body.user.emailVerified).toBe(false);
    const v = await a.request(link.replace(ORIGIN, ''), { headers: { Origin: ORIGIN } });
    expect(v.status).toBe(302);
    expect(v.headers.get('location')).toContain('/verify-email?done=1');
    expect((await get('/api/auth/get-session', { cookie })).body.user.emailVerified).toBe(true);
    const bad = await a.request(`/api/auth/verify-email?token=nope&callbackURL=${encodeURIComponent('/verify-email?done=1')}`);
    expect(bad.headers.get('location')).toMatch(/error=/);
  });

  it('unverified users can still sign in (verification is not required yet)', async () => {
    mockResend();
    const a = appWith(KEY_ENV);
    await signUp('nv@x.test', 'nv');
    expect((await post(a, '/sign-in/email', { email: 'nv@x.test', password: 'password123' })).status).toBe(200);
  });

  it('resend: send-verification-email delivers a fresh link', async () => {
    const sent = mockResend();
    const a = appWith(KEY_ENV);
    const u = await signUp('rv@x.test', 'rv');
    sent.length = 0;
    const r = await post(a, '/send-verification-email', { email: 'rv@x.test', callbackURL: '/verify-email?done=1' });
    expect(r.status).toBe(200);
    await settle();
    expect(sent).toHaveLength(1);
    expect(u.email).toBe('rv@x.test');
  });
});

describe('daily guard and dev fallback', () => {
  it(`stops sending after ${DAILY_EMAIL_CAP} emails in a UTC day and logs`, async () => {
    const sent = mockResend();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = appWith(KEY_ENV);
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(`INSERT INTO "verification" (id, identifier, value, expiresAt) VALUES (?, 'email-guard', ?, ?)`)
      .bind(`emailguard:day:${day}`, String(DAILY_EMAIL_CAP - 1), new Date(Date.now() + 1e6).toISOString()).run();
    await post(a, '/sign-up/email', { email: 'd1@x.test', password: 'password123', name: 'd1' }); // 90th: goes out
    await post(a, '/sign-up/email', { email: 'd2@x.test', password: 'password123', name: 'd2' }); // 91st: blocked
    await settle();
    expect(sent.map((m) => m.body.to[0])).toEqual(['d1@x.test']);
    expect(warn.mock.calls.flat().join(' ')).toMatch(/daily cap/);
    expect(await allowSend(env, 'reset', 'z@x.test')).toBe(false);
  });

  it('no key (dev): a reset request logs the link instead of sending', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const a = appWith({ EMAIL_LOG: undefined });
    await signUp('nk@x.test', 'nk');
    log.mockClear();
    await resetReq(a, 'nk@x.test');
    expect(f).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join('\n')).toMatch(/\[email:not-sent\] to=nk@x\.test[\s\S]*reset-password\//);
  });
});
