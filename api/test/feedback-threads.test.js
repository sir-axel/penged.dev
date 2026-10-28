import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { app, env, dispose, reset, signUp, call, makeAdmin } from './helpers.js';

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM feedback_replies').run();
  await reset();
});
afterAll(() => dispose());

const ORIGIN = 'http://localhost:8787';
async function send(who, body = {}) {
  const res = await app.request('/api/functions/submitFeedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(who ? { Cookie: who.cookie } : {}) },
    body: JSON.stringify({ kind: 'bug', message: 'It broke', ...body }),
  });
  return res.status;
}
const idFor = async (userId) => (await env.DB.prepare('SELECT id FROM feedback WHERE user_id IS ? ORDER BY created_date').bind(userId).first()).id;
async function setup() {
  const admin = await signUp('admin@x.test', 'boss');
  await makeAdmin(admin);
  const u = await signUp('u@x.test', 'uu');
  const v = await signUp('v@x.test', 'vv');
  await send(u, { message: 'mine' });
  await send(v, { message: 'theirs' });
  return { admin, u, v, uid: await idFor(u.id), vid: await idFor(v.id) };
}

describe('feedback threads', () => {
  it('myFeedback returns only my own, without private fields', async () => {
    const { admin, u, uid } = await setup();
    await call(admin, 'updateFeedback', { id: uid, admin_note: 'secret note' });
    const r = (await call(u, 'myFeedback')).body;
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ id: uid, message: 'mine', status: 'new', user_unread: false, replies: [] });
    expect(JSON.stringify(r)).not.toMatch(/secret note|admin_note|ip_hash|user_agent/);
  });
  it('requires sign-in', async () => {
    expect((await call(null, 'myFeedback')).status).toBe(401);
    expect((await call(null, 'replyFeedback', { id: 'x', message: 'y' })).status).toBe(401);
    expect((await call(null, 'markFeedbackSeen', { id: 'x' })).status).toBe(401);
    expect((await call(null, 'myFeedbackUnread')).status).toBe(401);
  });
  it('admin reply sets unread, reads the item, and shows in the thread (no note leak)', async () => {
    const { admin, u, uid } = await setup();
    await call(admin, 'updateFeedback', { id: uid, admin_note: 'private!' });
    const r = await call(admin, 'replyFeedback', { id: uid, message: ' Thanks, fixed ' });
    expect(r.status).toBe(200);
    expect(r.body.reply).toMatchObject({ author_role: 'admin', message: 'Thanks, fixed' });
    expect((await call(u, 'myFeedbackUnread')).body).toEqual({ unread: 1 });
    const mine = (await call(u, 'myFeedback')).body;
    expect(mine.unread).toBe(1);
    expect(mine.items[0]).toMatchObject({ status: 'read', user_unread: true, reply_count: 1 });
    expect(mine.items[0].replies).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toMatch(/private!/);
    const row = await env.DB.prepare('SELECT * FROM feedback WHERE id = ?').bind(uid).first();
    expect(row).toMatchObject({ user_unread: 1, reply_count: 1, status: 'read' });
    expect(row.last_reply_at).toBeTruthy();
  });
  it('markFeedbackSeen clears unread, only for the owner', async () => {
    const { admin, u, v, uid } = await setup();
    await call(admin, 'replyFeedback', { id: uid, message: 'hi' });
    expect((await call(v, 'markFeedbackSeen', { id: uid })).status).toBe(404);
    expect((await call(admin, 'markFeedbackSeen', { id: uid })).status).toBe(404);
    expect((await call(u, 'myFeedbackUnread')).body.unread).toBe(1);
    expect((await call(u, 'markFeedbackSeen', { id: uid })).status).toBe(200);
    expect((await call(u, 'myFeedbackUnread')).body.unread).toBe(0);
  });
  it("a user can't reply to someone else's feedback", async () => {
    const { v, vid, uid } = await setup();
    expect((await call(v, 'replyFeedback', { id: uid, message: 'hey' })).status).toBe(404);
    expect((await call(v, 'replyFeedback', { id: vid, message: 'mine ok' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM feedback_replies WHERE feedback_id = ?').bind(uid).first()).n).toBe(0);
  });
  it('user follow-up reopens to new and admin sees needs_reply', async () => {
    const { admin, u, uid } = await setup();
    await call(admin, 'replyFeedback', { id: uid, message: 'a' });
    await call(admin, 'updateFeedback', { id: uid, status: 'done' });
    let l = (await call(admin, 'listFeedback', {})).body.items.find((i) => i.id === uid);
    expect(l.needs_reply).toBe(false);
    expect(l.replies).toHaveLength(1);
    const r = await call(u, 'replyFeedback', { id: uid, message: 'still broken' });
    expect(r.body.reply).toMatchObject({ author_role: 'user' });
    const list = (await call(admin, 'listFeedback', {})).body;
    l = list.items.find((i) => i.id === uid);
    expect(l).toMatchObject({ status: 'new', needs_reply: true, reply_count: 2 });
    expect(l.replies.map((x) => x.author_role)).toEqual(['admin', 'user']);
    expect(list.new_count).toBe(2);
  });
  it('visitor feedback cannot be replied to by a user; admin reply stores but sets no unread', async () => {
    const { admin, u } = await setup();
    await send(null, { message: 'anon', contact: 'a@b.c' });
    const vis = (await env.DB.prepare('SELECT id FROM feedback WHERE user_id IS NULL').first()).id;
    expect((await call(u, 'replyFeedback', { id: vis, message: 'x' })).status).toBe(404);
    expect((await call(admin, 'replyFeedback', { id: vis, message: 'x' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT user_unread FROM feedback WHERE id = ?').bind(vis).first()).user_unread).toBe(0);
  });
  it('validates replies', async () => {
    const { u, uid } = await setup();
    expect((await call(u, 'replyFeedback', { id: uid, message: '  ' })).status).toBe(400);
    expect((await call(u, 'replyFeedback', { id: uid, message: 'x'.repeat(2001) })).status).toBe(400);
    expect((await call(u, 'replyFeedback', { message: 'x' })).status).toBe(400);
    expect((await call(u, 'replyFeedback', { id: 'nope', message: 'x' })).status).toBe(404);
  });
  it('rate limits user follow-ups to 10 per day (admins exempt)', async () => {
    const { admin, u, uid } = await setup();
    for (let i = 0; i < 10; i++) expect((await call(u, 'replyFeedback', { id: uid, message: `f${i}` })).status).toBe(200);
    expect((await call(u, 'replyFeedback', { id: uid, message: 'one more' })).status).toBe(429);
    expect((await call(admin, 'replyFeedback', { id: uid, message: 'ok' })).status).toBe(200);
  });
  it('orders by latest activity and paginates', async () => {
    const { admin, u, uid } = await setup();
    await new Promise((r) => setTimeout(r, 5));
    await send(u, { message: 'second' });
    await new Promise((r) => setTimeout(r, 5));
    await call(admin, 'replyFeedback', { id: uid, message: 'bump' });
    const p1 = (await call(u, 'myFeedback', { limit: 1 })).body;
    expect(p1.items[0].id).toBe(uid);
    expect(p1.next_cursor).toBeTruthy();
    const p2 = (await call(u, 'myFeedback', { limit: 1, cursor: p1.next_cursor })).body;
    expect(p2.items[0].message).toBe('second');
    expect(p2.next_cursor).toBeNull();
  });
});
