import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { env, dispose, reset, call, get, mkPlayer, makeAdmin } from './helpers.js';
import { parseMentionIds } from '../src/chat.js';

beforeEach(reset);
afterAll(() => dispose());

const tok = (p) => `@[${p.player.display_name || p.player.username}](player:${p.player.id})`;
const games = [{ a: 11, b: 5 }, { a: 11, b: 7 }];
const submit = (u, p, q) =>
  call(u, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: p.id }], side_b: [{ player_id: q.id }], games });
async function topic(u, over = {}) {
  const r = await call(u, 'createTopic', { category: 'general', title: 'Hello there', body: 'First post', ...over });
  expect(r.status).toBe(200);
  return r.body.topic;
}
const setup = async () => ({ a: await mkPlayer('Alice'), b: await mkPlayer('Bobby'), c: await mkPlayer('Carol') });
const unread = async (u) => (await call(u, 'chatUnread')).body;

describe('forum read/write', () => {
  it('public can read, only signed-in players write', async () => {
    const { a } = await setup();
    const t = await topic(a);
    expect((await call(null, 'listTopics', {})).body.items).toHaveLength(1);
    const g = await call(null, 'getTopic', { id: t.id });
    expect(g.status).toBe(200);
    expect(g.body.posts).toHaveLength(1);
    expect(g.body.people[a.player.id].username).toBe('Alice');
    expect((await call(null, 'createTopic', { category: 'general', title: 'abc', body: 'x' })).status).toBe(401);
    expect((await call(null, 'createPost', { topic_id: t.id, body: 'x' })).status).toBe(401);
    expect((await call(null, 'dmList')).status).toBe(401);
    expect((await call(null, 'chatUnread')).status).toBe(401);
    expect((await call(null, 'playerSearch', { q: 'ali' })).status).toBe(200);
  });
  it('validates category, title and body', async () => {
    const { a } = await setup();
    expect((await call(a, 'createTopic', { category: 'nope', title: 'abc', body: 'x' })).status).toBe(400);
    expect((await call(a, 'createTopic', { category: 'general', title: 'ab', body: 'x' })).status).toBe(400);
    expect((await call(a, 'createTopic', { category: 'general', title: 'x'.repeat(121), body: 'x' })).status).toBe(400);
    expect((await call(a, 'createTopic', { category: 'general', title: 'abc', body: '   ' })).status).toBe(400);
    expect((await call(a, 'createTopic', { category: 'general', title: 'abc', body: 'x'.repeat(4001) })).status).toBe(400);
    expect((await call(a, 'createTopic', { category: 'general', title: 'abc', body: 'x'.repeat(4000) })).status).toBe(200);
  });
  it('filters by category and paginates newest activity first', async () => {
    const { a } = await setup();
    await topic(a, { category: 'lfg', title: 'Need a game' });
    const t2 = await topic(a, { title: 'Second' });
    expect((await call(null, 'listTopics', { category: 'lfg' })).body.items).toHaveLength(1);
    await call(a, 'createPost', { topic_id: (await call(null, 'listTopics', { category: 'lfg' })).body.items[0].id, body: 'bump' });
    const list = (await call(null, 'listTopics', {})).body.items;
    expect(list[0].title).toBe('Need a game');
    expect(list[0].post_count).toBe(2);
    expect(list.map((i) => i.id)).toContain(t2.id);
    for (let i = 0; i < 31; i++) await env.DB.prepare(`INSERT INTO forum_topics (id, created_date, updated_date, category, title, author_user_id, last_post_at, post_count) VALUES (?,?,?,?,?,?,?,1)`).bind(`x${i}`, '2020-01-01', '2020-01-01', 'general', 'Old topic', a.id, `2020-01-01T00:00:${String(i).padStart(2, '0')}Z`).run();
    const p1 = (await call(null, 'listTopics', {})).body;
    expect(p1.items).toHaveLength(30);
    expect(p1.next_cursor).toBeTruthy();
    const p2 = (await call(null, 'listTopics', { cursor: p1.next_cursor })).body;
    expect(p2.items.length).toBe(3);
    expect(p2.next_cursor).toBeNull();
  });
  it('posts oldest to newest and paginates 50', async () => {
    const { a } = await setup();
    const t = await topic(a);
    for (let i = 0; i < 55; i++) {
      await env.DB.prepare('INSERT INTO forum_posts (id, topic_id, created_date, author_user_id, author_player_id, body) VALUES (?,?,?,?,?,?)').bind(`p${String(i).padStart(3, '0')}`, t.id, `2030-01-01T00:00:${String(i).padStart(2, '0')}.000Z`, a.id, a.player.id, `n${i}`).run();
    }
    const g1 = (await call(null, 'getTopic', { id: t.id })).body;
    expect(g1.posts).toHaveLength(50);
    expect(g1.posts[0].body).toBe('First post');
    const g2 = (await call(null, 'getTopic', { id: t.id, cursor: g1.next_cursor })).body;
    expect(g2.posts).toHaveLength(6);
    expect(g2.next_cursor).toBeNull();
  });
});

