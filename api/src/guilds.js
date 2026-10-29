import { all, first, stmt, guardRow, commit, retrying, uuid, nowIso } from './db.js';
import { HttpError, bad } from './errors.js';
import { pub } from './schema.js';
import { DEFAULT_TZ } from './weekdays.js';

// Guilds: teams of up to MAX_MEMBERS players, one guild per player. The tables (migration 0021) are NOT in the
// entity whitelist: reads and writes go through the functions below. Every membership change bumps guilds.version
// and is guarded on the version that was read, so the member cap, leader checks and transfers never race.
export const MAX_MEMBERS = 3;
export const COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
const MAX_REQUESTS_PER_PLAYER = 5;
const MAX_REQUESTS_PER_GUILD = 20;
const RATED_MIN = 5; // singles matches before a member counts toward the guild's average rating

const isStr = (v) => typeof v === 'string';

// ---------- the guild week: Monday 00:00 America/Chicago ----------
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const weekFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: DEFAULT_TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
});
const partsAt = (t) => Object.fromEntries(weekFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
/** Local wall clock minus UTC, in ms, at instant t. */
const offsetAt = (t) => {
  const p = partsAt(t);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
};
/** ISO instant of the most recent Monday 00:00 in America/Chicago (DST-aware). */
export function weekStartIso(nowMs = Date.now()) {
  const p = partsAt(nowMs);
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day - ((DOW[p.weekday] + 6) % 7)); // Monday midnight, as wall time
  let t = wall - offsetAt(nowMs);
  t = wall - offsetAt(t); // the offset at that Monday may differ (DST)
  return new Date(t).toISOString();
}

// ---------- validation ----------
function cleanName(v) {
  if (!isStr(v)) throw bad('Give your guild a name.');
  const n = v.replace(/\s+/g, ' ').trim();
  if (n.length < 3 || n.length > 24) throw bad('Guild names are 3–24 characters.');
  if (!/^[\p{L}\p{N} .'&!_-]+$/u.test(n)) throw bad('Use letters, numbers, spaces and . \' & ! _ - only.');
  return n;
}
function cleanTag(v) {
  if (!isStr(v)) throw bad('Pick a tag.');
  const t = v.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,4}$/.test(t)) throw bad('Tags are 2–4 letters or numbers.');
  return t;
}
function cleanColor(v) {
  if (!COLORS.includes(v)) throw bad('Pick a badge color.');
  return v;
}
function cleanDescription(v) {
  if (v == null) return null;
  if (!isStr(v)) throw bad('Description must be text.');
  const d = v.replace(/\s+/g, ' ').trim();
  if (d.length > 140) throw bad('Descriptions are at most 140 characters.');
  return d || null;
}
const needId = (v, what) => {
  if (!isStr(v) || !v) throw bad(`Missing ${what}.`);
  return v;
};

// ---------- reads ----------
const getPlayerByUser = (env, uid) => first(env, 'SELECT * FROM players WHERE user_id = ?', uid);
async function requirePlayer(env, user) {
  const p = await getPlayerByUser(env, user.id);
  if (!p) throw new HttpError(400, 'Create your player profile first.');
  return p;
}
const getGuildRow = (env, id) => first(env, 'SELECT * FROM guilds WHERE id = ?', id);
async function requireGuild(env, id) {
  const g = await getGuildRow(env, needId(id, 'guild'));
  if (!g) throw new HttpError(404, 'That guild does not exist anymore.');
  return g;
}
const membershipOf = (env, playerId) => first(env, 'SELECT * FROM guild_members WHERE player_id = ?', playerId);
const membersOf = (env, guildId) => all(env, 'SELECT * FROM guild_members WHERE guild_id = ? ORDER BY joined_at, id', guildId);
function requireLeader(g, me) {
  if (g.leader_player_id !== me.id) throw new HttpError(403, 'Only the guild leader can do that.');
}
const nameTaken = (env, nameLower, exceptId = '') =>
  first(env, 'SELECT 1 AS x FROM guilds WHERE name_lower = ? AND id <> ?', nameLower, exceptId);
const tagTaken = (env, tag, exceptId = '') => first(env, 'SELECT 1 AS x FROM guilds WHERE tag = ? AND id <> ?', tag, exceptId);

