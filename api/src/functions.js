import { Hono } from 'hono';
import {
  all, first, stmt, guard, guardRow, guardLadder, bumpLadder, ladderVersion, commit, retrying, uuid, nowIso,
  daysAgoIso, inFutureIso, placeholders,
} from './db.js';
import { getUser } from './auth.js';
import { HttpError, bad } from './errors.js';
import { avatarOwner, removeAvatar } from './uploads.js';
import { decodeInternal, pub } from './schema.js';
import {
  START_RATING, REPEAT_WINDOW_DAYS, rateMatch, xpForMatch, levelForXp, validateGames, summarizeGames,
  applyLadderSwap,
} from './rating.js';

const MATCH_EXPIRY_MS = 7 * 86400000;
const CHALLENGE_MS = 72 * 3600000;
const PENDING_CAP = 10;

const nameOf = (p) => p.display_name || p.username;
const isStr = (v) => typeof v === 'string';
const J = JSON.stringify;

// ---------- validation helpers ----------
function cleanUsername(v) {
  if (!isStr(v)) throw bad('Choose a username.');
  const u = v.trim();
  if (u.length < 3 || u.length > 20) throw bad('Usernames are 3–20 characters.');
  if (!/^[a-zA-Z0-9._-]+$/.test(u)) throw bad('Use letters, numbers, dots, dashes and underscores only.');
  return u;
}
function cleanDisplayName(v) {
  if (!isStr(v)) throw bad('Display name must be text.');
  const d = v.trim();
  if (d.length > 40) throw bad('Display names are at most 40 characters.');
  return d;
}
// Avatars must be files THIS app issued to THIS user (/api/files/<uuid>.<ext>, exact match: no encoding tricks,
// no external URLs). The stored object must exist and be owned by the caller.
const AVATAR_RE = /^\/api\/files\/[0-9a-f-]{36}\.(?:png|jpg|webp|gif)$/;
async function cleanAvatar(env, user, v, current = null) {
  if (v == null || v === '') return null;
  if (!isStr(v) || !AVATAR_RE.test(v)) throw bad('Upload an image to use as your avatar.');
  if (v === current) return v;
  const owner = await avatarOwner(env, v.slice('/api/files/'.length));
  if (owner !== user.id) throw bad('Upload an image to use as your avatar.');
  return v;
}
function cleanBio(v) {
  if (v == null) return null;
  if (!isStr(v)) throw bad('Bio must be text.');
  const b = v.trim();
  if (b.length > 280) throw bad('Bios are at most 280 characters.');
  return b || null;
}

// ---------- shared db helpers (fresh reads; every write batch is guarded, see db.js) ----------
const getPlayerByUser = (env, uid) => first(env, 'SELECT * FROM players WHERE user_id = ?', uid);
async function requirePlayer(env, user) {
  const p = await getPlayerByUser(env, user.id);
  if (!p) throw new HttpError(400, 'Create your player profile first.');
  return p;
}
const getPlayers = (env, ids) =>
  all(env, `SELECT * FROM players WHERE id IN (${placeholders(ids.length)})`, ...ids);
const getMatch = async (env, id) => decodeInternal('Match', await first(env, 'SELECT * FROM matches WHERE id = ?', id));
const getChallenge = (env, id) => first(env, 'SELECT * FROM challenges WHERE id = ?', id);
const touch = (env, playerId, now) =>
  stmt(env, 'UPDATE players SET last_active_at = ?, updated_date = ? WHERE id = ?', now, now, playerId);

/** Statements that renumber singles_rank to 1..N (existing order, nulls last, created, id), skipping `exclude`. */
async function compactPlan(env, exclude) {
  const rows = await all(env, 'SELECT id, singles_rank, created_date FROM players');
  const list = rows.filter((r) => r.id !== exclude).sort((a, b) =>
    (a.singles_rank == null) - (b.singles_rank == null) || (a.singles_rank ?? 0) - (b.singles_rank ?? 0) ||
    (a.created_date < b.created_date ? -1 : a.created_date > b.created_date ? 1 : a.id < b.id ? -1 : 1));
  const now = nowIso();
  const out = [];
  list.forEach((r, i) => {
    if (r.singles_rank !== i + 1) out.push(stmt(env, 'UPDATE players SET singles_rank = ?, updated_date = ? WHERE id = ?', i + 1, now, r.id));
  });
  return out;
}
/**
 * unanswered_challenges = expired challenges the player was defender of (forfeited/dismissed ones leave the count).
 * under_review = unanswered >= 2 OR (inactive 30+ days AND in an open 'disputed' match). Derived data: unguarded.
 */
