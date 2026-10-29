import { Hono } from 'hono';
import {
  all, first, stmt, guard, guardRow, guardLadder, bumpLadder, ladderVersion, commit, retrying, uuid, nowIso,
  daysAgoIso, inFutureIso, placeholders,
} from './db.js';
import { getUser } from './auth.js';
import { HttpError, bad } from './errors.js';
import { submitFeedback, listFeedback, updateFeedback, myFeedback, myFeedbackUnread, markFeedbackSeen, replyFeedback } from './feedback.js';
import { myQueueCount } from './queue.js';
import * as chat from './chat.js';
import { avatarOwner, removeAvatar } from './uploads.js';
import { tierChange, PROVISIONAL } from './tiers.js';
import { decodeInternal, pub } from './schema.js';
import {
  START_RATING, REPEAT_WINDOW_DAYS, rateMatch, xpForMatch, levelForXp, validateGames, summarizeGames,
  RANK_SQL, DOUBLES_RANK_SQL, rankPlayers, ACTIVE_DAYS, meetingWeight, NOVELTY_DAYS, stakes, currentRd, RATING_FLOOR, challengePenalty, WALKOVER_XP, COOLDOWN_DAYS, WAIVER_DAYS, FATIGUE_DAYS,
  CHALLENGE_CAP_DAYS, CHALLENGES_RECEIVED_PER_WEEK, CHALLENGES_SENT_PER_WEEK, CHALLENGE_DOWN_TOP,
} from './rating.js';
import { weekdayDeadline, cleanTimeZone, DEFAULT_TZ } from './weekdays.js';
import { withCtx } from './email.js';
import { notify } from './notify.js';

const MATCH_EXPIRY_MS = 7 * 86400000;
const CHALLENGE_MS = 72 * 3600000; // weekday hours only: Sat/Sun in either player's zone pause the clock (weekdays.js)
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

/** Recompute singles_rank AND doubles_rank (separate SQL, separate inputs) for everyone from ratings (put AFTER every rating / membership change in a batch), then bump the ladder version. */
const activeCut = () => daysAgoIso(ACTIVE_DAYS);
const rankStmts = (env) => [stmt(env, RANK_SQL, activeCut()), stmt(env, DOUBLES_RANK_SQL, activeCut()), bumpLadder(env)];
const rankRows = (env) =>
  all(env, 'SELECT id, singles_rating AS rating, singles_wins + singles_losses AS played, created_date, singles_last_verified_at AS last_verified_at FROM players');
/**
 * unanswered_challenges = expired challenges the player was defender of (forfeited/dismissed ones leave the count).
 * under_review = unanswered >= 2 OR (inactive 30+ days AND in an open 'disputed' match). Derived data: unguarded.
 */
export const flagsStmt = (env) => {
  // Only challenges the defender never responded to count (responded_at IS NULL excludes accepted-then-unplayed).
  // Penalty-free challenges (challenged down, doubles) never count.
  const un = `(SELECT count(*) FROM challenges c WHERE c.defender_player_id = players.id AND c.status = 'expired' AND c.responded_at IS NULL AND c.reversed = 0
    AND c.format = 'singles' AND c.downward = 0)`;
  const ur = `CASE WHEN ${un} >= 2 OR (last_active_at IS NOT NULL AND last_active_at < ?
         AND EXISTS (SELECT 1 FROM matches m WHERE m.status = 'disputed'
                     AND EXISTS (SELECT 1 FROM json_each(m.all_player_ids) WHERE value = players.id))) THEN 1 ELSE 0 END`;
  const cut = daysAgoIso(30);
  // Writes only the rows whose derived values actually changed (keeps D1 rows-written low).
  return stmt(env,
    `UPDATE players SET unanswered_challenges = ${un}, under_review = ${ur}
     WHERE unanswered_challenges IS NOT ${un} OR under_review IS NOT ${ur}`, cut, cut);
};

// ---------- challenge penalties ----------
/** Challenged down (a top-3 player picked someone below) or doubles: declining or ignoring it just closes it. */
const penaltyFree = (c) => c.format === 'doubles' || !!c.downward;
/** Meeting count (180d), recent pair match (7d) and defender fatigue (verified matches in 7d) for a challenge. */
async function penaltyFacts(env, c) {
  const ids = [c.challenger_player_id, c.defender_player_id];
  const pair = (days) => first(env,
    `SELECT count(*) AS n FROM matches WHERE status = 'verified' AND ranked = 1 AND format = 'singles' AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?) AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?)`,
    daysAgoIso(days), ...ids);
  const meetingRows = await all(env,
    `SELECT verified_at FROM matches WHERE status = 'verified' AND ranked = 1 AND format = 'singles' AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?) AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?)`,
    daysAgoIso(REPEAT_WINDOW_DAYS), ...ids);
  const meetings = meetingRows.reduce((s, r) => s + meetingWeight((Date.now() - Date.parse(r.verified_at)) / 86400000), 0);
  const recentPairMatch = (await pair(WAIVER_DAYS)).n > 0;
  const defRecentMatches = (await first(env,
    `SELECT count(*) AS n FROM matches WHERE status = 'verified' AND ranked = 1 AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?)`, daysAgoIso(FATIGUE_DAYS), c.defender_player_id)).n;
  return { meetings, recentPairMatch, defRecentMatches };
}
/** A player's current singles/doubles RD (stored RD grown by the days since it was last updated). */
const rdOf = (p, fmt, nowMs = Date.now()) =>
  currentRd({ rd: p[`${fmt}_rd`], vol: p[`${fmt}_vol`], rdAt: p[`${fmt}_rd_at`], games: p[`${fmt}_game_wins`] + p[`${fmt}_game_losses`] }, nowMs);
const penaltyOf = (kind, def, chal, rankGap, facts) =>
  challengePenalty({
    kind, rankGap, defRating: def.singles_rating, defRd: rdOf(def, 'singles'), chalRating: chal.singles_rating, ...facts,
  });

/**
 * Guarded statements that penalise the defender of each OPEN challenge (kind 'expired' | 'declined').
 * Penalties act through rating only (expired: defender -P, challenger +P walkover; declined: defender -P);
 * ranks follow from the recompute appended at the end. Returns { guards, stmts, changed }; the caller puts
 * guards first and commits. Each challenge is guarded on status 'open' + version, so it is penalised at most once.
 */