describe('moderation and hidden content', () => {
  it('delete own vs admin hide, [removed] for others, admin sees everything', async () => {
    const { a, b, c } = await setup();
    const admin = await mkPlayer('Boss');
    await makeAdmin(admin);
    const t = await topic(a);
    const pb = (await call(b, 'createPost', { topic_id: t.id, body: 'secret words' })).body.post;
    const pc = (await call(c, 'createPost', { topic_id: t.id, body: 'carol words' })).body.post;
    expect((await call(a, 'deletePost', { id: pb.id })).status).toBe(404); // not yours, not admin
    expect((await call(b, 'deletePost', { id: pb.id })).status).toBe(200);
    expect((await call(admin, 'deletePost', { id: pc.id })).status).toBe(200);
    const row = (id) => env.DB.prepare('SELECT hidden, deleted FROM forum_posts WHERE id = ?').bind(id).first();
    expect(await row(pb.id)).toEqual({ hidden: 0, deleted: 1 });
    expect(await row(pc.id)).toEqual({ hidden: 1, deleted: 0 });
    const pub = (await call(null, 'getTopic', { id: t.id })).body;
    expect(pub.posts.filter((p) => p.removed)).toHaveLength(2);
    expect(JSON.stringify(pub)).not.toMatch(/secret words|carol words/);
    expect(pub.posts.find((p) => p.id === pc.id)).toMatchObject({ body: '', author_player_id: null });
    const adm = (await call(admin, 'getTopic', { id: t.id })).body;
    expect(adm.posts.find((p) => p.id === pc.id)).toMatchObject({ body: 'carol words', hidden: true });
    // restore
    expect((await call(c, 'deletePost', { id: pc.id, restore: true })).status).toBe(403);
    await call(admin, 'deletePost', { id: pc.id, restore: true });
    expect((await row(pc.id)).hidden).toBe(0);
  });
  it('hidden topics are invisible to non-admins; locked topics reject posts except from admins; adminTopic is admin only', async () => {
    const { a, b } = await setup();
    const admin = await mkPlayer('Boss');
    await makeAdmin(admin);
    const t = await topic(a);
    expect((await call(a, 'adminTopic', { id: t.id, locked: true })).status).toBe(403);
    expect((await call(null, 'adminTopic', { id: t.id, locked: true })).status).toBe(401);
    await call(admin, 'adminTopic', { id: t.id, locked: true });
    const r = await call(b, 'createPost', { topic_id: t.id, body: 'hi' });
    expect(r.status).toBe(403);
    expect((await call(admin, 'createPost', { topic_id: t.id, body: 'official' })).status).toBe(200);
    await call(admin, 'adminTopic', { id: t.id, locked: false, hidden: true });
    expect((await call(null, 'listTopics', {})).body.items).toHaveLength(0);
    expect((await call(admin, 'listTopics', {})).body.items).toHaveLength(1);
    expect((await call(null, 'getTopic', { id: t.id })).status).toBe(404);
    expect((await call(b, 'createPost', { topic_id: t.id, body: 'hi' })).status).toBe(404);
    expect((await call(admin, 'getTopic', { id: t.id })).status).toBe(200);
  });
  it('edit window: own post within 24h, not others, not after', async () => {
    const { a, b } = await setup();
    const t = await topic(a);
    const p = (await call(a, 'createPost', { topic_id: t.id, body: 'v1' })).body.post;
    expect((await call(b, 'editPost', { id: p.id, body: 'hack' })).status).toBe(404);
    const e = await call(a, 'editPost', { id: p.id, body: 'v2' });
    expect(e.status).toBe(200);
    expect(e.body.post).toMatchObject({ body: 'v2' });
    expect(e.body.post.edited_at).toBeTruthy();
    await env.DB.prepare('UPDATE forum_posts SET created_date = ? WHERE id = ?').bind(new Date(Date.now() - 25 * 3600e3).toISOString(), p.id).run();
    expect((await call(a, 'editPost', { id: p.id, body: 'v3' })).status).toBe(403);
  });
});