export const flagsStmt = (env) => {
  // Only challenges the defender never responded to count (responded_at IS NULL excludes accepted-then-unplayed).
  const un = `(SELECT count(*) FROM challenges c WHERE c.defender_player_id = players.id AND c.status = 'expired' AND c.responded_at IS NULL)`;
  const ur = `CASE WHEN ${un} >= 2 OR (last_active_at IS NOT NULL AND last_active_at < ?
         AND EXISTS (SELECT 1 FROM matches m WHERE m.status = 'disputed'
                     AND EXISTS (SELECT 1 FROM json_each(m.all_player_ids) WHERE value = players.id))) THEN 1 ELSE 0 END`;
  const cut = daysAgoIso(30);
  // Writes only the rows whose derived values actually changed (keeps D1 rows-written low).
  return stmt(env,
    `UPDATE players SET unanswered_challenges = ${un}, under_review = ${ur}
     WHERE unanswered_challenges IS NOT ${un} OR under_review IS NOT ${ur}`, cut, cut);
};
/** Ladder swap statements from a FRESH read of all ranks; caller adds guardLadder(lv) read before this call. */
async function swapPlan(env, winnerId, loserId) {
  const rows = await all(env, 'SELECT id, singles_rank FROM players WHERE singles_rank IS NOT NULL');
  const before = Object.fromEntries(rows.map((x) => [x.id, x.singles_rank]));
  const after = applyLadderSwap(before, winnerId, loserId);
  const now = nowIso();
  return Object.entries(after).filter(([id, r]) => before[id] !== r)
    .map(([id, r]) => stmt(env, 'UPDATE players SET singles_rank = ?, updated_date = ? WHERE id = ?', r, now, id));
}

// ---------- functions ----------
const fns = {};