/**
 * XP per member from verified matches since they joined: { [player_id]: { week, total } }.
 * Reads xp_gained from each match's rating_changes (ranked and unranked matches both carry it).
 */
async function memberXp(env, weekStart, guildId = null) {
  const rows = await all(env,
    `SELECT gm.player_id,
       coalesce(sum(CASE WHEN m.verified_at >= ? THEN json_extract(rc.value, '$.xp_gained') END), 0) AS week,
       coalesce(sum(json_extract(rc.value, '$.xp_gained')), 0) AS total
     FROM guild_members gm
     JOIN matches m ON m.status = 'verified' AND m.verified_at >= gm.joined_at
       AND EXISTS (SELECT 1 FROM json_each(m.all_player_ids) WHERE value = gm.player_id)
     JOIN json_each(m.rating_changes) rc ON json_extract(rc.value, '$.player_id') = gm.player_id
     ${guildId ? 'WHERE gm.guild_id = ?' : ''}
     GROUP BY gm.player_id`,
    weekStart, ...(guildId ? [guildId] : []));
  return Object.fromEntries(rows.map((r) => [r.player_id, { week: r.week, total: r.total }]));
}

/** Every guild with its scores, ranked by this week's points (then all-time, then oldest first). */
async function rankedGuilds(env, weekStart) {
  const guilds = await all(env, 'SELECT * FROM guilds');
  const members = await all(env,
    `SELECT gm.guild_id, gm.player_id, p.singles_rating, p.singles_wins + p.singles_losses AS singles_played
     FROM guild_members gm JOIN players p ON p.id = gm.player_id`);
  const xp = await memberXp(env, weekStart);
  const agg = {};
  for (const m of members) {
    const a = (agg[m.guild_id] ||= { week: 0, total: 0, rated: [] });
    a.week += xp[m.player_id]?.week || 0;
    a.total += xp[m.player_id]?.total || 0;
    if (m.singles_played >= RATED_MIN) a.rated.push(m.singles_rating);
  }
  const out = guilds.map((g) => {
    const a = agg[g.id] || { week: 0, total: 0, rated: [] };
    return {
      ...pubGuild(g),
      week_xp: a.week,
      total_xp: a.total,
      avg_rating: a.rated.length ? Math.round(a.rated.reduce((s, r) => s + r, 0) / a.rated.length) : null,
      rated_members: a.rated.length,
    };
  });
  out.sort((a, b) => b.week_xp - a.week_xp || b.total_xp - a.total_xp || a.created_date.localeCompare(b.created_date) || a.id.localeCompare(b.id));
  out.forEach((g, i) => { g.rank = i + 1; });
  return out;
}

const pubGuild = (g) => ({
  id: g.id, name: g.name, tag: g.tag, color: g.color, description: g.description,
  leader_player_id: g.leader_player_id, member_count: g.member_count, created_date: g.created_date, updated_date: g.updated_date,
});

// ---------- plans ----------
/**
 * Guarded statements that take `playerId` out of guild `g`. A leader leaving hands the lead to the longest-standing
 * member; the last member leaving deletes the guild (members and requests cascade).
 */
async function leavePlan(env, g, playerId, now) {
  const members = await membersOf(env, g.id);
  const rest = members.filter((m) => m.player_id !== playerId);
  const stmts = [guardRow(env, 'guilds', g.id, g.version)];
  if (!rest.length) {
    stmts.push(stmt(env, 'DELETE FROM guild_requests WHERE guild_id = ?', g.id));
    stmts.push(stmt(env, 'DELETE FROM guild_members WHERE guild_id = ?', g.id));
    stmts.push(stmt(env, 'DELETE FROM guilds WHERE id = ?', g.id));
    return { stmts, deleted: true };
  }
  stmts.push(stmt(env, 'DELETE FROM guild_members WHERE guild_id = ? AND player_id = ?', g.id, playerId));
  let leader = g.leader_player_id;
  if (leader === playerId) {
    leader = rest[0].player_id;
    stmts.push(stmt(env, `UPDATE guild_members SET role = 'leader', updated_date = ? WHERE id = ?`, now, rest[0].id));
  }
  stmts.push(stmt(env, 'UPDATE guilds SET member_count = ?, leader_player_id = ?, updated_date = ?, version = version + 1 WHERE id = ?',
    rest.length, leader, now, g.id));
  return { stmts, deleted: false, leader };
}