describe('dispute topics', () => {
  it('only participants, dedupe per match, participants notified, category forced', async () => {
    const { a, b, c } = await setup();
    const m = (await submit(a, a.player, b.player)).body.match;
    expect((await call(c, 'createTopic', { category: 'disputes', title: 'Dispute: x', body: 'hi', match_id: m.id })).status).toBe(403);
    expect((await call(a, 'createTopic', { category: 'disputes', title: 'Dispute: x', body: 'hi', match_id: 'nope' })).status).toBe(404);
    const r = await call(b, 'createTopic', { category: 'general', title: 'Dispute: Alice vs Bobby', body: 'Score was wrong', match_id: m.id });
    expect(r.status).toBe(200);
    expect(r.body.topic).toMatchObject({ category: 'disputes', match_id: m.id });
    expect(r.body.existing).toBe(false);
    // Alice (other participant) gets a mention; Bobby (author) does not
    expect((await unread(a)).mentions).toBe(1);
    expect((await unread(b)).mentions).toBe(0);
    expect((await unread(c)).mentions).toBe(0);
    const again = await call(a, 'createTopic', { category: 'disputes', title: 'Dispute: again', body: 'second', match_id: m.id });
    expect(again.body).toMatchObject({ existing: true, topic: { id: r.body.topic.id } });
    expect((await call(null, 'listTopics', { match_id: m.id })).body.items).toHaveLength(1);
    expect((await call(null, 'listTopics', {})).body.items).toHaveLength(1);
    const ms = (await call(a, 'mentionsList', {})).body;
    expect(ms.items[0]).toMatchObject({ source_kind: 'post', topic_id: r.body.topic.id, unread: true, snippet: 'Score was wrong' });
  });
});