async function penaltyPlan(env, challenges, kind, now, lv) {
  const roster = await rankRows(env);
  const byId = Object.fromEntries(roster.map((r) => [r.id, r]));
  const ranksNow = () => rankPlayers(roster, activeCut());
  const pl = {};
  const dirty = new Set();
  const guards = [guardLadder(env, lv)];
  const chStmts = [];
  const load = async (id) => {
    if (!(id in pl)) {
      const p = (await getPlayers(env, [id]))[0];
      pl[id] = p ? { ...p } : null;
      if (p) guards.push(guardRow(env, 'players', p.id, p.version));
    }
    return pl[id];
  };
  let changed = 0;
  for (const c of challenges) {
    if (penaltyFree(c)) {
      guards.push(guardRow(env, 'challenges', c.id, c.version, 'open'));
      chStmts.push(stmt(env, 'UPDATE challenges SET status = ?, responded_at = ?, updated_date = ?, version = version + 1 WHERE id = ?',
        kind === 'expired' ? 'expired' : 'declined', kind === 'expired' ? c.responded_at : now, now, c.id));
      changed++;
      continue;
    }
    const def = await load(c.defender_player_id);
    const chal = await load(c.challenger_player_id);
    if (!def || !chal) continue;
    guards.push(guardRow(env, 'challenges', c.id, c.version, 'open'));
    const ranks = ranksNow();
    const before = ranks[def.id] ?? null;
    const gap = ranks[def.id] != null && ranks[chal.id] != null ? Math.abs(ranks[chal.id] - ranks[def.id]) : 1;
    const res = penaltyOf(kind, def, chal, gap, await penaltyFacts(env, c));
    let gain = 0;
    if (res.penalty > 0) {
      def.singles_rating -= res.penalty; dirty.add(def.id); byId[def.id].rating = def.singles_rating;
      if (res.walkover) {
        gain = res.penalty;
        chal.singles_rating += gain; byId[chal.id].rating = chal.singles_rating;
      }
    }
    if (res.walkover) {
      chal.xp += WALKOVER_XP;
      chal.level = levelForXp(chal.xp);
      dirty.add(chal.id);
    }
    const after = ranksNow()[def.id] ?? null;
    chStmts.push(stmt(env,
      `UPDATE challenges SET status = ?, responded_at = ?, penalty_rating = ?, challenger_rating_gain = ?, penalty_rank_before = ?, penalty_rank_after = ?,
         penalty_reason = ?, penalized_at = ?, updated_date = ?, version = version + 1 WHERE id = ?`,
      kind === 'expired' ? 'expired' : 'declined', kind === 'expired' ? c.responded_at : now, res.penalty, gain, before, after,
      res.reason, now, now, c.id));
    changed++;
  }
  const stmts = [...chStmts];
  for (const id of dirty) {
    const p = pl[id];
    stmts.push(stmt(env,
      'UPDATE players SET singles_rating = ?, xp = ?, level = ?, updated_date = ?, version = version + 1 WHERE id = ?',
      p.singles_rating, p.xp, p.level, now, id));
  }
  if (changed) stmts.push(...rankStmts(env));
  return { guards, stmts, changed };
}

const fmtUtc = (iso) => {
  const d = new Date(iso);
  const h = d.getUTCHours();
  return `${d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')}${h < 12 ? 'am' : 'pm'} UTC`;
};

// ---------- weekly challenge caps (rolling CHALLENGE_CAP_DAYS, both formats, any status, reversed ones excluded) ----------
const capSince = () => daysAgoIso(CHALLENGE_CAP_DAYS);
const SENT_N = `(SELECT count(*) FROM challenges WHERE created_date > ? AND reversed = 0 AND challenger_player_id = ?)`;
const RECEIVED_N = `(SELECT count(*) FROM challenges WHERE created_date > ? AND reversed = 0 AND (defender_player_id = ? OR defender_partner_player_id = ?))`;
/** When a capped player gets a slot back: `dates` ascending; null while under `cap`. */
const freesAt = (dates, cap) =>
  (dates.length >= cap ? new Date(Date.parse(dates[dates.length - cap]) + CHALLENGE_CAP_DAYS * 86400000).toISOString() : null);
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
/** Refuses when the challenger is out of sends or a defender is out of receives; returns the guards that keep it so at commit. */
async function capGuards(env, me, defenders) {
  const since = capSince();
  const sent = (await all(env, `SELECT created_date FROM challenges WHERE created_date > ? AND reversed = 0 AND challenger_player_id = ? ORDER BY created_date`, since, me.id))
    .map((r) => r.created_date);
  const again = freesAt(sent, CHALLENGES_SENT_PER_WEEK);
  if (again) throw new HttpError(409, `You have sent ${CHALLENGES_SENT_PER_WEEK} challenges this week. You can send another after ${fmtUtc(again)}.`);
  const guards = [guard(env, `${SENT_N} < ?`, since, me.id, CHALLENGES_SENT_PER_WEEK)];
  for (const d of defenders) {
    const got = (await all(env,
      `SELECT created_date FROM challenges WHERE created_date > ? AND reversed = 0 AND (defender_player_id = ? OR defender_partner_player_id = ?) ORDER BY created_date`,
      since, d.id, d.id)).map((r) => r.created_date);
    const until = freesAt(got, CHALLENGES_RECEIVED_PER_WEEK);
    if (until) {
      throw new HttpError(409, `${nameOf(d)} has already been challenged ${times(CHALLENGES_RECEIVED_PER_WEEK)} this week. Try again after ${fmtUtc(until)}.`);
    }
    guards.push(guard(env, `${RECEIVED_N} < ?`, since, d.id, d.id, CHALLENGES_RECEIVED_PER_WEEK));
  }
  return guards;
}
function cleanMessage(v) {
  const message = v ?? '';
  if (!isStr(message)) throw bad('Message must be text.');
  if (message.trim().length > 200) throw bad('Messages are at most 200 characters.');
  return message.trim();
}

// ---------- functions ----------
const fns = {};

// Display theme preference, stored on the account so it follows the person to every device. null clears it.
fns.setTheme = async ({ env, user }, body) => {
  const t = body.theme;
  if (t !== 'light' && t !== 'dark' && t !== null) throw bad('Theme must be "light" or "dark".');
  await env.DB.prepare('UPDATE "user" SET "theme" = ? WHERE "id" = ?').bind(t, user.id).run();
  return { theme: t };
};

/** The browser's IANA zone, saved on the player so challenge clocks skip THEIR weekends. Unknown zones are ignored. */
fns.setTimezone = async ({ env, user }, body) => {
  const tz = cleanTimeZone(body.timezone);
  if (!tz) throw bad('Unknown time zone.');
  await env.DB.prepare('UPDATE players SET timezone = ? WHERE user_id = ? AND timezone IS NOT ?').bind(tz, user.id, tz).run();
  return { timezone: tz };
};