/** Statements that add a player to guild `g` (already guarded by the caller) and clear their open requests. */
const addMemberStmts = (env, g, playerId, now, role = 'member') => [
  stmt(env, 'INSERT INTO guild_members (id, guild_id, player_id, role, joined_at, created_date, updated_date) VALUES (?,?,?,?,?,?,?)',
    uuid(), g.id, playerId, role, now, now, now),
  stmt(env, 'DELETE FROM guild_requests WHERE player_id = ?', playerId),
];

/** For deleteAccount: leave the guild (handing off or deleting it) and drop open requests. Run inside retrying. */
export async function guildErasureStmts(env, player) {
  if (!player) return [];
  const stmts = [];
  const mem = await membershipOf(env, player.id);
  if (mem) {
    const g = await getGuildRow(env, mem.guild_id);
    if (g) stmts.push(...(await leavePlan(env, g, player.id, nowIso())).stmts);
  }
  stmts.push(stmt(env, 'DELETE FROM guild_requests WHERE player_id = ?', player.id));
  return stmts;
}

// ---------- functions ----------
/** Guild leaderboard. Public. */
export async function listGuilds({ env, user }) {
  const weekStart = weekStartIso();
  const guilds = await rankedGuilds(env, weekStart);
  let my = null;
  if (user) {
    const p = await getPlayerByUser(env, user.id);
    if (p) my = (await membershipOf(env, p.id))?.guild_id || null;
  }
  return { guilds, week_start: weekStart, my_guild_id: my, max_members: MAX_MEMBERS };
}

/** One guild with members, scores, your standing in it, and (leader only) pending requests. Public. */
export async function getGuild({ env, user }, body) {
  const g = await requireGuild(env, body.guild_id);
  const weekStart = weekStartIso();
  const scored = (await rankedGuilds(env, weekStart)).find((x) => x.id === g.id);
  const xp = await memberXp(env, weekStart, g.id);
  const rows = await all(env,
    `SELECT gm.role, gm.joined_at, p.* FROM guild_members gm JOIN players p ON p.id = gm.player_id WHERE gm.guild_id = ? ORDER BY gm.joined_at, gm.id`, g.id);
  const members = rows
    .map((r) => ({ player: pub('Player', r), role: r.role, joined_at: r.joined_at, week_xp: xp[r.id]?.week || 0, total_xp: xp[r.id]?.total || 0 }))
    .sort((a, b) => (a.role === 'leader' ? -1 : b.role === 'leader' ? 1 : 0) || b.week_xp - a.week_xp || a.joined_at.localeCompare(b.joined_at));
  const me = { player_id: null, member: false, role: null, requested: false, guild_id: null };
  let requests = [];
  if (user) {
    const p = await getPlayerByUser(env, user.id);
    if (p) {
      me.player_id = p.id;
      const mem = await membershipOf(env, p.id);
      me.guild_id = mem?.guild_id || null;
      me.member = mem?.guild_id === g.id;
      me.role = me.member ? mem.role : null;
      me.requested = !!(await first(env, 'SELECT 1 AS x FROM guild_requests WHERE guild_id = ? AND player_id = ?', g.id, p.id));
      if (g.leader_player_id === p.id) {
        const rq = await all(env,
          `SELECT r.id AS request_id, r.created_date AS requested_at, p.* FROM guild_requests r JOIN players p ON p.id = r.player_id
           WHERE r.guild_id = ? ORDER BY r.created_date, r.id`, g.id);
        requests = rq.map((r) => ({ id: r.request_id, created_date: r.requested_at, player: pub('Player', r) }));
      }
    }
  }
  return { guild: scored, members, requests, me, week_start: weekStart, max_members: MAX_MEMBERS };
}