describe('mentions', () => {
  it('parses tokens: valid, invalid ignored, deduped, plain @word ignored', async () => {
    const { a, b } = await setup();
    expect(parseMentionIds(`hi ${tok(b)} and ${tok(b)} @plain @[Nope](player:)`)).toEqual([b.player.id]);
    const t = await topic(a);
    await call(a, 'createPost', { topic_id: t.id, body: `${tok(b)} ${tok(b)} @[Ghost](player:does-not-exist) @Alice @Bobby` });
    const n = await env.DB.prepare('SELECT count(*) AS n FROM mentions').first();
    expect(n.n).toBe(1);
    expect((await unread(b)).mentions).toBe(1);
  });
  it('skips self mentions and mentions from authors the mentioned user blocked', async () => {
    const { a, b, c } = await setup();
    const t = await topic(a);
    await call(a, 'createPost', { topic_id: t.id, body: `me ${tok(a)}` });
    expect((await unread(a)).mentions).toBe(0);
    await call(b, 'block', { player_id: c.player.id });
    await call(c, 'createPost', { topic_id: t.id, body: `hey ${tok(b)}` });
    expect((await unread(b)).mentions).toBe(0);
    await call(a, 'createPost', { topic_id: t.id, body: `hey ${tok(b)}` });
    expect((await unread(b)).mentions).toBe(1);
  });
  it('editing adds only new mentions; read marking; list shows people', async () => {
    const { a, b, c } = await setup();
    const t = await topic(a);
    const p = (await call(a, 'createPost', { topic_id: t.id, body: `hey ${tok(b)}` })).body.post;
    await call(a, 'editPost', { id: p.id, body: `hey ${tok(b)} and ${tok(c)}` });
    expect((await unread(b)).mentions).toBe(1);
    expect((await unread(c)).mentions).toBe(1);
    const list = (await call(b, 'mentionsList', {})).body;
    expect(list.unread).toBe(1);
    expect(list.people[a.player.id].username).toBe('Alice');
    expect(list.items[0].snippet).toContain('@Bobby');
    expect(list.items[0].snippet).not.toContain('player:');
    await call(b, 'mentionsMarkRead', { ids: [list.items[0].id] });
    expect((await unread(b)).mentions).toBe(0);
    expect((await call(b, 'mentionsMarkRead', {})).status).toBe(400);
    await call(c, 'mentionsMarkRead', { all: true });
    expect((await unread(c)).mentions).toBe(0);
  });
  it('mentions cannot be marked read by someone else', async () => {
    const { a, b, c } = await setup();
    const t = await topic(a);
    await call(a, 'createPost', { topic_id: t.id, body: `hey ${tok(b)}` });
    const id = (await call(b, 'mentionsList', {})).body.items[0].id;
    await call(c, 'mentionsMarkRead', { ids: [id] });
    expect((await unread(b)).mentions).toBe(1);
  });
  it('playerSearch finds by username/display name, escapes wildcards, limits to 8', async () => {
    const { a } = await setup();
    await call(a, 'updatePlayer', { display_name: 'Ace Ventura' });
    expect((await call(null, 'playerSearch', { q: 'ven' })).body.items.map((i) => i.username)).toEqual(['Alice']);
    expect((await call(null, 'playerSearch', { q: 'bob' })).body.items.map((i) => i.username)).toEqual(['Bobby']);
    expect((await call(null, 'playerSearch', { q: '%' })).body.items).toHaveLength(0);
    for (let i = 0; i < 9; i++) await mkPlayer(`Zed${i}`);
    expect((await call(null, 'playerSearch', { q: 'zed' })).body.items).toHaveLength(8);
    const one = (await call(null, 'playerSearch', { q: 'alice' })).body.items[0];
    expect(Object.keys(one).sort()).toEqual(['avatar_url', 'display_name', 'id', 'username']);
  });
});