/** Notification emails (challenges, results) on/off for this account. Stored on the Better Auth user row. */
fns.setEmailNotifications = async ({ env, user }, body) => {
  if (typeof body.enabled !== 'boolean') throw bad('enabled must be true or false.');
  await env.DB.prepare('UPDATE "user" SET "email_notifications" = ? WHERE "id" = ?').bind(body.enabled ? 1 : 0, user.id).run();
  return { email_notifications: body.enabled };
};

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
    const rank = (await first(env, 'SELECT coalesce(max(singles_rank), 0) + 1 AS r FROM players')).r; // provisional; recomputed below
    const id = uuid();
    const now = nowIso();
    await commit(env, [
      guardLadder(env, lv),
      stmt(env,
        `INSERT INTO players (id, user_id, username, username_lower, display_name, avatar_url, singles_rating, doubles_rating,
           singles_rank, last_active_at, created_date, updated_date, created_by_id, timezone)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, user.id, username, username.toLowerCase(), display, avatar, START_RATING, START_RATING, rank, now, now, now, user.id,
        cleanTimeZone(body.timezone) || DEFAULT_TZ),
      ...rankStmts(env),
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
      stmts.push(stmt(env, `UPDATE challenges SET challenger_partner_name = ?, updated_date = ? WHERE challenger_partner_player_id = ? AND status IN ('open','accepted')`, nm, now, p.id));
      stmts.push(stmt(env, `UPDATE challenges SET defender_partner_name = ?, updated_date = ? WHERE defender_partner_player_id = ? AND status IN ('open','accepted')`, nm, now, p.id));
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
    if (body.ranked != null && typeof body.ranked !== 'boolean') throw bad('Choose ranked or unranked.');
    const ranked = body.ranked !== false;
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
           created_date, updated_date, created_by_id, ranked)
         VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?)`,
        id, format, target, J(a.map(full)), J(b.map(full)), J(games), sum.games_a, sum.games_b, sum.winner_side,
        J(ids), J(ids.map((i) => byId[i].user_id)), J([user.id]), nameOf(me), user.id,
        inFutureIso(MATCH_EXPIRY_MS), now, now, user.id, ranked ? 1 : 0),
      touch(env, me.id, now),
    ]);
    await notify(env, 'match_submitted', { match_id: id, actor_user_id: user.id });
    return { match: pub('Match', await first(env, 'SELECT * FROM matches WHERE id = ?', id)) };
  });

/**
 * rateMatch participants for a (real or previewed) match: ratings, games played, recency-weighted earlier meetings,
 * days since the last verified match and novelty, all in format `fmt`. `excludeId` = the match itself (verify).
 * Returns { players, parts, sideOf }.
 */
async function ratingParts(env, { fmt, sides, paddleOf, excludeId = '', now }) {
  const ids = [...sides.a, ...sides.b];
  const players = await getPlayers(env, ids);
  if (players.length !== ids.length) throw new HttpError(409, 'A player in this match no longer exists.');
  const sideOf = (id) => (sides.a.includes(id) ? 'a' : 'b');
  // Earlier VERIFIED same-format meetings in the last 180 days. For player P, a meeting is an earlier match
  // where P was opposite at least one of P's opponents in this match (singles: the same opponent).
  // Each counts 0.5 ^ (days ago / REPEAT_HALF_LIFE_DAYS) (meetingWeight): it fades as time passes.
  const prevRows = await all(env,
    `SELECT side_a, side_b, verified_at FROM matches WHERE status = 'verified' AND ranked = 1 AND format = ? AND id <> ? AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value IN (${placeholders(ids.length)}))`,
    fmt, excludeId, daysAgoIso(REPEAT_WINDOW_DAYS), ...ids);
  const prev = prevRows.map((r) => {
    const days = (Date.parse(now) - Date.parse(r.verified_at)) / 86400000;
    return { A: JSON.parse(r.side_a).map((e) => e.player_id), B: JSON.parse(r.side_b).map((e) => e.player_id), w: meetingWeight(days), days };
  });
  const meetings = (pid) => {
    const opps = sides[sideOf(pid) === 'a' ? 'b' : 'a'];
    return prev.filter(({ A, B }) => {
      const mine = A.includes(pid) ? A : B.includes(pid) ? B : null;
      if (!mine) return false;
      const theirs = mine === A ? B : A;
      return opps.some((o) => theirs.includes(o));
    });
  };
  const rc = `${fmt}_rating`, wc = `${fmt}_wins`, lc = `${fmt}_losses`, gwc = `${fmt}_game_wins`, glc = `${fmt}_game_losses`;
  const rdc = `${fmt}_rd`, volc = `${fmt}_vol`, rdat = `${fmt}_rd_at`;
  const parts = players.map((p) => {
    const met = meetings(p.id);
    return {
      id: p.id, side: sideOf(p.id), paddle: paddleOf(p.id), rating: p[rc], gamesPlayed: p[gwc] + p[glc], matchesPlayed: p[wc] + p[lc],
      earlierMeetings: met.reduce((t, x) => t + x.w, 0),
      // novelty / New rival: no meeting with these opponents in NOVELTY_DAYS (or ever)
      novel: !met.some((x) => x.days < NOVELTY_DAYS),
      // Glicko-2 state: RD grows with the days since it was last updated (null = first ever match in this format)
      rd: p[rdc], vol: p[volc],
      daysSinceLast: p[rdat] ? Math.max(0, (Date.parse(now) - Date.parse(p[rdat])) / 86400000) : null,
    };
  });
  return { players, parts, sideOf };
}

/** An accepted singles challenge between these two players (accepted before `before`), still in its play window. */
const acceptedChallenge = (env, x, y, before, now) => first(env,
  `SELECT * FROM challenges WHERE format = 'singles' AND status = 'accepted' AND responded_at <= ? AND (expires_at IS NULL OR expires_at > ?)
     AND ((challenger_player_id = ? AND defender_player_id = ?) OR (challenger_player_id = ? AND defender_player_id = ?)) LIMIT 1`,
  before, now, x, y, y, x);
/** An accepted doubles challenge between exactly these two pairs (either way round), accepted before `before`, still in its window. */
async function acceptedDoublesChallenge(env, a, b, before, now) {
  const rows = await all(env,
    `SELECT * FROM challenges WHERE format = 'doubles' AND status = 'accepted' AND responded_at <= ? AND (expires_at IS NULL OR expires_at > ?)
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?)`, before, now, a[0]);
  const same = (x, y) => x.length === y.length && x.every((v) => y.includes(v));
  return rows.find((c) => {
    const p = [c.challenger_player_id, c.challenger_partner_player_id], q = [c.defender_player_id, c.defender_partner_player_id];
    return (same(p, a) && same(q, b)) || (same(p, b) && same(q, a));
  }) || null;
}
/** The accepted challenge (either format) a match between `sides` plays, or null. */
const challengeFor = (env, fmt, sides, before, now) =>
  (fmt === 'singles' ? acceptedChallenge(env, sides.a[0], sides.b[0], before, now) : acceptedDoublesChallenge(env, sides.a, sides.b, before, now));

