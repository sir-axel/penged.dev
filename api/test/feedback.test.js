import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { app, env, dispose, reset, signUp, call, get, makeAdmin } from './helpers.js';

beforeEach(reset);
afterAll(() => dispose());

const ORIGIN = 'http://localhost:8787';
async function send(who, body, ip = '203.0.113.7') {
  const res = await app.request('/api/functions/submitFeedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'cf-connecting-ip': ip, 'User-Agent': 'vitest', ...(who ? { Cookie: who.cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
const good = { kind: 'bug', message: 'The ladder is broken', page: '/leaderboard' };
const rows = async () => (await env.DB.prepare('SELECT * FROM feedback ORDER BY created_date').all()).results;
const mkAdmin = async () => {
  const a = await signUp('admin@x.test', 'boss');
  await makeAdmin(a);
  return a;
};

describe('submitFeedback', () => {
  it('works signed out and stores contact', async () => {
    const r = await send(null, { ...good, contact: ' me@x.test ' });
    expect(r).toEqual({ status: 200, body: { ok: true } });
    const [row] = await rows();
    expect(row).toMatchObject({ kind: 'bug', message: 'The ladder is broken', page: '/leaderboard', contact: 'me@x.test', user_id: null, status: 'new', user_agent: 'vitest' });
  });
  it('signed in: snapshots the user, ignores contact', async () => {
    const u = await signUp('u@x.test', 'uu');
    await call(u, 'createPlayer', { username: 'Uma' });
    await send(u, { ...good, kind: 'idea', contact: 'x@y.z' });
    const [row] = await rows();
    expect(row).toMatchObject({ user_id: u.id, username: 'Uma', contact: null, kind: 'idea' });
    expect(row.player_id).toBeTruthy();
  });
  it('honeypot stores nothing but reports ok', async () => {
    expect(await send(null, { ...good, website: 'http://spam' })).toEqual({ status: 200, body: { ok: true } });
    expect(await rows()).toHaveLength(0);
  });
  it('validates input', async () => {
    expect((await send(null, { ...good, message: '   ' })).status).toBe(400);
    expect((await send(null, { ...good, message: undefined })).status).toBe(400);
    expect((await send(null, { ...good, message: 'x'.repeat(2001) })).status).toBe(400);
    expect((await send(null, { ...good, kind: 'rant' })).status).toBe(400);
    expect((await send(null, { ...good, contact: 'c'.repeat(201) })).status).toBe(400);
    expect((await send(null, { ...good, message: 'x'.repeat(2000) })).status).toBe(200);
    expect((await send(null, { ...good, page: 'https://evil.test/' + 'a'.repeat(300) })).status).toBe(200);
    expect((await rows()).at(-1).page).toBeNull();
    expect((await send(null, { ...good, page: '/' + 'a'.repeat(300) })).status).toBe(200);
    expect((await rows()).at(-1).page).toHaveLength(200);
  });
  it('keeps the Origin check', async () => {
    const res = await app.request('/api/functions/submitFeedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.test' }, body: JSON.stringify(good),
    });
    expect(res.status).toBe(403);
  });
  it('other functions still need a session', async () => {
    expect((await call(null, 'listFeedback')).status).toBe(401);
    expect((await call(null, 'updateFeedback', { id: 'x' })).status).toBe(401);
  });
  it('rate limits 5 per ip per hour', async () => {
    for (let i = 0; i < 5; i++) expect((await send(null, good, '198.51.100.1')).status).toBe(200);
    const r = await send(null, good, '198.51.100.1');
    expect(r.status).toBe(429);
    expect(r.body.error).toMatch(/try again/i);
    expect((await send(null, good, '198.51.100.2')).status).toBe(200);
    await env.DB.prepare('UPDATE feedback SET created_date = ?').bind(new Date(Date.now() - 2 * 3600e3).toISOString()).run();
    expect((await send(null, good, '198.51.100.1')).status).toBe(200);
  });
  it('rate limits 20 per user per day (across IPs)', async () => {
    const u = await signUp('u@x.test', 'uu');
    for (let i = 0; i < 20; i++) expect((await send(u, good, `10.0.0.${i}`)).status).toBe(200);
    expect((await send(u, good, '10.0.1.1')).status).toBe(429);
    expect((await send(null, good, '10.0.1.1')).status).toBe(200);
  });
  it('stores only a hash of the ip', async () => {
    await send(null, good, '203.0.113.99');
    const [row] = await rows();
    expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('203.0.113.99');
  });
});

describe('admin feedback', () => {
  it('non-admins cannot list or update', async () => {
    const u = await signUp('u@x.test', 'uu');
    await send(u, good);
    const [row] = await rows();
    expect((await call(u, 'listFeedback')).status).toBe(403);
    expect((await call(u, 'updateFeedback', { id: row.id, status: 'done' })).status).toBe(403);
    expect((await rows())[0].status).toBe('new');
  });
  it('admin lists newest first, filters, paginates and counts', async () => {
    const admin = await mkAdmin();
    for (let i = 0; i < 3; i++) await send(null, { ...good, message: `m${i}` }, `10.1.0.${i}`);
    const all = await rows();
    for (const [i, r] of all.entries()) await env.DB.prepare('UPDATE feedback SET created_date = ? WHERE id = ?').bind(new Date(Date.now() - (3 - i) * 1000).toISOString(), r.id).run();
    const byMsg = Object.fromEntries((await rows()).map((r) => [r.message, r.id]));
    const l = (await call(admin, 'listFeedback', {})).body;
    expect(l.items.map((x) => x.message)).toEqual(['m2', 'm1', 'm0']);
    expect(l.new_count).toBe(3);
    expect(l.counts).toEqual({ new: 3, read: 0, done: 0, all: 3 });
    expect(l.items[0]).not.toHaveProperty('ip_hash');
    const p1 = (await call(admin, 'listFeedback', { limit: 2 })).body;
    expect(p1.items.map((x) => x.message)).toEqual(['m2', 'm1']);
    const p2 = (await call(admin, 'listFeedback', { limit: 2, cursor: p1.next_cursor })).body;
    expect(p2.items.map((x) => x.message)).toEqual(['m0']);
    expect(p2.next_cursor).toBeNull();
    const up = await call(admin, 'updateFeedback', { id: byMsg.m0, status: 'done', admin_note: ' fixed ' });
    expect(up.body.item).toMatchObject({ status: 'done', admin_note: 'fixed' });
    const done = (await call(admin, 'listFeedback', { status: 'done' })).body;
    expect(done.items).toHaveLength(1);
    expect(done.new_count).toBe(2);
    expect((await call(admin, 'listFeedback', { status: 'bogus' })).status).toBe(400);
    expect((await call(admin, 'updateFeedback', { id: byMsg.m0, status: 'bogus' })).status).toBe(400);
    expect((await call(admin, 'updateFeedback', { id: 'nope', status: 'read' })).status).toBe(404);
    const re = await call(admin, 'updateFeedback', { id: byMsg.m0, status: 'new' });
    expect(re.body.item.status).toBe('new');
    expect(re.body.item.admin_note).toBe('fixed');
  });
});

describe('entity layer', () => {
  it('cannot expose feedback', async () => {
    const admin = await mkAdmin();
    await send(null, good);
    const [row] = await rows();
    for (const who of [null, admin]) {
      expect((await get('/api/entities/Feedback', who)).status).toBe(404);
      expect((await get('/api/entities/feedback', who)).status).toBe(404);
      expect((await get(`/api/entities/feedback/${row.id}`, who)).status).toBe(404);
      expect((await get('/api/entities/feedback/count', who)).status).toBe(404);
    }
  });
});