describe('direct messages', () => {
  async function thread(from, to) {
    const r = await call(from, 'dmStart', { player_id: to.player.id });
    expect(r.status).toBe(200);
    return r.body.thread;
  }
  it('start is idempotent, never with yourself; only participants read or send (404 otherwise)', async () => {
    const { a, b, c } = await setup();
    expect((await call(a, 'dmStart', { player_id: a.player.id })).status).toBe(400);
    const t = await thread(a, b);
    expect((await thread(b, a)).id).toBe(t.id);
    expect((await call(a, 'dmSend', { thread_id: t.id, body: ' hello ' })).body.message.body).toBe('hello');
    expect((await call(c, 'dmMessages', { thread_id: t.id })).status).toBe(404);
    expect((await call(c, 'dmSend', { thread_id: t.id, body: 'peek' })).status).toBe(404);
    expect((await call(c, 'dmMarkRead', { thread_id: t.id })).status).toBe(404);
    expect((await call(null, 'dmMessages', { thread_id: t.id })).status).toBe(401);
    expect((await call(c, 'dmList', {})).body.items).toHaveLength(0);
    const msgs = (await call(b, 'dmMessages', { thread_id: t.id })).body;
    expect(msgs.items).toMatchObject([{ body: 'hello', mine: false }]);
    expect(msgs.thread.other.username).toBe('Alice');
    expect(msgs.can_send).toBe(true);
  });
  it('unread flags, previews, mark read, and chatUnread counts', async () => {
    const { a, b } = await setup();
    const t = await thread(a, b);
    expect((await unread(b)).dms).toBe(0); // empty threads don't count or list
    await call(a, 'dmSend', { thread_id: t.id, body: 'ping 1' });
    await call(a, 'dmSend', { thread_id: t.id, body: `ping 2 ${tok(b)}` });
    expect((await unread(b)).dms).toBe(1); // threads, not messages
    expect((await unread(a)).dms).toBe(0); // my own messages aren't unread
    const lb = (await call(b, 'dmList', {})).body.items;
    expect(lb).toHaveLength(1);
    expect(lb[0]).toMatchObject({ unread: true, last_from_me: false, preview: 'ping 2 @Bobby' });
    expect((await unread(b)).mentions).toBe(1);
    await call(b, 'dmMarkRead', { thread_id: t.id });
    expect((await unread(b))).toMatchObject({ dms: 0, mentions: 0 }); // DM mentions clear with the thread
    expect((await call(b, 'dmList', {})).body.items[0].unread).toBe(false);
    await call(b, 'dmSend', { thread_id: t.id, body: 'pong' });
    expect((await unread(a)).dms).toBe(1);
  });
  it('DM mentions only reach participants', async () => {
    const { a, b, c } = await setup();
    const t = await thread(a, b);
    await call(a, 'dmSend', { thread_id: t.id, body: `look at ${tok(c)} and ${tok(a)}` });
    expect((await unread(c)).mentions).toBe(0);
    expect((await unread(a)).mentions).toBe(0);
    expect((await unread(b)).mentions).toBe(0);
    await call(a, 'dmSend', { thread_id: t.id, body: `you ${tok(b)}` });
    expect((await unread(b)).mentions).toBe(1);
  });
  it('polling: after returns only new messages; older pages via cursor', async () => {
    const { a, b } = await setup();
    const t = await thread(a, b);
    for (let i = 0; i < 53; i++) {
      await env.DB.prepare('INSERT INTO dm_messages (id, thread_id, created_date, sender_user_id, body) VALUES (?,?,?,?,?)').bind(`m${String(i).padStart(3, '0')}`, t.id, `2020-01-01T00:00:${String(i).padStart(2, '0')}.000Z`, i % 2 ? a.id : b.id, `msg${i}`).run();
    }
    const first = (await call(a, 'dmMessages', { thread_id: t.id })).body;
    expect(first.items).toHaveLength(50);
    expect(first.items[49].body).toBe('msg52');
    expect(first.older_cursor).toBeTruthy();
    const older = (await call(a, 'dmMessages', { thread_id: t.id, cursor: first.older_cursor })).body;
    expect(older.items.map((m) => m.body)).toEqual(['msg0', 'msg1', 'msg2']);
    expect(older.older_cursor).toBeNull();
    const poll = (await call(a, 'dmMessages', { thread_id: t.id, after: first.items[49].created_date })).body;
    expect(poll.items.map((m) => m.body)).toEqual(['msg52']);
    await call(b, 'dmSend', { thread_id: t.id, body: 'fresh' });
    const poll2 = (await call(a, 'dmMessages', { thread_id: t.id, after: first.items[49].created_date })).body;
    expect(poll2.items.map((m) => m.body)).toEqual(['msg52', 'fresh']);
  });
  it('blocking stops dmStart/dmSend both ways, unblock restores', async () => {
    const { a, b } = await setup();
    const t = await thread(a, b);
    await call(a, 'dmSend', { thread_id: t.id, body: 'before' });
    expect((await call(b, 'block', { player_id: a.player.id })).status).toBe(200);
    expect((await call(a, 'dmSend', { thread_id: t.id, body: 'after' })).status).toBe(403);
    expect((await call(b, 'dmSend', { thread_id: t.id, body: 'reply' })).status).toBe(403);
    expect((await call(a, 'dmStart', { player_id: b.player.id })).status).toBe(403);
    expect((await call(b, 'dmStart', { player_id: a.player.id })).status).toBe(403);
    const m = (await call(b, 'dmMessages', { thread_id: t.id })).body;
    expect(m).toMatchObject({ i_blocked: true, can_send: false });
    expect((await call(a, 'dmMessages', { thread_id: t.id })).body).toMatchObject({ i_blocked: false, can_send: false });
    expect((await call(b, 'block', { player_id: b.player.id })).status).toBe(400);
    await call(b, 'unblock', { player_id: a.player.id });
    expect((await call(a, 'dmSend', { thread_id: t.id, body: 'hi again' })).status).toBe(200);
  });
});