/**
 * Unranked match: XP only. Ratings, W/L records, streaks, ranks, activity and challenges stay untouched, and it never
 * counts as a meeting for rematch / new-rival / dodge math, so neither the streak nor the new-rival XP applies.
 */
function unrankedPlan(env, m, now, players, parts, sideOf) {
  const rc = `${m.format}_rating`;
  const sideAvg = (s) => {
    const ps = players.filter((p) => sideOf(p.id) === s);
    return ps.reduce((t, p) => t + p[rc], 0) / ps.length;
  };
  const today = now.slice(0, 10);
  const stmts = [];
  const changes = [];
  for (const p of players) {
    const side = sideOf(p.id);
    const won = side === m.winner_side;
    const mine = side === 'a' ? (g) => g.a : (g) => g.b;
    const theirs = side === 'a' ? (g) => g.b : (g) => g.a;
    const gamesWon = m.games.filter((g) => mine(g) > theirs(g)).length;
    const xpRes = xpForMatch({
      won, gamesWon, ratingGap: sideAvg(side === 'a' ? 'b' : 'a') - sideAvg(side),
      skunks: m.games.filter((g) => mine(g) > theirs(g) && theirs(g) === 0).length,
      lostFirstGame: mine(m.games[0]) < theirs(m.games[0]), firstOfDay: p.last_match_day !== today,
    });
    const xp = p.xp + xpRes.total;
    stmts.push(guardRow(env, 'players', p.id, p.version));
    stmts.push(stmt(env, 'UPDATE players SET xp = ?, level = ?, last_active_at = ?, last_match_day = ?, updated_date = ?, version = version + 1 WHERE id = ?',
      xp, levelForXp(xp), now, today, now, p.id));
    const r = p[rc];
    changes.push({ player_id: p.id, name: nameOf(p), before: r, after: r, delta: 0, unranked: true, xp_gained: xpRes.total, xp_parts: xpRes.parts });
  }
  return { stmts, changes };
}

/** Builds the guarded statements that verify a match (ratings, xp, records, ladder). */
async function verifyPlan(env, m, now) {
  const fmt = m.format;
  const sides = { a: m.side_a.map((e) => e.player_id), b: m.side_b.map((e) => e.player_id) };
  const paddleOf = (id) => [...m.side_a, ...m.side_b].find((e) => e.player_id === id)?.paddle;
  const { players, parts, sideOf } = await ratingParts(env, { fmt, sides, paddleOf, excludeId: m.id, now });
  if (m.ranked === false) return unrankedPlan(env, m, now, players, parts, sideOf);

  // An accepted challenge between these players (pairs), accepted before this result was submitted, is played by this match.
  const ch = await challengeFor(env, fmt, sides, m.created_date, now);

  const rc = `${fmt}_rating`, wc = `${fmt}_wins`, lc = `${fmt}_losses`, gwc = `${fmt}_game_wins`, glc = `${fmt}_game_losses`, vc = `${fmt}_last_verified_at`, sc = `${fmt}_win_streak`, bc = `${fmt}_best_streak`;
  const rdc = `${fmt}_rd`, volc = `${fmt}_vol`, rdat = `${fmt}_rd_at`;
  const results = rateMatch(parts, m.winner_side, m.games, { target: m.target, challenge: !!ch });
  const sideAvg = (s) => sides[s].reduce((t, id) => t + players.find((x) => x.id === id)[rc], 0) / sides[s].length;
  const today = now.slice(0, 10);
  const changes = [];
  const stmts = [];
  for (const res of results) {
    const p = players.find((x) => x.id === res.id);
    const side = sideOf(p.id);
    const won = side === m.winner_side;
    const gamesWon = m.games.filter((g) => (side === 'a' ? g.a > g.b : g.b > g.a)).length;
    const mine = side === 'a' ? (g) => g.a : (g) => g.b;
    const theirs = side === 'a' ? (g) => g.b : (g) => g.a;
    const streak = won ? (p[sc] || 0) + 1 : 0;
    const best = Math.max(p[bc] || 0, streak);
    const xpRes = xpForMatch({
      won,
      gamesWon,
      ratingGap: sideAvg(side === 'a' ? 'b' : 'a') - sideAvg(side),
      streak,
      skunks: m.games.filter((g) => mine(g) > theirs(g) && theirs(g) === 0).length,
      lostFirstGame: mine(m.games[0]) < theirs(m.games[0]),
      firstOfDay: p.last_match_day !== today,
      newRival: parts.find((x) => x.id === p.id).novel,
    });
    const xpGain = xpRes.total;
    const xp = p.xp + xpGain;
    stmts.push(guardRow(env, 'players', p.id, p.version));
    stmts.push(stmt(env,
      `UPDATE players SET ${rc} = ?, ${won ? wc : lc} = ${won ? wc : lc} + 1, ${gwc} = ${gwc} + ?, ${glc} = ${glc} + ?, xp = ?, level = ?, last_active_at = ?,
         ${sc} = ?, ${bc} = ?, last_match_day = ?, ${vc} = ?, ${rdc} = ?, ${volc} = ?, ${rdat} = ?, updated_date = ?, version = version + 1 WHERE id = ?`,
      res.after, gamesWon, m.games.length - gamesWon, xp, levelForXp(xp), now, streak, best, today, now, res.rd_after, res.vol_after, now, now, p.id));
    changes.push({
      player_id: p.id, name: nameOf(p), before: res.before, after: res.after, delta: res.delta,
      dominance: res.dominance, repeat: res.repeat, evidence: res.evidence, challenge: res.challenge, novelty: res.novelty,
      rd_before: res.rd_before, rd_after: res.rd_after, vol_before: res.vol_before, vol_after: res.vol_after,
      games: res.games.map((g) => ({
        game: g.game, score: g.score, won: g.won, before: g.before, after: g.after, delta: g.delta,
        expected: g.expected, dominance: g.dominance, mov: g.mov, ac: g.ac, paddle_edge: g.paddle_edge, k: g.k,
        rd_before: g.rd_before, rd_after: g.rd_after, vol: g.vol, evidence: g.evidence, repeat: g.repeat, teammate: g.teammate,
        challenge: g.challenge, novelty: g.novelty,
      })),
      xp_gained: xpGain, xp_parts: xpRes.parts, win_streak: streak,
      matches_played: p[wc] + p[lc] + 1, // in this format, including this match (placement badge)
      // Tier crossing (derived from rating); only once placed (5+ matches in this format before this one).
      ...(p[wc] + p[lc] >= PROVISIONAL ? tierChange(res.before, res.after) : null),
    });
  }
  stmts.push(...rankStmts(env)); // each format's rank SQL reads only its own columns; the other is a no-op
  if (ch) {
    stmts.push(guardRow(env, 'challenges', ch.id, ch.version, 'accepted'));
    stmts.push(stmt(env, `UPDATE challenges SET status = 'completed', updated_date = ?, version = version + 1 WHERE id = ?`, now, ch.id));
  }
  return { stmts, changes };
}

