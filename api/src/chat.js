import { all, first, stmt, uuid, nowIso, placeholders } from './db.js';
import { HttpError, bad } from './errors.js';

// Chat (forum + private messages + mentions + blocks + reports). These tables are NOT in the entity whitelist
// (schema.js ENTITIES): they are only reachable through the functions below.
export const CATEGORIES = ['general', 'disputes', 'lfg'];
export const REPORT_KINDS = ['post', 'dm', 'topic'];
const MAX_BODY = 4000;
const MIN_TITLE = 3;
const MAX_TITLE = 120;
const MAX_REASON = 500;
const PAGE = 50;
const TOPIC_PAGE = 30;
const EDIT_WINDOW_MS = 24 * 3600e3;
const MAX_MENTIONS = 10;
const MSGS_PER_10_MIN = 30;
const MSGS_PER_DAY = 300;
const TOPICS_PER_DAY = 10;
const REPORTS_PER_DAY = 20;

const isStr = (v) => typeof v === 'string';
const isAdmin = (user) => user?.role === 'admin';
const adminOnly = (user) => {
  if (!isAdmin(user)) throw new HttpError(403, 'Admins only.');
};
const agoIso = (ms) => new Date(Date.now() - ms).toISOString();

function cleanBody(v) {
  if (!isStr(v)) throw bad('Write a message first.');
  const b = v.trim();
  if (!b) throw bad('Write a message first.');
  if (b.length > MAX_BODY) throw bad(`Messages are at most ${MAX_BODY} characters.`);
  return b;
}
function cleanTitle(v) {
  if (!isStr(v)) throw bad('Give the topic a title.');
  const t = v.replace(/\s+/g, ' ').trim();
  if (t.length < MIN_TITLE) throw bad(`Titles are at least ${MIN_TITLE} characters.`);
  if (t.length > MAX_TITLE) throw bad(`Titles are at most ${MAX_TITLE} characters.`);
  return t;
}
function cleanId(v, what = 'id') {
  if (!isStr(v) || !v || v.length > 80) throw bad(`Missing ${what}.`);
  return v;
}
/** "<iso>|<id>" cursors. */
function parseCursor(v) {
  if (v == null || v === '') return null;
  if (!isStr(v) || !v.includes('|') || v.length > 120) throw bad('Bad cursor.');
  const i = v.indexOf('|');
  return { d: v.slice(0, i), id: v.slice(i + 1) };
}
const cursorOf = (d, id) => `${d}|${id}`;

async function requireMe(env, user) {
  const p = await first(env, 'SELECT id, user_id, username, display_name, avatar_url FROM players WHERE user_id = ?', user.id);
  if (!p) throw new HttpError(400, 'Create your player profile first.');
  return p;
}

// ---------- mentions ----------
// Bodies carry tokens `@[Display Name](player:<player_id>)`; plain "@word" is just text.
const MENTION_RE = /@\[([^\]\n]{1,60})\]\(player:([A-Za-z0-9_-]{1,64})\)/g;
export function parseMentionIds(body) {
  const ids = [];
  for (const m of String(body || '').matchAll(MENTION_RE)) {
    if (!ids.includes(m[2])) ids.push(m[2]);
    if (ids.length >= MAX_MENTIONS) break;
  }
  return ids;
}

const plain = (s) => String(s || '').replace(MENTION_RE, '@$1');
const personOf = (p) => ({ id: p.id, username: p.username, display_name: p.display_name || null, avatar_url: p.avatar_url || null });

/** id -> {id, username, display_name, avatar_url} for every id that still exists (the client falls back to the stored token text). */
async function peopleMap(env, ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const out = {};
  for (let i = 0; i < uniq.length; i += 80) {
    const chunk = uniq.slice(i, i + 80);
    const rows = await all(env, `SELECT id, username, display_name, avatar_url FROM players WHERE id IN (${placeholders(chunk.length)})`, ...chunk);
    for (const r of rows) out[r.id] = personOf(r);
  }
  return out;
}

/**
 * Create mention rows for the tokens in `body`. Skips: unknown players, the author, people who blocked the author,
 * people already mentioned by this source, and (when `onlyUserIds` is given) anyone outside that set.
 */