describe('rate limits', () => {
  it('30 posts/DMs per 10 minutes and 10 topics a day', async () => {
    const { a, b } = await setup();
    const t = await topic(a);
    const th = (await call(a, 'dmStart', { player_id: b.player.id })).body.thread;
    for (let i = 0; i < 14; i++) expect((await call(a, 'createPost', { topic_id: t.id, body: `p${i}` })).status).toBe(200);
    for (let i = 0; i < 15; i++) expect((await call(a, 'dmSend', { thread_id: th.id, body: `d${i}` })).status).toBe(200);
    // 1 first post + 14 + 15 = 30
    expect((await call(a, 'createPost', { topic_id: t.id, body: 'too many' })).status).toBe(429);
    expect((await call(a, 'dmSend', { thread_id: th.id, body: 'too many' })).status).toBe(429);
    expect((await call(b, 'createPost', { topic_id: t.id, body: 'fine' })).status).toBe(200);
  });
  it('daily cap of 300 and 10 topics', async () => {
    const { a } = await setup();
    const t = await topic(a);
    const old = new Date(Date.now() - 3 * 3600e3).toISOString();
    for (let i = 0; i < 299; i++) await env.DB.prepare('INSERT INTO forum_posts (id, topic_id, created_date, author_user_id, body) VALUES (?,?,?,?,?)').bind(`r${i}`, t.id, old, a.id, 'x').run();
    expect((await call(a, 'createPost', { topic_id: t.id, body: 'last' })).status).toBe(429); // 299 + the first post = 300
    await reset();
    const u = await mkPlayer('Dave');
    for (let i = 0; i < 10; i++) await env.DB.prepare(`INSERT INTO forum_topics (id, created_date, updated_date, category, title, author_user_id, last_post_at) VALUES (?,?,?,?,?,?,?)`).bind(`t${i}`, old, old, 'general', 'abc', u.id, old).run();
    const r = await call(u, 'createTopic', { category: 'general', title: 'one more', body: 'x' });
    expect(r.status).toBe(429);
  });
  it('20 reports a day', async () => {
    const { a, b } = await setup();
    const t = await topic(a);
    for (let i = 0; i < 20; i++) await env.DB.prepare('INSERT INTO reports (id, created_date, reporter_user_id, kind, target_id, reason) VALUES (?,?,?,?,?,?)').bind(`rp${i}`, new Date().toISOString(), b.id, 'topic', `other${i}`, 'x').run();
    expect((await call(b, 'report', { kind: 'topic', target_id: t.id, reason: 'spam' })).status).toBe(429);
  });
});