/**
 * "What's on the line": rating change for each player if their side wins / loses a typical 2-1 (STAKES_GAMES), plus
 * any tier crossing. Body: { match_id } (a pending match you are in) | { challenge_id } (an open/accepted challenge you
 * are in, singles or doubles, played as a challenge) | { format, target, side_a: [{ player_id, paddle }], side_b } (Record a match).
 */
fns.matchStakes = async ({ env, user }, body) => {
  const me = await requirePlayer(env, user);
  const now = nowIso();
  let fmt, target, sides, paddles = {}, challenge = false, match = null;
  if (body.match_id != null) {
    if (!isStr(body.match_id)) throw bad('Missing match.');
    const m = await getMatch(env, body.match_id);
    if (!m) throw new HttpError(404, 'Match not found.');
    if (!m.all_user_ids.includes(user.id)) throw new HttpError(403, 'Only players in this match can see this.');
    fmt = m.format; target = m.target; match = m;
    sides = { a: m.side_a.map((e) => e.player_id), b: m.side_b.map((e) => e.player_id) };
    for (const e of [...m.side_a, ...m.side_b]) paddles[e.player_id] = e.paddle;
    challenge = !!(await challengeFor(env, fmt, sides, m.created_date, now));
  } else if (body.challenge_id != null) {
    if (!isStr(body.challenge_id)) throw bad('Missing challenge.');
    const c = await getChallenge(env, body.challenge_id);
    if (!c) throw new HttpError(404, 'Challenge not found.');
    const users = [c.challenger_user_id, c.defender_user_id, c.challenger_partner_user_id, c.defender_partner_user_id];
    if (!users.includes(user.id)) throw new HttpError(403, 'Only players in this challenge can see this.');
    target = 11; challenge = true;
    if (c.format === 'doubles') {
      fmt = 'doubles';
      const mine = [c.challenger_player_id, c.challenger_partner_player_id], theirs = [c.defender_player_id, c.defender_partner_player_id];
      sides = mine.includes(me.id) ? { a: mine, b: theirs } : { a: theirs, b: mine };
    } else {
      fmt = 'singles';
      sides = { a: [c.defender_player_id], b: [c.challenger_player_id] };
    }
  } else {
    fmt = body.format; target = body.target;
    if (fmt !== 'singles' && fmt !== 'doubles') throw bad('Choose singles or doubles.');
    if (target !== 11 && target !== 21) throw bad('Choose a game target of 11 or 21.');
    const size = fmt === 'singles' ? 1 : 2;
    const a = parseSide(body.side_a, size, 'your side');
    const b = parseSide(body.side_b, size, 'the other side');
    const ids = [...a, ...b].map((e) => e.player_id);
    if (new Set(ids).size !== ids.length) throw bad('Every player can only appear once.');
    if (!a.some((e) => e.player_id === me.id)) throw bad('You must be on the first side of the match.');
    sides = { a: a.map((e) => e.player_id), b: b.map((e) => e.player_id) };
    for (const e of [...a, ...b]) paddles[e.player_id] = e.paddle;
    challenge = !!(await challengeFor(env, fmt, sides, now, now));
  }
  const { players, parts } = await ratingParts(env, { fmt, sides, paddleOf: (id) => paddles[id] || 'default', now });
  const bySide = { a: parts.filter((p) => p.side === 'a'), b: parts.filter((p) => p.side === 'b') };
  const out = stakes({ format: fmt, target, sides: bySide, paddles, challenge }, tierChange);
  const nameById = Object.fromEntries(players.map((p) => [p.id, nameOf(p)]));
  // A pending match already has its scores: also say exactly what confirming it does (same rules verification uses).
  const actual = match && match.ranked !== false
    ? Object.fromEntries(rateMatch(parts.map((p) => ({ ...p, paddle: paddles[p.id] || 'default' })), match.winner_side, match.games,
      { target, challenge }).map((r) => [r.id, r]))
    : null;
  return {
    format: fmt, target, challenge, ranked: match ? match.ranked !== false : body.ranked !== false, assumed: 'a narrow 2-1 (11-9, 9-11, 11-9) up to a dominant 2-0 (11-4, 11-5)',
    players: out.map((x) => {
      const r = actual?.[x.id];
      return {
        ...x, player_id: x.id, name: nameById[x.id], you: x.id === me.id,
        ...(r ? { result: r.delta, result_after: r.after, result_tier: x.placing ? null : tierChange(x.rating, r.after) } : null),
      };
    }),
  };
};

fns.respondMatch = ({ env, user }, body) =>
  retrying(async () => {
    const { match_id: id, decision } = body;
    if (!isStr(id)) throw bad('Missing match.');
    if (!['accept', 'decline', 'dispute', 'cancel'].includes(decision)) throw bad('Choose accept, decline, dispute or cancel.');
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
        const plan = await verifyPlan(env, m, now);
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
    if (decision === 'accept') await notify(env, 'match_verified', { match_id: id, actor_user_id: user.id }); // no-op unless now verified
    return { match: pub('Match', await first(env, 'SELECT * FROM matches WHERE id = ?', id)) };
  });