fns.createPlayer = ({ env, user }, body) =>
  retrying(async () => {
    const lv = await ladderVersion(env);
    const username = cleanUsername(body.username);
    const display = body.display_name == null || body.display_name === '' ? username : cleanDisplayName(body.display_name);
    const avatar = await cleanAvatar(env, user, body.avatar_url);
    if (await getPlayerByUser(env, user.id)) throw new HttpError(409, 'You already have a player profile.');
    if (await first(env, 'SELECT 1 AS x FROM players WHERE username_lower = ?', username.toLowerCase())) {
      throw new HttpError(409, 'That username is already taken.');
    }
    const rank = (await first(env, 'SELECT coalesce(max(singles_rank), 0) + 1 AS r FROM players')).r;
    const id = uuid();
    const now = nowIso();
    await commit(env, [
      guardLadder(env, lv),
      stmt(env,
        `INSERT INTO players (id, user_id, username, username_lower, display_name, avatar_url, singles_rating, doubles_rating,
           singles_rank, last_active_at, created_date, updated_date, created_by_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, user.id, username, username.toLowerCase(), display, avatar, START_RATING, START_RATING, rank, now, now, now, user.id),
      bumpLadder(env),
    ]);
    return { player: pub('Player', await first(env, 'SELECT * FROM players WHERE id = ?', id)) };
  });

fns.updatePlayer = ({ env, user }, body) =>
  retrying(async () => {
    const p = await requirePlayer(env, user);
    const set = {};
    if (body.username !== undefined) {
      set.username = cleanUsername(body.username);
      set.username_lower = set.username.toLowerCase();
      if (set.username_lower !== p.username_lower &&
          await first(env, 'SELECT 1 AS x FROM players WHERE username_lower = ? AND id <> ?', set.username_lower, p.id)) {
        throw new HttpError(409, 'That username is already taken.');
      }
    }
    if (body.display_name !== undefined) set.display_name = cleanDisplayName(body.display_name) || set.username || p.username;
    if (body.bio !== undefined) set.bio = cleanBio(body.bio);
    if (body.avatar_url !== undefined) set.avatar_url = await cleanAvatar(env, user, body.avatar_url, p.avatar_url);
    const keys = Object.keys(set);
    if (keys.length) {
      const now = nowIso();
      const np = { ...p, ...set };
      const stmts = [
        guardRow(env, 'players', p.id, p.version),
        stmt(env, `UPDATE players SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_date = ?, version = version + 1 WHERE id = ?`,
          ...keys.map((k) => set[k]), now, p.id),
      ];
      // Refresh denormalised copies in PENDING matches and live challenges. Verified history stays immutable.
      const ms = await all(env,
        `SELECT * FROM matches WHERE status = 'pending' AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?)`, p.id);
      const fix = (side) => side.map((e) => (e.player_id === p.id ? { ...e, username: np.username, display_name: np.display_name, avatar_url: np.avatar_url } : e));
      for (const raw of ms) {
        const m = decodeInternal('Match', raw);
        stmts.push(guardRow(env, 'matches', m.id, m.version, 'pending'));
        stmts.push(stmt(env, 'UPDATE matches SET side_a = ?, side_b = ?, updated_date = ?, version = version + 1 WHERE id = ?', J(fix(m.side_a)), J(fix(m.side_b)), now, m.id));
      }
      const nm = nameOf(np);
      stmts.push(stmt(env, `UPDATE challenges SET challenger_name = ?, updated_date = ? WHERE challenger_player_id = ? AND status IN ('open','accepted')`, nm, now, p.id));
      stmts.push(stmt(env, `UPDATE challenges SET defender_name = ?, updated_date = ? WHERE defender_player_id = ? AND status IN ('open','accepted')`, nm, now, p.id));
      await commit(env, stmts);
      if ('avatar_url' in set && p.avatar_url && set.avatar_url !== p.avatar_url) await removeAvatar(env, p.avatar_url);
    }
    return { player: pub('Player', await first(env, 'SELECT * FROM players WHERE id = ?', p.id)) };
  });

function parseSide(raw, size, label) {
  if (!Array.isArray(raw) || raw.length !== size) {
    throw bad(size === 1 ? 'Each side needs exactly one player for singles.' : 'Each side needs exactly two players for doubles.');
  }
  return raw.map((e) => {
    if (!e || !isStr(e.player_id) || !e.player_id) throw bad(`Pick a player for ${label}.`);
    const paddle = e.paddle == null ? 'default' : e.paddle;
    if (paddle !== 'default' && paddle !== 'modded') throw bad("Paddle must be 'default' or 'modded'.");
    return { player_id: e.player_id, paddle };
  });
}

fns.submitMatch = ({ env, user }, body) =>
  retrying(async () => {
    const { format, target } = body;
    if (format !== 'singles' && format !== 'doubles') throw bad('Choose singles or doubles.');
    const err = validateGames(target, body.games);
    if (err) throw bad(err);
    const size = format === 'singles' ? 1 : 2;
    const a = parseSide(body.side_a, size, 'your side');
    const b = parseSide(body.side_b, size, 'the other side');
    const ids = [...a, ...b].map((e) => e.player_id);
    if (new Set(ids).size !== ids.length) throw bad('Every player can only appear once.');
    const me = await requirePlayer(env, user);
    if (!a.some((e) => e.player_id === me.id)) throw bad('You must be on the first side of the match.');
    const rows = await getPlayers(env, ids);
    if (rows.length !== ids.length) throw bad('One of those players no longer exists.');
    const byId = Object.fromEntries(rows.map((p) => [p.id, p]));
    const full = (e) => {
      const p = byId[e.player_id];
      return { player_id: p.id, user_id: p.user_id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url, paddle: e.paddle };
    };
    const games = body.games.map((g) => ({ a: g.a, b: g.b }));
    const sum = summarizeGames(games);
    const pendingCount = (await first(env, `SELECT count(*) AS n FROM matches WHERE status = 'pending' AND submitted_by_user_id = ?`, user.id)).n;
    if (pendingCount >= PENDING_CAP) throw bad(`You have ${PENDING_CAP} results waiting for confirmation. Wait for some to resolve or cancel them first.`);
    const id = uuid();
    const now = nowIso();
    await commit(env, [
      guard(env, `(SELECT count(*) FROM matches WHERE status = 'pending' AND submitted_by_user_id = ?) < ?`, user.id, PENDING_CAP),
      guard(env, `(SELECT count(*) FROM players WHERE id IN (${placeholders(ids.length)})) = ?`, ...ids, ids.length),
      stmt(env,
        `INSERT INTO matches (id, format, target, side_a, side_b, games, games_a, games_b, winner_side, status,
           all_player_ids, all_user_ids, accepted_user_ids, submitted_by_name, submitted_by_user_id, expires_at,
           created_date, updated_date, created_by_id)
         VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?)`,
        id, format, target, J(a.map(full)), J(b.map(full)), J(games), sum.games_a, sum.games_b, sum.winner_side,
        J(ids), J(ids.map((i) => byId[i].user_id)), J([user.id]), nameOf(me), user.id,
        inFutureIso(MATCH_EXPIRY_MS), now, now, user.id),
      touch(env, me.id, now),
    ]);
    return { match: pub('Match', await first(env, 'SELECT * FROM matches WHERE id = ?', id)) };
  });

/** Builds the guarded statements that verify a match (ratings, xp, records, ladder). */
async function verifyPlan(env, m, now, lv) {
  const players = await getPlayers(env, m.all_player_ids);
  if (players.length !== m.all_player_ids.length) throw new HttpError(409, 'A player in this match no longer exists.');
  const fmt = m.format;
  const sides = { a: m.side_a.map((e) => e.player_id), b: m.side_b.map((e) => e.player_id) };
  const sideOf = (id) => (sides.a.includes(id) ? 'a' : 'b');
  const ids = m.all_player_ids;

  // Earlier VERIFIED same-format meetings in the last 180 days. For player P, a meeting is an earlier match
  // where P was opposite at least one of P's opponents in this match (singles: the same opponent).
  const prevRows = await all(env,
    `SELECT side_a, side_b FROM matches WHERE status = 'verified' AND format = ? AND id <> ? AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value IN (${placeholders(ids.length)}))`,
    fmt, m.id, daysAgoIso(REPEAT_WINDOW_DAYS), ...ids);
  const prev = prevRows.map((r) => ({ A: JSON.parse(r.side_a).map((e) => e.player_id), B: JSON.parse(r.side_b).map((e) => e.player_id) }));
  const earlier = (pid) => {
    const opps = sides[sideOf(pid) === 'a' ? 'b' : 'a'];
    let n = 0;
    for (const { A, B } of prev) {
      const mine = A.includes(pid) ? A : B.includes(pid) ? B : null;
      if (!mine) continue;
      const theirs = mine === A ? B : A;
      if (opps.some((o) => theirs.includes(o))) n++;
    }
    return n;
  };

  const rc = `${fmt}_rating`, wc = `${fmt}_wins`, lc = `${fmt}_losses`;
  const parts = players.map((p) => ({ id: p.id, side: sideOf(p.id), rating: p[rc], matchesPlayed: p[wc] + p[lc], earlierMeetings: earlier(p.id) }));
  const results = rateMatch(parts, m.winner_side);
  const changes = [];
  const stmts = [];
  for (const res of results) {
    const p = players.find((x) => x.id === res.id);
    const side = sideOf(p.id);
    const won = side === m.winner_side;
    const gamesWon = m.games.filter((g) => (side === 'a' ? g.a > g.b : g.b > g.a)).length;
    const xpGain = xpForMatch({ won, gamesWon });
    const xp = p.xp + xpGain;
    stmts.push(guardRow(env, 'players', p.id, p.version));
    stmts.push(stmt(env,
      `UPDATE players SET ${rc} = ?, ${won ? wc : lc} = ${won ? wc : lc} + 1, xp = ?, level = ?, last_active_at = ?,
         updated_date = ?, version = version + 1 WHERE id = ?`,
      res.after, xp, levelForXp(xp), now, now, p.id));
    changes.push({ player_id: p.id, name: nameOf(p), before: res.before, after: res.after, delta: res.delta, xp_gained: xpGain });
  }
  if (fmt === 'singles') {
    const winner = sides[m.winner_side][0];
    const loser = sides[m.winner_side === 'a' ? 'b' : 'a'][0];
    const swap = await swapPlan(env, winner, loser);
    if (swap.length) stmts.push(guardLadder(env, lv), ...swap, bumpLadder(env));
    // An accepted challenge between these two players, accepted before this result was submitted, is now played.
    const ch = await first(env,
      `SELECT * FROM challenges WHERE status = 'accepted' AND responded_at <= ? AND (expires_at IS NULL OR expires_at > ?)
         AND ((challenger_player_id = ? AND defender_player_id = ?) OR (challenger_player_id = ? AND defender_player_id = ?)) LIMIT 1`,
      m.created_date, now, winner, loser, loser, winner);
    if (ch) {
      stmts.push(guardRow(env, 'challenges', ch.id, ch.version, 'accepted'));
      stmts.push(stmt(env, `UPDATE challenges SET status = 'completed', updated_date = ?, version = version + 1 WHERE id = ?`, now, ch.id));
    }
  }
  return { stmts, changes };
}

fns.respondMatch = ({ env, user }, body) =>
  retrying(async () => {
    const { match_id: id, decision } = body;
    if (!isStr(id)) throw bad('Missing match.');
    if (!['accept', 'decline', 'dispute', 'cancel'].includes(decision)) throw bad('Choose accept, decline, dispute or cancel.');
    const lv = await ladderVersion(env);
    const m = await getMatch(env, id);
    if (!m) throw new HttpError(404, 'Match not found.');
    if (!m.all_user_ids.includes(user.id)) throw new HttpError(403, 'Only players in this match can respond.');
    if (m.status !== 'pending') throw bad('This result is no longer waiting for a response.');
    const now = nowIso();
    if (m.expires_at && m.expires_at <= now) throw bad('This result has expired.');
    if (decision === 'cancel' && m.submitted_by_user_id !== user.id) throw new HttpError(403, 'Only the person who submitted this result can cancel it.');
    if (decision !== 'cancel' && m.accepted_user_ids.includes(user.id)) throw bad('You have already confirmed this result.');
    const me = await getPlayerByUser(env, user.id);
    const stmts = [guardRow(env, 'matches', m.id, m.version, 'pending')];
    if (decision === 'accept') {
      const accepted = [...m.accepted_user_ids, user.id];
      if (m.all_user_ids.every((u) => accepted.includes(u))) {
        const plan = await verifyPlan(env, m, now, lv);
        stmts.push(...plan.stmts, stmt(env,
          `UPDATE matches SET accepted_user_ids = ?, status = 'verified', verified_at = ?, rating_changes = ?,
             updated_date = ?, version = version + 1 WHERE id = ?`,
          J(accepted), now, J(plan.changes), now, m.id));
      } else {
        stmts.push(stmt(env, 'UPDATE matches SET accepted_user_ids = ?, updated_date = ?, version = version + 1 WHERE id = ?', J(accepted), now, m.id));
      }
    } else {
      stmts.push(stmt(env, 'UPDATE matches SET status = ?, updated_date = ?, version = version + 1 WHERE id = ?',
        { decline: 'declined', dispute: 'disputed', cancel: 'cancelled' }[decision], now, m.id));
    }
    if (me) stmts.push(touch(env, me.id, now));
    await commit(env, stmts);
    return { match: pub('Match', await first(env, 'SELECT * FROM matches WHERE id = ?', id)) };
  });

fns.createChallenge = ({ env, user }, body) =>
  retrying(async () => {
    if (!isStr(body.defender_player_id)) throw bad('Pick a player to challenge.');
    let message = body.message ?? '';
    if (!isStr(message)) throw bad('Message must be text.');
    message = message.trim();
    if (message.length > 200) throw bad('Messages are at most 200 characters.');
    const lv = await ladderVersion(env);
    const me = await requirePlayer(env, user);
    if (me.id === body.defender_player_id) throw bad('You cannot challenge yourself.');
    const def = (await getPlayers(env, [body.defender_player_id]))[0];
    if (!def) throw new HttpError(404, 'That player does not exist.');
    if (me.singles_rank == null || def.singles_rank == null) throw bad('Both players need a ladder position.');
    const gap = me.singles_rank - def.singles_rank;
    if (gap < 1 || gap > 3) throw bad('You can only challenge players 1–3 ranks above you.');
    if (await first(env, `SELECT 1 AS x FROM challenges WHERE challenger_user_id = ? AND status IN ('open','accepted') LIMIT 1`, user.id)) {
      throw new HttpError(409, 'You already have an active challenge.');
    }
    const id = uuid();
    const now = nowIso();
    await commit(env, [
      guardLadder(env, lv),
      guard(env, `NOT EXISTS (SELECT 1 FROM challenges WHERE challenger_user_id = ? AND status IN ('open','accepted'))`, user.id),
      stmt(env,
        `INSERT INTO challenges (id, challenger_user_id, challenger_player_id, challenger_name, challenger_rank, defender_user_id,
           defender_player_id, defender_name, defender_rank, message, status, expires_at, created_date, updated_date, created_by_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?)`,
        id, user.id, me.id, nameOf(me), me.singles_rank, def.user_id, def.id, nameOf(def), def.singles_rank, message,
        inFutureIso(CHALLENGE_MS), now, now, user.id),
      touch(env, me.id, now),
    ]);
    return { challenge: pub('Challenge', await getChallenge(env, id)) };
  });

fns.respondChallenge = ({ env, user }, body) =>
  retrying(async () => {
    const { challenge_id: id, decision } = body;
    if (!isStr(id)) throw bad('Missing challenge.');
    if (decision !== 'accept' && decision !== 'decline') throw bad('Choose accept or decline.');
    const c = await getChallenge(env, id);
    if (!c) throw new HttpError(404, 'Challenge not found.');
    if (c.defender_user_id !== user.id) throw new HttpError(403, 'Only the challenged player can respond.');
    if (c.status !== 'open') throw bad('This challenge is no longer open.');
    const now = nowIso();
    if (c.expires_at && c.expires_at <= now) throw bad('This challenge has expired.');
    const accept = decision === 'accept';
    // Accepting starts a fresh 72h window to actually play; unplayed accepted challenges expire in syncLadder.
    await commit(env, [
      guardRow(env, 'challenges', c.id, c.version, 'open'),
      stmt(env, 'UPDATE challenges SET status = ?, responded_at = ?, expires_at = ?, updated_date = ?, version = version + 1 WHERE id = ?',
        accept ? 'accepted' : 'declined', now, accept ? inFutureIso(CHALLENGE_MS) : c.expires_at, now, c.id),
    ]);
    return { challenge: pub('Challenge', await getChallenge(env, id)) };
  });

fns.resolveChallenge = ({ env, user }, body) =>
  retrying(async () => {
    const { challenge_id: id, action } = body;
    if (!isStr(id)) throw bad('Missing challenge.');
    if (!['request', 'forfeit', 'dismiss'].includes(action)) throw bad('Choose request, forfeit or dismiss.');
    const lv = await ladderVersion(env);
    const c = await getChallenge(env, id);
    if (!c) throw new HttpError(404, 'Challenge not found.');
    if (action === 'request') {
      if (c.challenger_user_id !== user.id) throw new HttpError(403, 'Only the challenger can request a review.');
    } else if (user.role !== 'admin') {
      throw new HttpError(403, 'Admins only.');
    }
    if (c.status !== 'expired') throw bad('Only expired challenges can be reviewed.');
    if (c.responded_at) throw bad('That challenge was accepted but never played, so there is nothing to review.');
    const now = nowIso();
    const stmts = [guardRow(env, 'challenges', c.id, c.version, 'expired')];
    if (action === 'request') {
      if (c.review_requested) throw bad('A review was already requested.');
      stmts.push(stmt(env, 'UPDATE challenges SET review_requested = 1, updated_date = ?, version = version + 1 WHERE id = ?', now, c.id));
    } else if (action === 'dismiss') {
      stmts.push(stmt(env, `UPDATE challenges SET status = 'cancelled', resolved_by = ?, responded_at = ?, updated_date = ?, version = version + 1 WHERE id = ?`, user.id, now, now, c.id), flagsStmt(env));
    } else {
      // applyLadderSwap is a no-op unless the challenger is still below the defender.
      const swap = await swapPlan(env, c.challenger_player_id, c.defender_player_id);
      if (swap.length) stmts.push(guardLadder(env, lv), ...swap, bumpLadder(env));
      stmts.push(stmt(env, `UPDATE challenges SET status = 'forfeited', resolved_by = ?, responded_at = ?, updated_date = ?, version = version + 1 WHERE id = ?`, user.id, now, now, c.id), flagsStmt(env));
    }
    await commit(env, stmts);
    return { challenge: pub('Challenge', await getChallenge(env, id)) };
  });

/** Expire overdue challenges/matches, recompute flags, compact ranks. Session-free (also run by cron). */
export const runSyncLadder = ({ env }) =>
  retrying(async () => {
    const lv = await ladderVersion(env);
    const now = nowIso();
    const compact = await compactPlan(env, null);
    const stmts = [];
    if (compact.length) stmts.push(guardLadder(env, lv));
    const iC = stmts.push(stmt(env, `UPDATE challenges SET status = 'expired', updated_date = ?, version = version + 1 WHERE status IN ('open','accepted') AND expires_at < ?`, now, now)) - 1;
    const iM = stmts.push(stmt(env, `UPDATE matches SET status = 'expired', updated_date = ?, version = version + 1 WHERE status = 'pending' AND expires_at < ?`, now, now)) - 1;
    stmts.push(flagsStmt(env), ...compact);
    if (compact.length) stmts.push(bumpLadder(env));
    const res = await commit(env, stmts);
    return { ok: true, expired_challenges: res[iC].meta.changes, expired_matches: res[iM].meta.changes };
  });

fns.syncLadder = runSyncLadder;

fns.deleteAccount = ({ env, user }, body) =>
  retrying(async () => {
    if (body.confirm !== 'DELETE') throw bad('Type DELETE to confirm.');
    const lv = await ladderVersion(env);
    const p = await getPlayerByUser(env, user.id);
    const compact = await compactPlan(env, p?.id ?? null);
    await commit(env, [
      guardLadder(env, lv),
      stmt(env, `DELETE FROM challenges WHERE status IN ('open','accepted') AND (challenger_user_id = ? OR defender_user_id = ?)`, user.id, user.id),
      stmt(env, `DELETE FROM matches WHERE status = 'pending' AND EXISTS (SELECT 1 FROM json_each(all_user_ids) WHERE value = ?)`, user.id),
      stmt(env, 'DELETE FROM players WHERE user_id = ?', user.id),
      ...compact,
      bumpLadder(env),
      flagsStmt(env),
      stmt(env, 'DELETE FROM "session" WHERE "userId" = ?', user.id),
      stmt(env, 'DELETE FROM "account" WHERE "userId" = ?', user.id),
      stmt(env, 'DELETE FROM "user" WHERE id = ?', user.id),
    ]);
    if (p?.avatar_url) await removeAvatar(env, p.avatar_url);
    return { ok: true };
  });

export const functions = new Hono();
functions.post('/:name', async (c) => {
  const name = c.req.param('name');
  const fn = Object.hasOwn(fns, name) ? fns[name] : null;
  if (!fn) throw new HttpError(404, 'Unknown function');
  const user = await getUser(c);
  if (!user) throw new HttpError(401, 'Sign in required');
  let body = {};
  const text = await c.req.text();
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      throw bad('Request body must be JSON.');
    }
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw bad('Request body must be a JSON object.');
  return c.json(await fn({ env: c.env, user }, body));
});