describe('reports', () => {
  it('admin-only list/resolve; reporter sees nothing; DM reports need participation', async () => {
    const { a, b, c } = await setup();
    const admin = await mkPlayer('Boss');
    await makeAdmin(admin);
    const t = await topic(a);
    const th = (await call(a, 'dmStart', { player_id: b.player.id })).body.thread;
    const dm = (await call(a, 'dmSend', { thread_id: th.id, body: 'rude words' })).body.message;
    expect((await call(c, 'report', { kind: 'dm', target_id: dm.id, reason: 'nosy' })).status).toBe(404);
    expect((await call(b, 'report', { kind: 'dm', target_id: dm.id, reason: 'rude' })).status).toBe(200);
    expect((await call(b, 'report', { kind: 'topic', target_id: t.id, reason: 'spam' })).status).toBe(200);
    expect((await call(b, 'report', { kind: 'topic', target_id: t.id, reason: 'spam' })).status).toBe(200); // deduped
    expect((await call(b, 'report', { kind: 'post', target_id: 'nope', reason: 'x' })).status).toBe(404);
    expect((await call(b, 'report', { kind: 'post', target_id: t.id, reason: '' })).status).toBe(400);
    expect((await call(b, 'report', { kind: 'bogus', target_id: t.id, reason: 'x' })).status).toBe(400);
    expect((await call(b, 'adminReports', {})).status).toBe(403);
    expect((await call(b, 'adminResolveReport', { id: 'x', status: 'resolved' })).status).toBe(403);
    expect((await call(null, 'adminReports', {})).status).toBe(401);
    expect((await unread(admin)).reports).toBe(2);
    expect((await unread(b)).reports).toBe(0);
    const l = (await call(admin, 'adminReports', {})).body;
    expect(l.items).toHaveLength(2);
    expect(l.open_count).toBe(2);
    expect(l.items.find((i) => i.kind === 'dm').target.text).toBe('rude words');
    await call(admin, 'adminResolveReport', { id: l.items[0].id, status: 'dismissed' });
    expect((await call(admin, 'adminReports', {})).body.items).toHaveLength(1);
    expect((await call(admin, 'adminReports', { status: 'dismissed' })).body.items).toHaveLength(1);
    expect((await unread(admin)).reports).toBe(1);
  });
});

describe('privacy and safety', () => {
  it('entity endpoints cannot read chat tables', async () => {
    const { a } = await setup();
    await topic(a);
    for (const e of ['forum_topics', 'ForumTopic', 'forum_posts', 'dm_messages', 'dm_threads', 'mentions', 'blocks', 'reports']) {
      const r = await get(`/api/entities/${e}`, a);
      expect([400, 404]).toContain(r.status);
      expect(JSON.stringify(r.body)).not.toMatch(/Hello there/);
    }
  });
  it('script bodies are stored as plain text and the API never returns HTML', async () => {
    const { a, b } = await setup();
    const evil = '<script>alert(1)</script><img src=x onerror=alert(1)>';
    const t = await topic(a, { title: '<b>bold</b> title', body: evil });
    const th = (await call(a, 'dmStart', { player_id: b.player.id })).body.thread;
    await call(a, 'dmSend', { thread_id: th.id, body: evil });
    const row = await env.DB.prepare('SELECT body FROM forum_posts WHERE topic_id = ?').bind(t.id).first();
    expect(row.body).toBe(evil);
    const res = await (await import('./helpers.js')).app.request('/api/functions/getTopic', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787' }, body: JSON.stringify({ id: t.id }) });
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(JSON.parse(await res.text()).posts[0].body).toBe(evil);
  });
  it('cross-origin writes are blocked', async () => {
    const { a } = await setup();
    const { app } = await import('./helpers.js');
    const res = await app.request('/api/functions/createTopic', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Cookie: a.cookie }, body: JSON.stringify({ category: 'general', title: 'abc', body: 'x' }) });
    expect(res.status).toBe(403);
  });
  it('deleting an account removes DMs and blanks public posts', async () => {
    const { a, b } = await setup();
    const t = await topic(a);
    const th = (await call(a, 'dmStart', { player_id: b.player.id })).body.thread;
    await call(a, 'dmSend', { thread_id: th.id, body: 'bye' });
    expect((await call(a, 'deleteAccount', { confirm: 'DELETE' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM dm_threads').first()).n).toBe(0);
    const g = (await call(null, 'getTopic', { id: t.id })).body;
    expect(g.posts[0]).toMatchObject({ removed: true, body: '' });
  });
});