fns.createChallenge = ({ env, user }, body) =>
  retrying(async () => {
    if (body.format === 'doubles') return createDoublesChallenge(env, user, body);
    if (body.format != null && body.format !== 'singles') throw bad('Choose singles or doubles.');
    if (!isStr(body.defender_player_id)) throw bad('Pick a player to challenge.');
    const message = cleanMessage(body.message);
    const lv = await ladderVersion(env);
    const me = await requirePlayer(env, user);
    if (me.id === body.defender_player_id) throw bad('You cannot challenge yourself.');
    const def = (await getPlayers(env, [body.defender_player_id]))[0];
    if (!def) throw new HttpError(404, 'That player does not exist.');
    if (me.singles_rank == null || def.singles_rank == null) throw bad('Both players need a ladder position.');
    const gap = me.singles_rank - def.singles_rank;
    // Up 1-3 ranks; the top CHALLENGE_DOWN_TOP may also go down 1-3 (penalty-free for the defender).
    const canDown = me.singles_rank <= CHALLENGE_DOWN_TOP;
    const downward = gap < 0;
    if (gap > 3 || gap < -3 || gap === 0 || (downward && !canDown)) {
      throw bad(canDown ? 'You can challenge players 1–3 ranks above or below you.' : 'You can only challenge players 1–3 ranks above you.');
    }
    const cool = await first(env,
      `SELECT penalized_at FROM challenges WHERE challenger_player_id = ? AND defender_player_id = ? AND penalized_at > ? AND reversed = 0
         ORDER BY penalized_at DESC LIMIT 1`, me.id, def.id, daysAgoIso(COOLDOWN_DAYS));
    if (cool) {
      const retry = new Date(Date.parse(cool.penalized_at) + COOLDOWN_DAYS * 86400000).toISOString();
      throw new HttpError(409, `You challenged ${nameOf(def)} recently. You can challenge them again after ${fmtUtc(retry)}.`);
    }
    if (await first(env, `SELECT 1 AS x FROM challenges WHERE challenger_user_id = ? AND format = 'singles' AND status IN ('open','accepted') LIMIT 1`, user.id)) {
      throw new HttpError(409, 'You already have an active challenge.');
    }
    const caps = await capGuards(env, me, [def]);
    const id = uuid();
    const now = nowIso();
    await commit(env, [
      guardLadder(env, lv),
      guard(env, `NOT EXISTS (SELECT 1 FROM challenges WHERE challenger_user_id = ? AND format = 'singles' AND status IN ('open','accepted'))`, user.id),
      ...caps,
      stmt(env,
        `INSERT INTO challenges (id, challenger_user_id, challenger_player_id, challenger_name, challenger_rank, defender_user_id,
           defender_player_id, defender_name, defender_rank, message, status, expires_at, created_date, updated_date, created_by_id,
           format, downward, all_user_ids, all_player_ids)
         VALUES (?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,'singles',?,?,?)`,
        id, user.id, me.id, nameOf(me), me.singles_rank, def.user_id, def.id, nameOf(def), def.singles_rank, message,
        weekdayDeadline(Date.parse(now), CHALLENGE_MS, [me.timezone, def.timezone]), now, now, user.id,
        downward ? 1 : 0, J([user.id, def.user_id]), J([me.id, def.id])),
      touch(env, me.id, now),
    ]);
    await notify(env, 'challenge_received', { challenge_id: id, actor_user_id: user.id });
    return { challenge: pub('Challenge', await getChallenge(env, id)) };
  });

/** Doubles: you + partner vs two opponents, any four players. Partner and both opponents must all accept; nobody is penalised. */
async function createDoublesChallenge(env, user, body) {
  const ids = [body.partner_player_id, body.defender_player_id, body.defender_partner_player_id];
  if (!ids.every((v) => isStr(v) && v)) throw bad('Pick your partner and both opponents.');
  const message = cleanMessage(body.message);
  const me = await requirePlayer(env, user);
  if (new Set([me.id, ...ids]).size !== 4) throw bad('Pick four different players.');
  const rows = await getPlayers(env, ids);
  if (rows.length !== 3) throw new HttpError(404, 'One of those players does not exist.');
  const [partner, def, def2] = ids.map((i) => rows.find((p) => p.id === i));
  const active = `SELECT 1 AS x FROM challenges WHERE challenger_user_id = ? AND format = 'doubles' AND status IN ('open','accepted')`;
  if (await first(env, `${active} LIMIT 1`, user.id)) throw new HttpError(409, 'You already have an active doubles challenge.');
  const caps = await capGuards(env, me, [def, def2]);
  const id = uuid();
  const now = nowIso();
  const four = [me, partner, def, def2];
  await commit(env, [
    guard(env, `NOT EXISTS (${active})`, user.id),
    guard(env, `(SELECT count(*) FROM players WHERE id IN (${placeholders(3)})) = 3`, ...ids),
    ...caps,
    stmt(env,
      `INSERT INTO challenges (id, format, challenger_user_id, challenger_player_id, challenger_name, challenger_partner_user_id,
         challenger_partner_player_id, challenger_partner_name, defender_user_id, defender_player_id, defender_name,
         defender_partner_user_id, defender_partner_player_id, defender_partner_name, all_user_ids, all_player_ids, message, status,
         expires_at, created_date, updated_date, created_by_id)
       VALUES (?,'doubles',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?)`,
      id, user.id, me.id, nameOf(me), partner.user_id, partner.id, nameOf(partner), def.user_id, def.id, nameOf(def),
      def2.user_id, def2.id, nameOf(def2), J(four.map((p) => p.user_id)), J(four.map((p) => p.id)), message,
      weekdayDeadline(Date.parse(now), CHALLENGE_MS, four.map((p) => p.timezone)), now, now, user.id),
    touch(env, me.id, now),
  ]);
  return { challenge: pub('Challenge', await getChallenge(env, id)) };
}

/** Partner / defenders answer a doubles challenge. Accepted once all three accept; any decline closes it. No penalties. */
async function respondDoublesChallenge(env, user, c, decision) {
  const invited = [c.challenger_partner_user_id, c.defender_user_id, c.defender_partner_user_id];
  if (!invited.includes(user.id)) throw new HttpError(403, 'Only the invited players can respond.');
  if (c.status !== 'open') throw bad('This challenge is no longer open.');
  const now = nowIso();
  if (c.expires_at && c.expires_at <= now) throw bad('This challenge has expired.');
  const accepted = JSON.parse(c.accepted_user_ids || '[]');
  const stmts = [guardRow(env, 'challenges', c.id, c.version, 'open')];
  if (decision === 'decline') {
    stmts.push(stmt(env,
      `UPDATE challenges SET status = 'declined', responded_at = ?, declined_by_user_id = ?, updated_date = ?, version = version + 1 WHERE id = ?`,
      now, user.id, now, c.id));
  } else {
    if (accepted.includes(user.id)) throw bad('You have already accepted this challenge.');
    const acc = [...accepted, user.id];
    if (invited.every((u) => acc.includes(u))) {
      // Everyone is in: a fresh 72h (weekday, all four zones) window to play it.
      const four = await getPlayers(env, JSON.parse(c.all_player_ids));
      stmts.push(stmt(env,
        `UPDATE challenges SET status = 'accepted', accepted_user_ids = ?, responded_at = ?, expires_at = ?, updated_date = ?, version = version + 1 WHERE id = ?`,
        J(acc), now, weekdayDeadline(Date.parse(now), CHALLENGE_MS, four.map((p) => p.timezone)), now, c.id));
    } else {
      stmts.push(stmt(env, 'UPDATE challenges SET accepted_user_ids = ?, updated_date = ?, version = version + 1 WHERE id = ?', J(acc), now, c.id));
    }
  }
  await commit(env, stmts);
  return { challenge: pub('Challenge', await getChallenge(env, c.id)) };
}