async function recordMentions(env, { body, ids, authorUserId, kind, sourceId, topicId = null, threadId = null, onlyUserIds = null }) {
  const wanted = ids ?? parseMentionIds(body);
  if (!wanted.length) return 0;
  const players = await all(env, `SELECT id, user_id FROM players WHERE id IN (${placeholders(wanted.length)})`, ...wanted);
  let targets = players.filter((p) => p.user_id !== authorUserId && (!onlyUserIds || onlyUserIds.includes(p.user_id)));
  if (!targets.length) return 0;
  const uids = targets.map((p) => p.user_id);
  const blockers = new Set(
    (await all(env, `SELECT blocker_user_id AS u FROM blocks WHERE blocked_user_id = ? AND blocker_user_id IN (${placeholders(uids.length)})`, authorUserId, ...uids)).map((r) => r.u),
  );
  const already = new Set(
    (await all(env, 'SELECT mentioned_user_id AS u FROM mentions WHERE source_kind = ? AND source_id = ?', kind, sourceId)).map((r) => r.u),
  );
  targets = targets.filter((p) => !blockers.has(p.user_id) && !already.has(p.user_id));
  if (!targets.length) return 0;
  const now = nowIso();
  await env.DB.batch(
    targets.map((p) =>
      stmt(
        env,
        `INSERT INTO mentions (id, created_date, mentioned_player_id, mentioned_user_id, source_kind, source_id, topic_id, thread_id, by_user_id)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        uuid(), now, p.id, p.user_id, kind, sourceId, topicId, threadId, authorUserId,
      ),
    ),
  );
  return targets.length;
}

// ---------- rate limits ----------
async function checkMessageRate(env, user) {
  const tenMin = agoIso(10 * 60e3);
  const day = agoIso(86400e3);
  const r = await first(
    env,
    `SELECT
       (SELECT count(*) FROM forum_posts WHERE author_user_id = ?1 AND created_date > ?2) +
       (SELECT count(*) FROM dm_messages WHERE sender_user_id = ?1 AND created_date > ?2) AS recent,
       (SELECT count(*) FROM forum_posts WHERE author_user_id = ?1 AND created_date > ?3) +
       (SELECT count(*) FROM dm_messages WHERE sender_user_id = ?1 AND created_date > ?3) AS today`,
    user.id, tenMin, day,
  );
  if (r.recent >= MSGS_PER_10_MIN) throw new HttpError(429, "You're posting very quickly. Wait a few minutes and try again.");
  if (r.today >= MSGS_PER_DAY) throw new HttpError(429, "You've reached today's message limit. Please try again tomorrow.");
}

// ---------- blocks ----------
const blockedEitherWay = async (env, a, b) =>
  !!(await first(env, 'SELECT 1 AS x FROM blocks WHERE (blocker_user_id = ? AND blocked_user_id = ?) OR (blocker_user_id = ? AND blocked_user_id = ?)', a, b, b, a));

// ---------- forum ----------
const pubTopic = (t) => ({
  id: t.id, created_date: t.created_date, category: t.category, title: t.title, author_player_id: t.author_player_id,
  match_id: t.match_id, locked: !!t.locked, hidden: !!t.hidden, last_post_at: t.last_post_at, post_count: t.post_count,
});

function pubPost(p, { admin, userId }) {
  const gone = !!(p.hidden || p.deleted);
  const removed = gone && !admin;
  return {
    id: p.id, topic_id: p.topic_id, created_date: p.created_date,
    edited_at: removed ? null : p.edited_at,
    author_player_id: removed ? null : p.author_player_id,
    body: removed ? '' : p.body,
    removed: gone, hidden: !!p.hidden, deleted: !!p.deleted,
    mine: !!userId && p.author_user_id === userId,
  };
}

export async function listTopics({ env, user }, body) {
  const where = [];
  const params = [];
  if (body.category != null && body.category !== '') {
    if (!CATEGORIES.includes(body.category)) throw bad('Unknown category.');
    where.push('category = ?');
    params.push(body.category);
  }
  if (body.match_id != null && body.match_id !== '') {
    where.push('match_id = ?');
    params.push(cleanId(body.match_id, 'match id'));
  }
  if (!isAdmin(user)) where.push('hidden = 0');
  const c = parseCursor(body.cursor);
  if (c) {
    where.push('(last_post_at < ? OR (last_post_at = ? AND id < ?))');
    params.push(c.d, c.d, c.id);
  }
  const rows = await all(
    env,
    `SELECT * FROM forum_topics ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY last_post_at DESC, id DESC LIMIT ${TOPIC_PAGE + 1}`,
    ...params,
  );
  const page = rows.slice(0, TOPIC_PAGE);
  const last = page[page.length - 1];
  return {
    items: page.map(pubTopic),
    people: await peopleMap(env, page.map((t) => t.author_player_id)),
    next_cursor: rows.length > TOPIC_PAGE && last ? cursorOf(last.last_post_at, last.id) : null,
  };
}

export async function getTopic({ env, user }, body) {
  const id = cleanId(body.id, 'topic id');
  const admin = isAdmin(user);
  const t = await first(env, 'SELECT * FROM forum_topics WHERE id = ?', id);
  if (!t || (t.hidden && !admin)) throw new HttpError(404, 'Topic not found.');
  const c = parseCursor(body.cursor);
  const rows = await all(
    env,
    `SELECT * FROM forum_posts WHERE topic_id = ?${c ? ' AND (created_date > ? OR (created_date = ? AND id > ?))' : ''}
     ORDER BY created_date, id LIMIT ${PAGE + 1}`,
    ...(c ? [id, c.d, c.d, c.id] : [id]),
  );
  const page = rows.slice(0, PAGE);
  const last = page[page.length - 1];
  const posts = page.map((p) => pubPost(p, { admin, userId: user?.id }));
  const shown = page.filter((p) => !((p.hidden || p.deleted) && !admin));
  const ids = [t.author_player_id, ...shown.map((p) => p.author_player_id), ...shown.flatMap((p) => parseMentionIds(p.body))];
  return {
    topic: pubTopic(t),
    posts,
    people: await peopleMap(env, ids),
    next_cursor: rows.length > PAGE && last ? cursorOf(last.created_date, last.id) : null,
  };
}

export async function createTopic({ env, user }, body) {
  const me = await requireMe(env, user);
  const title = cleanTitle(body.title);
  const text = cleanBody(body.body);
  let category = body.category;
  let match = null;
  if (body.match_id != null && body.match_id !== '') {
    const matchId = cleanId(body.match_id, 'match id');
    match = await first(env, 'SELECT id, all_user_ids, all_player_ids FROM matches WHERE id = ?', matchId);
    if (!match) throw new HttpError(404, 'Match not found.');
    const uids = JSON.parse(match.all_user_ids);
    if (!uids.includes(user.id)) throw new HttpError(403, 'Only the players in this match can open a topic about it.');
    const existing = await first(env, 'SELECT * FROM forum_topics WHERE match_id = ?', match.id);
    if (existing) return { topic: pubTopic(existing), existing: true };
    category = 'disputes';
  }
  if (!CATEGORIES.includes(category)) throw bad('Choose a category.');
  const day = await first(env, 'SELECT count(*) AS n FROM forum_topics WHERE author_user_id = ? AND created_date > ?', user.id, agoIso(86400e3));
  if (day.n >= TOPICS_PER_DAY) throw new HttpError(429, "You've started plenty of topics today. Please try again tomorrow.");
  await checkMessageRate(env, user);
  const now = nowIso();
  const topicId = uuid();
  const postId = uuid();
  try {
    await env.DB.batch([
      stmt(
        env,
        `INSERT INTO forum_topics (id, created_date, updated_date, category, title, author_user_id, author_player_id, match_id, last_post_at, post_count)
         VALUES (?,?,?,?,?,?,?,?,?,1)`,
        topicId, now, now, category, title, user.id, me.id, match?.id ?? null, now,
      ),
      stmt(env, 'INSERT INTO forum_posts (id, topic_id, created_date, author_user_id, author_player_id, body) VALUES (?,?,?,?,?,?)', postId, topicId, now, user.id, me.id, text),
    ]);
  } catch (e) {
    if (match && /UNIQUE constraint failed/i.test(`${e?.message} ${e?.cause?.message}`)) {
      const existing = await first(env, 'SELECT * FROM forum_topics WHERE match_id = ?', match.id);
      if (existing) return { topic: pubTopic(existing), existing: true };
    }
    throw e;
  }
  // Mentions typed in the body, plus (for a dispute) everyone else in the match.
  const ids = parseMentionIds(text);
  if (match) for (const pid of JSON.parse(match.all_player_ids)) if (!ids.includes(pid)) ids.push(pid);
  await recordMentions(env, { ids, authorUserId: user.id, kind: 'post', sourceId: postId, topicId });
  return { topic: pubTopic(await first(env, 'SELECT * FROM forum_topics WHERE id = ?', topicId)), existing: false };
}

export async function createPost({ env, user }, body) {
  const me = await requireMe(env, user);
  const topicId = cleanId(body.topic_id, 'topic id');
  const text = cleanBody(body.body);
  const t = await first(env, 'SELECT * FROM forum_topics WHERE id = ?', topicId);
  if (!t || (t.hidden && !isAdmin(user))) throw new HttpError(404, 'Topic not found.');
  if (t.locked && !isAdmin(user)) throw new HttpError(403, 'This topic is locked.');
  await checkMessageRate(env, user);
  const now = nowIso();
  const id = uuid();
  await env.DB.batch([
    stmt(env, 'INSERT INTO forum_posts (id, topic_id, created_date, author_user_id, author_player_id, body) VALUES (?,?,?,?,?,?)', id, topicId, now, user.id, me.id, text),
    stmt(env, 'UPDATE forum_topics SET post_count = post_count + 1, last_post_at = ?, updated_date = ? WHERE id = ?', now, now, topicId),
  ]);
  await recordMentions(env, { body: text, authorUserId: user.id, kind: 'post', sourceId: id, topicId });
  const post = await first(env, 'SELECT * FROM forum_posts WHERE id = ?', id);
  return { post: pubPost(post, { admin: isAdmin(user), userId: user.id }), people: await peopleMap(env, [me.id, ...parseMentionIds(text)]) };
}

export async function editPost({ env, user }, body) {
  const id = cleanId(body.id, 'post id');
  const text = cleanBody(body.body);
  const p = await first(env, 'SELECT * FROM forum_posts WHERE id = ?', id);
  if (!p || p.author_user_id !== user.id || p.hidden || p.deleted) throw new HttpError(404, 'Post not found.');
  if (Date.now() - new Date(p.created_date).getTime() > EDIT_WINDOW_MS) throw new HttpError(403, 'Posts can only be edited for 24 hours.');
  if (text === p.body) return { post: pubPost(p, { admin: isAdmin(user), userId: user.id }) };
  await stmt(env, 'UPDATE forum_posts SET body = ?, edited_at = ? WHERE id = ?', text, nowIso(), id).run();
  await recordMentions(env, { body: text, authorUserId: user.id, kind: 'post', sourceId: id, topicId: p.topic_id });
  return { post: pubPost(await first(env, 'SELECT * FROM forum_posts WHERE id = ?', id), { admin: isAdmin(user), userId: user.id }) };
}

/** Own post -> deleted=1. An admin on someone else's post -> hidden=1 (`restore: true` un-hides). */
export async function deletePost({ env, user }, body) {
  const id = cleanId(body.id, 'post id');
  const p = await first(env, 'SELECT * FROM forum_posts WHERE id = ?', id);
  if (!p) throw new HttpError(404, 'Post not found.');
  const own = p.author_user_id === user.id;
  if (!own && !isAdmin(user)) throw new HttpError(404, 'Post not found.');
  if (body.restore) {
    adminOnly(user);
    await stmt(env, 'UPDATE forum_posts SET hidden = 0 WHERE id = ?', id).run();
  } else if (own) {
    await stmt(env, 'UPDATE forum_posts SET deleted = 1 WHERE id = ?', id).run();
  } else {
    await stmt(env, 'UPDATE forum_posts SET hidden = 1 WHERE id = ?', id).run();
  }
  return { post: pubPost(await first(env, 'SELECT * FROM forum_posts WHERE id = ?', id), { admin: isAdmin(user), userId: user.id }) };
}

export async function adminTopic({ env, user }, body) {
  adminOnly(user);
  const id = cleanId(body.id, 'topic id');
  const t = await first(env, 'SELECT * FROM forum_topics WHERE id = ?', id);
  if (!t) throw new HttpError(404, 'Topic not found.');
  const locked = body.locked === undefined ? t.locked : body.locked ? 1 : 0;
  const hidden = body.hidden === undefined ? t.hidden : body.hidden ? 1 : 0;
  await stmt(env, 'UPDATE forum_topics SET locked = ?, hidden = ?, updated_date = ? WHERE id = ?', locked, hidden, nowIso(), id).run();
  return { topic: pubTopic(await first(env, 'SELECT * FROM forum_topics WHERE id = ?', id)) };
}

// ---------- direct messages ----------
const pairOf = (a, b) => (a < b ? [a, b] : [b, a]);

async function requireThread(env, user, threadId) {
  const t = await first(env, 'SELECT * FROM dm_threads WHERE id = ?', cleanId(threadId, 'thread id'));
  if (!t || (t.user_a !== user.id && t.user_b !== user.id)) throw new HttpError(404, 'Conversation not found.');
  return t;
}
const otherUser = (t, user) => (t.user_a === user.id ? t.user_b : t.user_a);

async function threadSummary(env, user, t) {
  const otherUid = otherUser(t, user);
  const other = await first(env, 'SELECT id, username, display_name, avatar_url FROM players WHERE user_id = ?', otherUid);
  return { id: t.id, created_date: t.created_date, last_message_at: t.last_message_at, other: other ? personOf(other) : null };
}

export async function dmStart({ env, user }, body) {
  await requireMe(env, user);
  const pid = cleanId(body.player_id, 'player id');
  const other = await first(env, 'SELECT id, user_id, username, display_name, avatar_url FROM players WHERE id = ?', pid);
  if (!other) throw new HttpError(404, 'Player not found.');
  if (other.user_id === user.id) throw bad("You can't message yourself.");
  if (await blockedEitherWay(env, user.id, other.user_id)) throw new HttpError(403, "You can't message this player.");
  const [a, b] = pairOf(user.id, other.user_id);
  await stmt(env, 'INSERT OR IGNORE INTO dm_threads (id, created_date, user_a, user_b) VALUES (?,?,?,?)', uuid(), nowIso(), a, b).run();
  const t = await first(env, 'SELECT * FROM dm_threads WHERE user_a = ? AND user_b = ?', a, b);
  return { thread: await threadSummary(env, user, t) };
}

export async function dmList({ env, user }, body) {
  const c = parseCursor(body.cursor);
  const rows = await all(
    env,
    `SELECT t.*,
       (SELECT body FROM dm_messages m WHERE m.thread_id = t.id ORDER BY m.created_date DESC, m.id DESC LIMIT 1) AS last_body,
       (SELECT sender_user_id FROM dm_messages m WHERE m.thread_id = t.id ORDER BY m.created_date DESC, m.id DESC LIMIT 1) AS last_sender,
       (SELECT deleted FROM dm_messages m WHERE m.thread_id = t.id ORDER BY m.created_date DESC, m.id DESC LIMIT 1) AS last_deleted,
       EXISTS (SELECT 1 FROM dm_messages m WHERE m.thread_id = t.id AND m.sender_user_id <> ?1 AND m.deleted = 0
         AND m.created_date > COALESCE((SELECT last_read_at FROM dm_reads r WHERE r.thread_id = t.id AND r.user_id = ?1), '')) AS unread
     FROM dm_threads t
     WHERE (t.user_a = ?1 OR t.user_b = ?1) AND t.last_message_at IS NOT NULL
       ${c ? 'AND (t.last_message_at < ?2 OR (t.last_message_at = ?2 AND t.id < ?3))' : ''}
     ORDER BY t.last_message_at DESC, t.id DESC LIMIT ${TOPIC_PAGE + 1}`,
    user.id, ...(c ? [c.d, c.id] : []),
  );
  const page = rows.slice(0, TOPIC_PAGE);
  const items = [];
  for (const t of page) {
    items.push({
      ...(await threadSummary(env, user, t)),
      preview: t.last_deleted ? '[removed]' : plain(t.last_body).slice(0, 140),
      last_from_me: t.last_sender === user.id,
      unread: !!t.unread,
    });
  }
  const last = page[page.length - 1];
  return { items, next_cursor: rows.length > TOPIC_PAGE && last ? cursorOf(last.last_message_at, last.id) : null };
}

export async function dmMessages({ env, user }, body) {
  const t = await requireThread(env, user, body.thread_id);
  const otherUid = otherUser(t, user);
  let rows;
  let olderCursor = null;
  if (body.after != null && body.after !== '') {
    // Polling: everything at or after the newest timestamp the client has (it de-duplicates by id).
    if (!isStr(body.after) || Number.isNaN(Date.parse(body.after))) throw bad('Bad cursor.');
    rows = await all(env, 'SELECT * FROM dm_messages WHERE thread_id = ? AND created_date >= ? ORDER BY created_date, id LIMIT 100', t.id, body.after);
  } else {
    const c = parseCursor(body.cursor);
    const desc = await all(
      env,
      `SELECT * FROM dm_messages WHERE thread_id = ?${c ? ' AND (created_date < ? OR (created_date = ? AND id < ?))' : ''}
       ORDER BY created_date DESC, id DESC LIMIT ${PAGE + 1}`,
      ...(c ? [t.id, c.d, c.d, c.id] : [t.id]),
    );
    const page = desc.slice(0, PAGE);
    rows = page.reverse();
    if (desc.length > PAGE && rows[0]) olderCursor = cursorOf(rows[0].created_date, rows[0].id);
  }
  const items = rows.map((m) => ({
    id: m.id, thread_id: m.thread_id, created_date: m.created_date, sender_user_id: m.sender_user_id,
    mine: m.sender_user_id === user.id, body: m.deleted ? '' : m.body, removed: !!m.deleted,
  }));
  const me = await first(env, 'SELECT id FROM players WHERE user_id = ?', user.id);
  const other = await first(env, 'SELECT id, username, display_name, avatar_url FROM players WHERE user_id = ?', otherUid);
  const iBlocked = !!(await first(env, 'SELECT 1 AS x FROM blocks WHERE blocker_user_id = ? AND blocked_user_id = ?', user.id, otherUid));
  const blockedMe = !!(await first(env, 'SELECT 1 AS x FROM blocks WHERE blocker_user_id = ? AND blocked_user_id = ?', otherUid, user.id));
  const people = await peopleMap(env, [me?.id, ...items.flatMap((m) => parseMentionIds(m.body))]);
  if (other) people[other.id] = personOf(other);
  return {
    thread: { id: t.id, last_message_at: t.last_message_at, other: other ? personOf(other) : null, my_player_id: me?.id ?? null },
    items,
    people,
    older_cursor: olderCursor,
    i_blocked: iBlocked,
    can_send: !iBlocked && !blockedMe && !!other,
  };
}

export async function dmSend({ env, user }, body) {
  await requireMe(env, user);
  const t = await requireThread(env, user, body.thread_id);
  const text = cleanBody(body.body);
  const otherUid = otherUser(t, user);
  const other = await first(env, 'SELECT id FROM players WHERE user_id = ?', otherUid);
  if (!other) throw new HttpError(403, 'That player is no longer on Penged.');
  if (await blockedEitherWay(env, user.id, otherUid)) throw new HttpError(403, "You can't message this player.");
  await checkMessageRate(env, user);
  const now = nowIso();
  const id = uuid();
  await env.DB.batch([
    stmt(env, 'INSERT INTO dm_messages (id, thread_id, created_date, sender_user_id, body) VALUES (?,?,?,?,?)', id, t.id, now, user.id, text),
    stmt(env, 'UPDATE dm_threads SET last_message_at = ? WHERE id = ?', now, t.id),
    stmt(env, 'INSERT INTO dm_reads (thread_id, user_id, last_read_at) VALUES (?,?,?) ON CONFLICT(thread_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at', t.id, user.id, now),
  ]);
  // DM mentions only reach the two people in the conversation.
  await recordMentions(env, { body: text, authorUserId: user.id, kind: 'dm', sourceId: id, threadId: t.id, onlyUserIds: [t.user_a, t.user_b] });
  return {
    message: { id, thread_id: t.id, created_date: now, sender_user_id: user.id, mine: true, body: text, removed: false },
  };
}

export async function dmMarkRead({ env, user }, body) {
  const t = await requireThread(env, user, body.thread_id);
  const now = nowIso();
  await env.DB.batch([
    stmt(env, 'INSERT INTO dm_reads (thread_id, user_id, last_read_at) VALUES (?,?,?) ON CONFLICT(thread_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at', t.id, user.id, now),
    stmt(env, "UPDATE mentions SET read_at = ? WHERE source_kind = 'dm' AND thread_id = ? AND mentioned_user_id = ? AND read_at IS NULL", now, t.id, user.id),
  ]);
  return { ok: true };
}

// ---------- mentions ----------
export async function mentionsList({ env, user }, body) {
  const c = parseCursor(body.cursor);
  const rows = await all(
    env,
    `SELECT m.id, m.created_date, m.source_kind, m.source_id, m.topic_id, m.thread_id, m.read_at, m.by_user_id,
       p.author_player_id AS post_author, p.body AS post_body, p.hidden AS post_hidden, p.deleted AS post_deleted, p.topic_id AS post_topic,
       t.title AS topic_title, t.hidden AS topic_hidden,
       d.body AS dm_body, d.deleted AS dm_deleted,
       (SELECT id FROM players WHERE user_id = m.by_user_id) AS by_player_id
     FROM mentions m
     LEFT JOIN forum_posts p ON m.source_kind = 'post' AND p.id = m.source_id
     LEFT JOIN forum_topics t ON t.id = m.topic_id
     LEFT JOIN dm_messages d ON m.source_kind = 'dm' AND d.id = m.source_id
     WHERE m.mentioned_user_id = ?1${c ? ' AND (m.created_date < ?2 OR (m.created_date = ?2 AND m.id < ?3))' : ''}
     ORDER BY m.created_date DESC, m.id DESC LIMIT ${TOPIC_PAGE + 1}`,
    user.id, ...(c ? [c.d, c.id] : []),
  );
  const page = rows.slice(0, TOPIC_PAGE);
  const items = page.map((r) => {
    const raw = r.source_kind === 'post' ? r.post_body : r.dm_body;
    const gone = r.source_kind === 'post' ? r.post_hidden || r.post_deleted || r.topic_hidden : r.dm_deleted;
    return {
      id: r.id, created_date: r.created_date, source_kind: r.source_kind, source_id: r.source_id, topic_id: r.topic_id,
      thread_id: r.thread_id, topic_title: r.topic_hidden ? null : r.topic_title, unread: !r.read_at, by_player_id: r.by_player_id,
      snippet: gone || raw == null ? '' : plain(raw).slice(0, 200),
    };
  });
  const last = page[page.length - 1];
  return {
    items,
    people: await peopleMap(env, items.map((i) => i.by_player_id)),
    next_cursor: rows.length > TOPIC_PAGE && last ? cursorOf(last.created_date, last.id) : null,
    unread: (await first(env, 'SELECT count(*) AS n FROM mentions WHERE mentioned_user_id = ? AND read_at IS NULL', user.id)).n,
  };
}

export async function mentionsMarkRead({ env, user }, body) {
  const now = nowIso();
  if (body.all) {
    await stmt(env, 'UPDATE mentions SET read_at = ? WHERE mentioned_user_id = ? AND read_at IS NULL', now, user.id).run();
  } else {
    if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100 || !body.ids.every((i) => isStr(i) && i.length <= 80)) throw bad('Pass ids or all.');
    await stmt(env, `UPDATE mentions SET read_at = ? WHERE mentioned_user_id = ? AND read_at IS NULL AND id IN (${placeholders(body.ids.length)})`, now, user.id, ...body.ids).run();
  }
  return { ok: true };
}

/** Cheap badge: threads with messages after my last read + unread mentions (+ open reports for admins). */
export async function chatUnread({ env, user }) {
  const r = await first(
    env,
    `SELECT
       (SELECT count(*) FROM dm_threads t
         WHERE (t.user_a = ?1 OR t.user_b = ?1) AND t.last_message_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM dm_messages m WHERE m.thread_id = t.id AND m.sender_user_id <> ?1 AND m.deleted = 0
             AND m.created_date > COALESCE((SELECT last_read_at FROM dm_reads r WHERE r.thread_id = t.id AND r.user_id = ?1), ''))) AS dms,
       (SELECT count(*) FROM mentions WHERE mentioned_user_id = ?1 AND read_at IS NULL) AS mentions,
       CASE WHEN ?2 = 1 THEN (SELECT count(*) FROM reports WHERE status = 'open') ELSE 0 END AS reports`,
    user.id, isAdmin(user) ? 1 : 0,
  );
  return { dms: r.dms || 0, mentions: r.mentions || 0, reports: r.reports || 0 };
}

// ---------- autocomplete ----------
const likeEsc = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);
export async function playerSearch({ env }, body) {
  const q = isStr(body.q) ? body.q.trim().toLowerCase().slice(0, 40) : '';
  if (!q) {
    const rows = await all(env, 'SELECT id, username, display_name, avatar_url FROM players ORDER BY COALESCE(last_active_at, created_date) DESC LIMIT 8');
    return { items: rows.map(personOf) };
  }
  const e = likeEsc(q);
  const rows = await all(
    env,
    `SELECT id, username, display_name, avatar_url FROM players
     WHERE username_lower LIKE ?1 ESCAPE '\\' OR lower(display_name) LIKE ?1 ESCAPE '\\'
     ORDER BY (username_lower LIKE ?2 ESCAPE '\\' OR lower(display_name) LIKE ?2 ESCAPE '\\') DESC, username_lower LIMIT 8`,
    `%${e}%`, `${e}%`,
  );
  return { items: rows.map(personOf) };
}

// ---------- blocks ----------
async function playerUser(env, playerId) {
  const p = await first(env, 'SELECT id, user_id FROM players WHERE id = ?', cleanId(playerId, 'player id'));
  if (!p) throw new HttpError(404, 'Player not found.');
  return p;
}
export async function block({ env, user }, body) {
  const p = await playerUser(env, body.player_id);
  if (p.user_id === user.id) throw bad("You can't block yourself.");
  await stmt(env, 'INSERT OR IGNORE INTO blocks (blocker_user_id, blocked_user_id, created_date) VALUES (?,?,?)', user.id, p.user_id, nowIso()).run();
  return { ok: true };
}
export async function unblock({ env, user }, body) {
  const p = await playerUser(env, body.player_id);
  await stmt(env, 'DELETE FROM blocks WHERE blocker_user_id = ? AND blocked_user_id = ?', user.id, p.user_id).run();
  return { ok: true };
}

// ---------- reports ----------
export async function report({ env, user }, body) {
  if (!REPORT_KINDS.includes(body.kind)) throw bad('Unknown report type.');
  const targetId = cleanId(body.target_id, 'target');
  if (!isStr(body.reason) || !body.reason.trim()) throw bad('Say what is wrong.');
  const reason = body.reason.trim();
  if (reason.length > MAX_REASON) throw bad(`Reasons are at most ${MAX_REASON} characters.`);
  if (body.kind === 'post') {
    if (!(await first(env, 'SELECT 1 AS x FROM forum_posts WHERE id = ?', targetId))) throw new HttpError(404, 'Post not found.');
  } else if (body.kind === 'topic') {
    if (!(await first(env, 'SELECT 1 AS x FROM forum_topics WHERE id = ?', targetId))) throw new HttpError(404, 'Topic not found.');
  } else {
    // Only a participant can report a private message (and only then can an admin read it).
    const m = await first(env, 'SELECT thread_id FROM dm_messages WHERE id = ?', targetId);
    if (!m) throw new HttpError(404, 'Message not found.');
    await requireThread(env, user, m.thread_id);
  }
  const dup = await first(env, "SELECT id FROM reports WHERE reporter_user_id = ? AND kind = ? AND target_id = ? AND status = 'open'", user.id, body.kind, targetId);
  if (dup) return { ok: true };
  const n = await first(env, 'SELECT count(*) AS n FROM reports WHERE reporter_user_id = ? AND created_date > ?', user.id, agoIso(86400e3));
  if (n.n >= REPORTS_PER_DAY) throw new HttpError(429, "You've sent plenty of reports today. Please try again tomorrow.");
  await stmt(env, 'INSERT INTO reports (id, created_date, reporter_user_id, kind, target_id, reason) VALUES (?,?,?,?,?,?)', uuid(), nowIso(), user.id, body.kind, targetId, reason).run();
  return { ok: true };
}

export async function adminReports({ env, user }, body) {
  adminOnly(user);
  const status = body.status ?? 'open';
  if (!['open', 'resolved', 'dismissed'].includes(status)) throw bad('Unknown status.');
  const c = parseCursor(body.cursor);
  const rows = await all(
    env,
    `SELECT r.*, (SELECT id FROM players WHERE user_id = r.reporter_user_id) AS reporter_player_id
     FROM reports r WHERE r.status = ?${c ? ' AND (r.created_date < ? OR (r.created_date = ? AND r.id < ?))' : ''}
     ORDER BY r.created_date DESC, r.id DESC LIMIT ${PAGE + 1}`,
    status, ...(c ? [c.d, c.d, c.id] : []),
  );
  const page = rows.slice(0, PAGE);
  const items = [];
  for (const r of page) {
    let target = null;
    if (r.kind === 'post') {
      const p = await first(env, 'SELECT p.id, p.topic_id, p.body, p.hidden, p.deleted, p.author_player_id, t.title AS topic_title FROM forum_posts p JOIN forum_topics t ON t.id = p.topic_id WHERE p.id = ?', r.target_id);
      if (p) target = { topic_id: p.topic_id, topic_title: p.topic_title, text: p.body, author_player_id: p.author_player_id, hidden: !!p.hidden, deleted: !!p.deleted };
    } else if (r.kind === 'topic') {
      const t = await first(env, 'SELECT id, title, author_player_id, hidden, locked FROM forum_topics WHERE id = ?', r.target_id);
      if (t) target = { topic_id: t.id, topic_title: t.title, text: t.title, author_player_id: t.author_player_id, hidden: !!t.hidden, locked: !!t.locked };
    } else {
      const m = await first(env, 'SELECT m.id, m.body, m.sender_user_id, (SELECT id FROM players WHERE user_id = m.sender_user_id) AS pid FROM dm_messages m WHERE m.id = ?', r.target_id);
      if (m) target = { text: m.body, author_player_id: m.pid };
    }
    items.push({
      id: r.id, created_date: r.created_date, kind: r.kind, target_id: r.target_id, reason: r.reason, status: r.status,
      reporter_player_id: r.reporter_player_id, target,
    });
  }
  const last = page[page.length - 1];
  const open = (await first(env, "SELECT count(*) AS n FROM reports WHERE status = 'open'")).n;
  return {
    items,
    people: await peopleMap(env, items.flatMap((i) => [i.reporter_player_id, i.target?.author_player_id])),
    next_cursor: rows.length > PAGE && last ? cursorOf(last.created_date, last.id) : null,
    open_count: open,
  };
}

export async function adminResolveReport({ env, user }, body) {
  adminOnly(user);
  const id = cleanId(body.id, 'report id');
  if (!['resolved', 'dismissed', 'open'].includes(body.status)) throw bad('Unknown status.');
  const r = await first(env, 'SELECT id FROM reports WHERE id = ?', id);
  if (!r) throw new HttpError(404, 'Report not found.');
  await stmt(env, 'UPDATE reports SET status = ? WHERE id = ?', body.status, id).run();
  return { ok: true };
}

/** Statements run inside deleteAccount's batch: private data goes, public posts are blanked (threads stay readable). */
export const chatErasureStmts = (env, userId) => [
  stmt(env, 'DELETE FROM dm_threads WHERE user_a = ? OR user_b = ?', userId, userId), // messages + reads cascade
  stmt(env, 'DELETE FROM mentions WHERE mentioned_user_id = ? OR by_user_id = ?', userId, userId),
  stmt(env, 'DELETE FROM blocks WHERE blocker_user_id = ? OR blocked_user_id = ?', userId, userId),
  stmt(env, 'DELETE FROM reports WHERE reporter_user_id = ?', userId),
  stmt(env, 'UPDATE forum_posts SET deleted = 1, author_player_id = NULL WHERE author_user_id = ?', userId),
];