/** { tags: { [player_id]: { guild_id, tag, color, name } } } for the [TAG] chips. Public. */
export async function guildTags({ env }) {
  const rows = await all(env, 'SELECT gm.player_id, g.id, g.tag, g.color, g.name FROM guild_members gm JOIN guilds g ON g.id = gm.guild_id');
  return { tags: Object.fromEntries(rows.map((r) => [r.player_id, { guild_id: r.id, tag: r.tag, color: r.color, name: r.name }])) };
}

export const createGuild = ({ env, user }, body) =>
  retrying(async () => {
    const me = await requirePlayer(env, user);
    const name = cleanName(body.name);
    const tag = cleanTag(body.tag);
    const color = cleanColor(body.color);
    const description = cleanDescription(body.description);
    if (await membershipOf(env, me.id)) throw new HttpError(409, 'You are already in a guild. Leave it first.');
    if (await nameTaken(env, name.toLowerCase())) throw new HttpError(409, 'That guild name is taken.');
    if (await tagTaken(env, tag)) throw new HttpError(409, 'That tag is taken.');
    const id = uuid();
    const now = nowIso();
    await commit(env, [
      stmt(env,
        `INSERT INTO guilds (id, created_date, updated_date, created_by_id, name, name_lower, tag, color, description, leader_player_id, member_count)
         VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
        id, now, now, user.id, name, name.toLowerCase(), tag, color, description, me.id),
      ...addMemberStmts(env, { id }, me.id, now, 'leader'),
    ]);
    return { guild: pubGuild(await getGuildRow(env, id)) };
  });

export const updateGuild = ({ env, user }, body) =>
  retrying(async () => {
    const me = await requirePlayer(env, user);
    const g = await requireGuild(env, body.guild_id);
    requireLeader(g, me);
    const set = {};
    if (body.name !== undefined) {
      set.name = cleanName(body.name);
      set.name_lower = set.name.toLowerCase();
      if (await nameTaken(env, set.name_lower, g.id)) throw new HttpError(409, 'That guild name is taken.');
    }
    if (body.tag !== undefined) {
      set.tag = cleanTag(body.tag);
      if (await tagTaken(env, set.tag, g.id)) throw new HttpError(409, 'That tag is taken.');
    }
    if (body.color !== undefined) set.color = cleanColor(body.color);
    if (body.description !== undefined) set.description = cleanDescription(body.description);
    const keys = Object.keys(set);
    if (keys.length) {
      await commit(env, [
        guardRow(env, 'guilds', g.id, g.version),
        stmt(env, `UPDATE guilds SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_date = ?, version = version + 1 WHERE id = ?`,
          ...keys.map((k) => set[k]), nowIso(), g.id),
      ]);
    }
    return { guild: pubGuild(await getGuildRow(env, g.id)) };
  });

export const requestJoinGuild = ({ env, user }, body) =>
  retrying(async () => {
    const me = await requirePlayer(env, user);
    const g = await requireGuild(env, body.guild_id);
    if (await membershipOf(env, me.id)) throw new HttpError(409, 'You are already in a guild. Leave it first.');
    if (await first(env, 'SELECT 1 AS x FROM guild_requests WHERE guild_id = ? AND player_id = ?', g.id, me.id)) {
      return { requested: true };
    }
    if (g.member_count >= MAX_MEMBERS) throw new HttpError(409, `This guild is full (${MAX_MEMBERS} members).`);
    const mine = (await first(env, 'SELECT count(*) AS n FROM guild_requests WHERE player_id = ?', me.id)).n;
    if (mine >= MAX_REQUESTS_PER_PLAYER) throw new HttpError(429, `You have ${MAX_REQUESTS_PER_PLAYER} requests waiting. Cancel one first.`);
    const theirs = (await first(env, 'SELECT count(*) AS n FROM guild_requests WHERE guild_id = ?', g.id)).n;
    if (theirs >= MAX_REQUESTS_PER_GUILD) throw new HttpError(429, 'This guild has a lot of requests waiting. Try again later.');
    await commit(env, [
      guardRow(env, 'guilds', g.id, g.version),
      stmt(env, 'INSERT INTO guild_requests (id, guild_id, player_id, created_date) VALUES (?,?,?,?)', uuid(), g.id, me.id, nowIso()),
    ]);
    return { requested: true };
  });

/** Withdraw your own pending request. */
export async function cancelJoinRequest({ env, user }, body) {
  const me = await requirePlayer(env, user);
  await env.DB.prepare('DELETE FROM guild_requests WHERE guild_id = ? AND player_id = ?').bind(needId(body.guild_id, 'guild'), me.id).run();
  return { requested: false };
}

export const respondJoinRequest = ({ env, user }, body) =>
  retrying(async () => {
    const me = await requirePlayer(env, user);
    if (body.decision !== 'approve' && body.decision !== 'decline') throw bad('Decision must be "approve" or "decline".');
    const rq = await first(env, 'SELECT * FROM guild_requests WHERE id = ?', needId(body.request_id, 'request'));
    if (!rq) throw new HttpError(404, 'That request is gone. They may have joined another guild.');
    const g = await requireGuild(env, rq.guild_id);
    requireLeader(g, me);
    const drop = stmt(env, 'DELETE FROM guild_requests WHERE id = ?', rq.id);
    if (body.decision === 'decline') {
      await commit(env, [guardRow(env, 'guilds', g.id, g.version), drop]);
      return { ok: true, decision: 'decline' };
    }
    if (await membershipOf(env, rq.player_id)) {
      await commit(env, [drop]);
      throw new HttpError(409, 'They already joined another guild.');
    }
    if (g.member_count >= MAX_MEMBERS) throw new HttpError(409, `Your guild is full (${MAX_MEMBERS} members).`);
    const now = nowIso();
    await commit(env, [
      guardRow(env, 'guilds', g.id, g.version),
      ...addMemberStmts(env, g, rq.player_id, now),
      stmt(env, 'UPDATE guilds SET member_count = member_count + 1, updated_date = ?, version = version + 1 WHERE id = ?', now, g.id),
    ]);
    return { ok: true, decision: 'approve' };
  });

export const leaveGuild = ({ env, user }) =>
  retrying(async () => {
    const me = await requirePlayer(env, user);
    const mem = await membershipOf(env, me.id);
    if (!mem) throw bad('You are not in a guild.');
    const g = await requireGuild(env, mem.guild_id);
    const plan = await leavePlan(env, g, me.id, nowIso());
    await commit(env, plan.stmts);
    return { ok: true, deleted: plan.deleted };
  });

export const kickMember = ({ env, user }, body) =>
  retrying(async () => {
    const me = await requirePlayer(env, user);
    const g = await requireGuild(env, body.guild_id);
    requireLeader(g, me);
    const target = needId(body.player_id, 'player');
    if (target === me.id) throw bad('You cannot kick yourself. Leave the guild instead.');
    const mem = await membershipOf(env, target);
    if (mem?.guild_id !== g.id) throw new HttpError(404, 'They are not in your guild.');
    const now = nowIso();
    await commit(env, [
      guardRow(env, 'guilds', g.id, g.version),
      stmt(env, 'DELETE FROM guild_members WHERE id = ?', mem.id),
      stmt(env, 'UPDATE guilds SET member_count = member_count - 1, updated_date = ?, version = version + 1 WHERE id = ?', now, g.id),
    ]);
    return { ok: true };
  });

export const transferLeadership = ({ env, user }, body) =>
  retrying(async () => {
    const me = await requirePlayer(env, user);
    const g = await requireGuild(env, body.guild_id);
    requireLeader(g, me);
    const target = needId(body.player_id, 'player');
    if (target === me.id) throw bad('You are already the leader.');
    const mem = await membershipOf(env, target);
    if (mem?.guild_id !== g.id) throw new HttpError(404, 'They are not in your guild.');
    const now = nowIso();
    await commit(env, [
      guardRow(env, 'guilds', g.id, g.version),
      stmt(env, `UPDATE guild_members SET role = 'member', updated_date = ? WHERE guild_id = ? AND player_id = ?`, now, g.id, me.id),
      stmt(env, `UPDATE guild_members SET role = 'leader', updated_date = ? WHERE id = ?`, now, mem.id),
      stmt(env, 'UPDATE guilds SET leader_player_id = ?, updated_date = ?, version = version + 1 WHERE id = ?', target, now, g.id),
    ]);
    return { ok: true };
  });