fns.respondChallenge = ({ env, user }, body) =>
  retrying(async () => {
    const { challenge_id: id, decision } = body;
    if (!isStr(id)) throw bad('Missing challenge.');
    if (decision !== 'accept' && decision !== 'decline') throw bad('Choose accept or decline.');
    const c = await getChallenge(env, id);
    if (!c) throw new HttpError(404, 'Challenge not found.');
    if (c.format === 'doubles') return respondDoublesChallenge(env, user, c, decision);
    if (c.defender_user_id !== user.id) throw new HttpError(403, 'Only the challenged player can respond.');
    if (c.status !== 'open') throw bad('This challenge is no longer open.');
    const now = nowIso();
    if (c.expires_at && c.expires_at <= now) throw bad('This challenge has expired.');
    if (decision === 'decline') {
      const lv = await ladderVersion(env);
      const plan = await penaltyPlan(env, [c], 'declined', now, lv);
      if (!plan.changed) throw new HttpError(409, 'That challenge can no longer be answered.');
      await commit(env, [...plan.guards, ...plan.stmts, flagsStmt(env)]);
      await notify(env, 'challenge_declined', { challenge_id: id, actor_user_id: user.id });
      return { challenge: pub('Challenge', await getChallenge(env, id)) };
    }
    // Accepting starts a fresh 72h (weekday) window to actually play; unplayed accepted challenges expire in syncLadder.
    const pair = await getPlayers(env, [c.challenger_player_id, c.defender_player_id]);
    const playBy = weekdayDeadline(Date.parse(now), CHALLENGE_MS, pair.map((p) => p.timezone));
    await commit(env, [
      guardRow(env, 'challenges', c.id, c.version, 'open'),
      stmt(env, 'UPDATE challenges SET status = ?, responded_at = ?, expires_at = ?, updated_date = ?, version = version + 1 WHERE id = ?',
        'accepted', now, playBy, now, c.id),
    ]);
    await notify(env, 'challenge_accepted', { challenge_id: id, actor_user_id: user.id });
    return { challenge: pub('Challenge', await getChallenge(env, id)) };
  });

/** What declining (or ignoring) this open challenge would cost the defender. */
fns.challengePenaltyPreview = async ({ env, user }, body) => {
  if (!isStr(body.challenge_id)) throw bad('Missing challenge.');
  const c = await getChallenge(env, body.challenge_id);
  if (!c) throw new HttpError(404, 'Challenge not found.');
  if (c.defender_user_id !== user.id) throw new HttpError(403, 'Only the challenged player can see this.');
  if (c.status !== 'open') throw bad('This challenge is no longer open.');
  if (penaltyFree(c)) {
    const free = { penalty: 0, reason: c.format === 'doubles' ? 'doubles' : 'challenged_down', drops_rank: false, rank_after: c.defender_rank, challenger_gain: 0 };
    return { decline: free, expire: free };
  }
  const [def, chal] = await Promise.all([getPlayers(env, [c.defender_player_id]), getPlayers(env, [c.challenger_player_id])]).then((r) => [r[0][0], r[1][0]]);
  if (!def || !chal) throw new HttpError(404, 'Player not found.');
  const facts = await penaltyFacts(env, c);
  const roster = await rankRows(env);
  const ranks = rankPlayers(roster, activeCut());
  const gap = ranks[def.id] != null && ranks[chal.id] != null ? Math.abs(ranks[chal.id] - ranks[def.id]) : 1;
  const out = {};
  for (const kind of ['declined', 'expired']) {
    const r = penaltyOf(kind, def, chal, gap, facts);
    const gain = r.walkover ? r.penalty : 0;
    const after = rankPlayers(roster.map((p) => ({
      ...p, rating: p.rating - (p.id === def.id ? r.penalty : 0) + (p.id === chal.id ? gain : 0),
    })), activeCut())[def.id];
    out[kind === 'declined' ? 'decline' : 'expire'] = {
      penalty: r.penalty, reason: r.reason, drops_rank: after > ranks[def.id], rank_after: after,
      challenger_gain: gain,
    };
  }
  return out;
};

/**
 * Weekly allowance for the signed-in player (both formats): sends left, when the next send frees up, and which players
 * are at their weekly receive limit ({ player_id: when they free up }). Plus the caps and CHALLENGE_DOWN_TOP for the UI.
 */
fns.challengeLimits = async ({ env, user }) => {
  const me = await getPlayerByUser(env, user.id);
  const rows = await all(env,
    `SELECT challenger_player_id, defender_player_id, defender_partner_player_id, created_date FROM challenges
       WHERE created_date > ? AND reversed = 0 ORDER BY created_date`, capSince());
  const sent = me ? rows.filter((r) => r.challenger_player_id === me.id).map((r) => r.created_date) : [];
  const got = {};
  for (const r of rows) for (const d of [r.defender_player_id, r.defender_partner_player_id]) if (d) (got[d] ||= []).push(r.created_date);
  const atLimit = {};
  for (const [id, ds] of Object.entries(got)) {
    const until = freesAt(ds, CHALLENGES_RECEIVED_PER_WEEK);
    if (until) atLimit[id] = until;
  }
  return {
    sent: sent.length, sent_cap: CHALLENGES_SENT_PER_WEEK, sends_left: Math.max(0, CHALLENGES_SENT_PER_WEEK - sent.length),
    send_again_at: freesAt(sent, CHALLENGES_SENT_PER_WEEK), received_cap: CHALLENGES_RECEIVED_PER_WEEK, at_limit: atLimit,
    down_top: CHALLENGE_DOWN_TOP, window_days: CHALLENGE_CAP_DAYS,
  };
};

