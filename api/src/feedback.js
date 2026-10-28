import { all, first, stmt, uuid, nowIso } from './db.js';
import { HttpError, bad } from './errors.js';

// Feedback lives outside the public entity whitelist (schema.js ENTITIES): it is only reachable through these functions.
export const KINDS = ['bug', 'idea', 'other'];
export const STATUSES = ['new', 'read', 'done'];
const MAX_MESSAGE = 2000;
const MAX_SHORT = 200;
const PER_IP_PER_HOUR = 5;
const PER_USER_PER_DAY = 20;
const FOLLOWUPS_PER_DAY = 10;

const isStr = (v) => typeof v === 'string';
const adminOnly = (user) => {
  if (!user || user.role !== 'admin') throw new HttpError(403, 'Admins only.');
};

/** SHA-256(ip + secret) as hex; the raw IP is never stored. */
async function hashIp(env, ip) {
  const data = new TextEncoder().encode(`${ip}|${env.BETTER_AUTH_SECRET || ''}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const cleanPage = (v) => {
  if (!isStr(v)) return null;
  const p = v.trim().slice(0, MAX_SHORT);
  return p.startsWith('/') && !p.startsWith('//') ? p : null;
};

/** Public (signed-out allowed). `ctx.request` gives the headers for the ip hash / user agent. */
export async function submitFeedback({ env, user, request }, body) {
  // Honeypot: real people never see this field. Pretend success, store nothing.
  if (body.website != null && body.website !== '') return { ok: true };
  if (!KINDS.includes(body.kind)) throw bad('Choose Bug, Idea or Other.');
  if (!isStr(body.message)) throw bad('Write a message first.');
  const message = body.message.trim();
  if (!message) throw bad('Write a message first.');
  if (message.length > MAX_MESSAGE) throw bad(`Messages are at most ${MAX_MESSAGE} characters.`);
  let contact = null;
  if (!user && body.contact != null && body.contact !== '') {
    if (!isStr(body.contact)) throw bad('Contact must be text.');
    contact = body.contact.trim();
    if (contact.length > MAX_SHORT) throw bad(`Contact is at most ${MAX_SHORT} characters.`);
    contact = contact || null;
  }
  const ip = request?.headers.get('cf-connecting-ip') || '';
  const ipHash = await hashIp(env, ip || 'unknown');
  const now = nowIso();
  // Rate limits (queried from the table itself). With no IP header (plain local dev) the per-IP limit is skipped.
  if (ip) {
    const r = await first(env, 'SELECT count(*) AS n FROM feedback WHERE ip_hash = ? AND created_date > ?', ipHash, new Date(Date.now() - 3600e3).toISOString());
    if (r.n >= PER_IP_PER_HOUR) throw new HttpError(429, "You've sent a lot of feedback in the last hour. Please try again a bit later.");
  }
  let player = null;
  if (user) {
    const r = await first(env, 'SELECT count(*) AS n FROM feedback WHERE user_id = ? AND created_date > ?', user.id, new Date(Date.now() - 86400e3).toISOString());
    if (r.n >= PER_USER_PER_DAY) throw new HttpError(429, "You've sent plenty of feedback today. Please try again tomorrow.");
    player = await first(env, 'SELECT id, username FROM players WHERE user_id = ?', user.id);
  }
  const ua = (request?.headers.get('user-agent') || '').slice(0, MAX_SHORT) || null;
  await stmt(
    env,
    `INSERT INTO feedback (id, created_date, updated_date, kind, message, page, contact, user_id, player_id, username, status, ip_hash, user_agent)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'new', ?,?)`,
    uuid(), now, now, body.kind, message, cleanPage(body.page), contact, user?.id ?? null, player?.id ?? null, player?.username ?? null, ipHash, ua,
  ).run();
  return { ok: true };
}

const pubFeedback = ({ ip_hash, user_agent, ...r }) => r; // ip_hash never leaves the server
const pubReply = (r) => ({ id: r.id, feedback_id: r.feedback_id, created_date: r.created_date, author_role: r.author_role, author_name: r.author_name, message: r.message });

/** Replies for a set of feedback ids, grouped by feedback id, oldest first. */
async function repliesFor(env, ids) {
  const by = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return by;
  const rows = await all(
    env,
    `SELECT * FROM feedback_replies WHERE feedback_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_date, id`,
    ...ids,
  );
  for (const r of rows) by.get(r.feedback_id).push(pubReply(r));
  return by;
}

const cleanReply = (v) => {
  if (!isStr(v) || !v.trim()) throw bad('Write a message first.');
  const m = v.trim();
  if (m.length > MAX_MESSAGE) throw bad(`Replies are at most ${MAX_MESSAGE} characters.`);
  return m;
};

/** The signed-in user's own feedback with replies, newest activity first. Never returns admin_note / ip_hash / user_agent. */
export async function myFeedback({ env, user }, body) {
  const limit = body.limit == null ? 20 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1) throw bad('limit must be a positive integer.');
  const cap = Math.min(limit, 50);
  const where = ['user_id = ?'];
  const params = [user.id];
  if (body.cursor != null && body.cursor !== '') {
    if (!isStr(body.cursor) || !body.cursor.includes('|')) throw bad('Bad cursor.');
    const i = body.cursor.indexOf('|');
    const d = body.cursor.slice(0, i);
    where.push('(COALESCE(last_reply_at, created_date) < ? OR (COALESCE(last_reply_at, created_date) = ? AND id < ?))');
    params.push(d, d, body.cursor.slice(i + 1));
  }
  const rows = await all(
    env,
    `SELECT id, created_date, kind, message, page, status, user_unread, reply_count, last_reply_at, COALESCE(last_reply_at, created_date) AS activity
     FROM feedback WHERE ${where.join(' AND ')} ORDER BY activity DESC, id DESC LIMIT ${cap + 1}`,
    ...params,
  );
  const more = rows.length > cap;
  const page = rows.slice(0, cap);
  const threads = await repliesFor(env, page.map((r) => r.id));
  const last = page[page.length - 1];
  return {
    items: page.map(({ activity, ...r }) => ({ ...r, user_unread: !!r.user_unread, replies: threads.get(r.id) })),
    next_cursor: more && last ? `${last.activity}|${last.id}` : null,
    unread: (await first(env, 'SELECT count(*) AS n FROM feedback WHERE user_id = ? AND user_unread = 1', user.id)).n,
  };
}

/** Cheap badge count: my feedback items with an unseen admin reply. */
export async function myFeedbackUnread({ env, user }) {
  return { unread: (await first(env, 'SELECT count(*) AS n FROM feedback WHERE user_id = ? AND user_unread = 1', user.id)).n };
}

export async function markFeedbackSeen({ env, user }, body) {
  if (!isStr(body.id)) throw bad('Missing feedback id.');
  const row = await first(env, 'SELECT id, user_id FROM feedback WHERE id = ?', body.id);
  if (!row || row.user_id !== user.id) throw new HttpError(404, 'Feedback not found.');
  await stmt(env, 'UPDATE feedback SET user_unread = 0 WHERE id = ?', row.id).run();
  return { ok: true };
}

export async function replyFeedback({ env, user }, body) {
  if (!isStr(body.id)) throw bad('Missing feedback id.');
  const message = cleanReply(body.message);
  const row = await first(env, 'SELECT * FROM feedback WHERE id = ?', body.id);
  const isAdmin = user.role === 'admin';
  if (!row || (!isAdmin && row.user_id !== user.id)) throw new HttpError(404, 'Feedback not found.');
  if (!isAdmin && !row.user_id) throw new HttpError(404, 'Feedback not found.');
  const now = nowIso();
  if (!isAdmin) {
    const r = await first(
      env,
      `SELECT count(*) AS n FROM feedback_replies WHERE author_user_id = ? AND author_role = 'user' AND created_date > ?`,
      user.id,
      new Date(Date.now() - 86400e3).toISOString(),
    );
    if (r.n >= FOLLOWUPS_PER_DAY) throw new HttpError(429, "You've sent plenty of follow-ups today. Please try again tomorrow.");
  }
  const player = await first(env, 'SELECT username FROM players WHERE user_id = ?', user.id);
  const name = player?.username || user.name || (isAdmin ? 'Admin' : 'You');
  const id = uuid();
  const upd = isAdmin
    ? stmt(
        env,
        `UPDATE feedback SET user_unread = CASE WHEN user_id IS NULL THEN 0 ELSE 1 END, last_reply_at = ?, reply_count = reply_count + 1,
         status = CASE WHEN status = 'new' THEN 'read' ELSE status END, updated_date = ? WHERE id = ?`,
        now, now, row.id,
      )
    : stmt(env, `UPDATE feedback SET status = 'new', last_reply_at = ?, reply_count = reply_count + 1, updated_date = ? WHERE id = ?`, now, now, row.id);
  await env.DB.batch([
    stmt(
      env,
      'INSERT INTO feedback_replies (id, feedback_id, created_date, author_user_id, author_role, author_name, message) VALUES (?,?,?,?,?,?,?)',
      id, row.id, now, user.id, isAdmin ? 'admin' : 'user', name, message,
    ),
    upd,
  ]);
  const reply = await first(env, 'SELECT * FROM feedback_replies WHERE id = ?', id);
  return { reply: pubReply(reply) };
}

export async function listFeedback({ env, user }, body) {
  adminOnly(user);
  const status = body.status ?? null;
  if (status !== null && !STATUSES.includes(status)) throw bad('Unknown status.');
  const limit = body.limit == null ? 50 : Number(body.limit);
  if (!Number.isInteger(limit) || limit < 1) throw bad('limit must be a positive integer.');
  const where = [];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (body.cursor != null && body.cursor !== '') {
    if (!isStr(body.cursor) || !body.cursor.includes('|')) throw bad('Bad cursor.');
    const i = body.cursor.indexOf('|');
    where.push('(created_date < ? OR (created_date = ? AND id < ?))');
    const d = body.cursor.slice(0, i);
    params.push(d, d, body.cursor.slice(i + 1));
  }
  const cap = Math.min(limit, 100);
  const rows = await all(
    env,
    `SELECT * FROM feedback ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_date DESC, id DESC LIMIT ${cap + 1}`,
    ...params,
  );
  const more = rows.length > cap;
  const items = rows.slice(0, cap);
  const counts = { new: 0, read: 0, done: 0 };
  for (const r of await all(env, 'SELECT status, count(*) AS n FROM feedback GROUP BY status')) counts[r.status] = r.n;
  const last = items[items.length - 1];
  const threads = await repliesFor(env, items.map((r) => r.id));
  return {
    items: items.map((r) => {
      const replies = threads.get(r.id);
      return { ...pubFeedback(r), user_unread: !!r.user_unread, replies, needs_reply: replies.length > 0 && replies[replies.length - 1].author_role === 'user' };
    }),
    next_cursor: more && last ? `${last.created_date}|${last.id}` : null,
    new_count: counts.new,
    counts: { ...counts, all: counts.new + counts.read + counts.done },
  };
}

export async function updateFeedback({ env, user }, body) {
  adminOnly(user);
  if (!isStr(body.id)) throw bad('Missing feedback id.');
  const row = await first(env, 'SELECT * FROM feedback WHERE id = ?', body.id);
  if (!row) throw new HttpError(404, 'Feedback not found.');
  let status = row.status;
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw bad('Unknown status.');
    status = body.status;
  }
  let note = row.admin_note;
  if (body.admin_note !== undefined) {
    if (body.admin_note !== null && !isStr(body.admin_note)) throw bad('Note must be text.');
    note = (body.admin_note ?? '').trim();
    if (note.length > MAX_MESSAGE) throw bad(`Notes are at most ${MAX_MESSAGE} characters.`);
    note = note || null;
  }
  await stmt(env, 'UPDATE feedback SET status = ?, admin_note = ?, updated_date = ? WHERE id = ?', status, note, nowIso(), row.id).run();
  return { item: pubFeedback(await first(env, 'SELECT * FROM feedback WHERE id = ?', row.id)) };
}