fns.resolveChallenge = ({ env, user }, body) =>
  retrying(async () => {
    const { challenge_id: id, action } = body;
    if (!isStr(id)) throw bad('Missing challenge.');
    if (!['request', 'reverse'].includes(action)) throw bad('Choose request or reverse.');
    const lv = await ladderVersion(env);
    const c = await getChallenge(env, id);
    if (!c) throw new HttpError(404, 'Challenge not found.');
    if (action === 'request') {
      if (c.defender_user_id !== user.id) throw new HttpError(403, 'Only the penalised player can ask for a review.');
    } else if (user.role !== 'admin') {
      throw new HttpError(403, 'Admins only.');
    }
    if (!c.penalty_reason) throw bad('That challenge has no penalty to review.');
    if (c.reversed) throw bad('That penalty was already reversed.');
    const now = nowIso();
    const stmts = [guardRow(env, 'challenges', c.id, c.version)];
    if (action === 'request') {
      if (c.review_requested) throw bad('A review was already requested.');
      stmts.push(stmt(env, 'UPDATE challenges SET review_requested = 1, updated_date = ?, version = version + 1 WHERE id = ?', now, c.id));
    } else {
      const def = (await getPlayers(env, [c.defender_player_id]))[0];
      const chal = (await getPlayers(env, [c.challenger_player_id]))[0];
      if (def) {
        stmts.push(guardRow(env, 'players', def.id, def.version));
        stmts.push(stmt(env, 'UPDATE players SET singles_rating = singles_rating + ?, updated_date = ?, version = version + 1 WHERE id = ?',
          c.penalty_rating || 0, now, def.id));
      }
      if (chal && c.penalty_reason === 'expired') {
        const xp = Math.max(0, chal.xp - WALKOVER_XP);
        stmts.push(guardRow(env, 'players', chal.id, chal.version));
        const rating = Math.max(RATING_FLOOR, chal.singles_rating - (c.challenger_rating_gain || 0));
        stmts.push(stmt(env, 'UPDATE players SET singles_rating = ?, xp = ?, level = ?, updated_date = ?, version = version + 1 WHERE id = ?',
          rating, xp, levelForXp(xp), now, chal.id));
      }
      stmts.push(guardLadder(env, lv), ...rankStmts(env));
      stmts.push(stmt(env, 'UPDATE challenges SET reversed = 1, resolved_by = ?, updated_date = ?, version = version + 1 WHERE id = ?', user.id, now, c.id));
      stmts.push(flagsStmt(env));
    }
    await commit(env, stmts);
    return { challenge: pub('Challenge', await getChallenge(env, id)) };
  });

/** Expire overdue challenges/matches, recompute flags and ranks. Session-free (also run by cron). */
export const runSyncLadder = ({ env }) =>
  retrying(async () => {
    const lv = await ladderVersion(env);
    const now = nowIso();
    // Unanswered (never responded) challenges that ran out of time cost the defender rating + rank.
    const overdue = await all(env, `SELECT * FROM challenges WHERE status = 'open' AND responded_at IS NULL AND expires_at < ? ORDER BY expires_at, id`, now);
    const plan = overdue.length ? await penaltyPlan(env, overdue, 'expired', now, lv) : { guards: [], stmts: [], changed: 0 };
    const stmts = [...plan.guards, ...plan.stmts];
    const iC = stmts.push(stmt(env, `UPDATE challenges SET status = 'expired', updated_date = ?, version = version + 1 WHERE status IN ('open','accepted') AND expires_at < ? RETURNING id`, now, now)) - 1;
    const iM = stmts.push(stmt(env, `UPDATE matches SET status = 'expired', updated_date = ?, version = version + 1 WHERE status = 'pending' AND expires_at < ?`, now, now)) - 1;
    stmts.push(flagsStmt(env), stmt(env, RANK_SQL, activeCut()), stmt(env, DOUBLES_RANK_SQL, activeCut())); // ranks are derived from ratings; idempotent
    const res = await commit(env, stmts);
    await notify(env, 'challenge_expired', { challenge_ids: [...overdue.map((c) => c.id), ...(res[iC].results || []).map((r) => r.id)] });
    return { ok: true, expired_challenges: plan.changed + res[iC].meta.changes, expired_matches: res[iM].meta.changes };
  });

fns.syncLadder = runSyncLadder;

fns.deleteAccount = ({ env, user }, body) =>
  retrying(async () => {
    if (body.confirm !== 'DELETE') throw bad('Type DELETE to confirm.');
    const lv = await ladderVersion(env);
    const p = await getPlayerByUser(env, user.id);
    await commit(env, [
      guardLadder(env, lv),
      stmt(env, `DELETE FROM challenges WHERE status IN ('open','accepted') AND (challenger_user_id = ? OR defender_user_id = ?
        OR EXISTS (SELECT 1 FROM json_each(all_user_ids) WHERE value = ?))`, user.id, user.id, user.id),
      stmt(env, `DELETE FROM matches WHERE status = 'pending' AND EXISTS (SELECT 1 FROM json_each(all_user_ids) WHERE value = ?)`, user.id),
      stmt(env, 'DELETE FROM players WHERE user_id = ?', user.id),
      ...chat.chatErasureStmts(env, user.id),
      ...rankStmts(env),
      flagsStmt(env),
      stmt(env, 'DELETE FROM "session" WHERE "userId" = ?', user.id),
      stmt(env, 'DELETE FROM "account" WHERE "userId" = ?', user.id),
      stmt(env, 'DELETE FROM "user" WHERE id = ?', user.id),
    ]);
    if (p?.avatar_url) await removeAvatar(env, p.avatar_url);
    return { ok: true };
  });

fns.submitFeedback = submitFeedback;
fns.listFeedback = listFeedback;
fns.updateFeedback = updateFeedback;
fns.myFeedback = myFeedback;
fns.myQueueCount = myQueueCount;
fns.myFeedbackUnread = myFeedbackUnread;
fns.markFeedbackSeen = markFeedbackSeen;
fns.replyFeedback = replyFeedback;

for (const n of [
  'listTopics', 'getTopic', 'roomPosts', 'roomAround', 'listDisputes', 'disputeCounts', 'createTopic', 'createPost', 'editPost', 'deletePost', 'adminTopic', 'dmStart', 'dmList', 'dmMessages', 'dmSend',
  'dmMarkRead', 'mentionsList', 'mentionsMarkRead', 'chatUnread', 'playerSearch', 'block', 'unblock', 'report', 'adminReports', 'adminResolveReport',
]) fns[n] = chat[n];

// The only functions callable without a session (they get user = null).
const PUBLIC_FNS = new Set(['submitFeedback', 'listTopics', 'getTopic', 'roomPosts', 'roomAround', 'listDisputes', 'disputeCounts', 'playerSearch']);

export const functions = new Hono();
functions.post('/:name', async (c) => {
  const name = c.req.param('name');
  const fn = Object.hasOwn(fns, name) ? fns[name] : null;
  if (!fn) throw new HttpError(404, 'Unknown function');
  const user = await getUser(c);
  if (!user && !PUBLIC_FNS.has(name)) throw new HttpError(401, 'Sign in required');
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
  let ctx;
  try {
    ctx = c.executionCtx;
  } catch {
    /* no ExecutionContext (tests): notification emails are awaited instead */
  }
  return c.json(await withCtx(ctx, () => fn({ env: c.env, user, request: c.req.raw }, body)));
});
