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
import * as guilds from './guilds.js';
import { avatarOwner, removeAvatar } from './uploads.js';
import { tierChange, PROVISIONAL } from './tiers.js';
import { decodeInternal, pub } from './schema.js';
import {
  START_RATING, REPEAT_WINDOW_DAYS, rateMatch, xpForMatch, levelForXp, validateGames, summarizeGames,
  RANK_SQL, DOUBLES_RANK_SQL, rankPlayers, ACTIVE_DAYS, meetingWeight, NOVELTY_DAYS, stakes, currentRd, RATING_FLOOR, challengePenalty, WALKOVER_XP, COOLDOWN_DAYS, WAIVER_DAYS, FATIGUE_DAYS,
  CHALLENGE_CAP_DAYS, CHALLENGES_RECEIVED_PER_WEEK, CHALLENGES_SENT_PER_WEEK, MATCHUP_DODGE_DAYS,
} from './rating.js';
import { assignMatchups, whyText, backoutCost, missCost, cappedStakes, softenLoss } from './matchmaking.js';
import { bountyFor, BOUNTY_CLAIM_DAYS, BOUNTY_RISE_DAYS } from './bounty.js';
import { weekdayDeadline, cleanTimeZone, DEFAULT_TZ, weekStartIso, weekEndIso } from './weekdays.js';
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
  // Doubles challenges (never penalised) don't count.
  const un = `(SELECT count(*) FROM challenges c WHERE c.defender_player_id = players.id AND c.status = 'expired' AND c.responded_at IS NULL AND c.reversed = 0
    AND c.format = 'singles')`;
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
/** Doubles: declining or ignoring it just closes it. */
const penaltyFree = (c) => c.format === 'doubles';
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
  return { meetings, recentPairMatch, defRecentMatches, direction: c.direction || 'up' };
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
    const facts = await penaltyFacts(env, c);
    const res = penaltyOf(kind, def, chal, gap, facts);
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
// A swapped challenge counts for nobody; a revoked one still counts as the challenger's send but not as anyone's receive.
const SENT_N = `(SELECT count(*) FROM challenges WHERE created_date > ? AND reversed = 0 AND matchup_id IS NULL AND revoke_kind IS NOT 'swapped' AND challenger_player_id = ?)`;
const RECEIVED_N = `(SELECT count(*) FROM challenges WHERE created_date > ? AND reversed = 0 AND matchup_id IS NULL AND revoke_kind IS NULL AND (defender_player_id = ? OR defender_partner_player_id = ?))`;
/** When a capped player gets a slot back: `dates` ascending; null while under `cap`. */
const freesAt = (dates, cap) =>
  (dates.length >= cap ? new Date(Date.parse(dates[dates.length - cap]) + CHALLENGE_CAP_DAYS * 86400000).toISOString() : null);
const times = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
/** Refuses when the challenger is out of sends or a defender is out of receives; returns the guards that keep it so at commit. */
async function capGuards(env, me, defenders) {
  const since = capSince();
  const sent = (await all(env, `SELECT created_date FROM challenges WHERE created_date > ? AND reversed = 0 AND matchup_id IS NULL AND revoke_kind IS NOT 'swapped' AND challenger_player_id = ? ORDER BY created_date`, since, me.id))
    .map((r) => r.created_date);
  const again = freesAt(sent, CHALLENGES_SENT_PER_WEEK);
  if (again) throw new HttpError(409, `You have sent ${CHALLENGES_SENT_PER_WEEK} challenges this week. You can send another after ${fmtUtc(again)}.`);
  const guards = [guard(env, `${SENT_N} < ?`, since, me.id, CHALLENGES_SENT_PER_WEEK)];
  for (const d of defenders) {
    const got = (await all(env,
      `SELECT created_date FROM challenges WHERE created_date > ? AND reversed = 0 AND matchup_id IS NULL AND revoke_kind IS NULL AND (defender_player_id = ? OR defender_partner_player_id = ?) ORDER BY created_date`,
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
  // Earlier VERIFIED same-format meetings in the last 180 days. For player P, a meeting is an earlier match
  // where P was opposite at least one of P's opponents in this match (singles: the same opponent).
  // Each counts 0.5 ^ (days ago / REPEAT_HALF_LIFE_DAYS) (meetingWeight): it fades as time passes.
  const prevRows = await all(env,
    `SELECT side_a, side_b, verified_at FROM matches WHERE status = 'verified' AND ranked = 1 AND format = ? AND id <> ? AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value IN (${placeholders(ids.length)}))`,
    fmt, excludeId, daysAgoIso(REPEAT_WINDOW_DAYS), ...ids);
  return partsFrom({ fmt, sides, paddleOf, now, players, prevRows });
}
/** ratingParts from rows already loaded (`prevRows` may hold extra matches: only meetings between these players count). */
function partsFrom({ fmt, sides, paddleOf, now, players, prevRows }) {
  const sideOf = (id) => (sides.a.includes(id) ? 'a' : 'b');
  const cut = Date.parse(now) - REPEAT_WINDOW_DAYS * 86400000;
  const prev = prevRows.filter((r) => Date.parse(r.verified_at) > cut).map((r) => {
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

/** Rating each player gained (net) in `fmt` over the last BOUNTY_RISE_DAYS of verified ranked matches. */
async function risesOf(env, fmt, ids, excludeId = '') {
  if (!ids.length) return {};
  const rows = await all(env,
    `SELECT rating_changes FROM matches WHERE status = 'verified' AND ranked = 1 AND format = ? AND id <> ? AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value IN (${placeholders(ids.length)}))`,
    fmt, excludeId, daysAgoIso(BOUNTY_RISE_DAYS), ...ids);
  return risesFrom(rows, ids);
}
function risesFrom(rows, ids) {
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const r of rows) for (const c of JSON.parse(r.rating_changes || '[]')) if (c.player_id in out) out[c.player_id] += c.delta || 0;
  return out;
}

/** "hunter:target" pairs whose bounty was claimed in the last BOUNTY_CLAIM_DAYS (format `fmt`), for these targets. */
async function claimedPairs(env, fmt, targetIds, excludeId = '') {
  if (!targetIds.length) return new Set();
  const rows = await all(env,
    `SELECT rating_changes FROM matches WHERE status = 'verified' AND ranked = 1 AND format = ? AND id <> ? AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value IN (${placeholders(targetIds.length)}))`,
    fmt, excludeId, daysAgoIso(BOUNTY_CLAIM_DAYS), ...targetIds);
  return claimedFrom(rows);
}
function claimedFrom(rows) {
  const claimed = new Set();
  for (const r of rows) for (const c of JSON.parse(r.rating_changes || '[]')) for (const b of c.bounties || []) claimed.add(`${c.player_id}:${b.from}`);
  return claimed;
}

const bountyState = (p, fmt, rises) => ({ id: p.id, rank: p[`${fmt}_rank`], streak: p[`${fmt}_win_streak`], rise: rises[p.id] || 0 });

/**
 * Bounty claims a verified ranked match pays: each winner collects bountyFor(winner, loser) for every loser (podium /
 * streak / riser, see bounty.js), full XP and the rating split across the winning side, unless that winner already
 * claimed that loser in the last BOUNTY_CLAIM_DAYS. Returns [{ from, from_name, to, rating, xp, parts }].
 */
async function bountyClaims(env, m, players, sideOf) {
  const fmt = m.format;
  const winners = players.filter((p) => sideOf(p.id) === m.winner_side);
  const losers = players.filter((p) => sideOf(p.id) !== m.winner_side);
  const rises = await risesOf(env, fmt, losers.map((p) => p.id), m.id);
  const claimed = await claimedPairs(env, fmt, losers.map((p) => p.id), m.id);
  return claimsFrom(fmt, winners, losers, rises, claimed);
}
function claimsFrom(fmt, winners, losers, rises, claimed) {
  const out = [];
  for (const l of losers) {
    for (const w of winners) {
      if (claimed.has(`${w.id}:${l.id}`)) continue;
      const b = bountyFor(bountyState(w, fmt, {}), bountyState(l, fmt, rises));
      if (!b) continue;
      out.push({ from: l.id, from_name: nameOf(l), to: w.id, rating: Math.round(b.rating / winners.length), xp: b.xp, parts: b.parts.map((x) => x.key) });
    }
  }
  return out;
}

/** Everything a page needs to show viewer-relative bounties: each player's 7-day rise per format and who you claimed. */
fns.bountyBoard = async ({ env, user }) => {
  const players = await all(env, 'SELECT id FROM players');
  const ids = players.map((p) => p.id);
  const me = user ? await getPlayerByUser(env, user.id) : null;
  const out = { rise: {}, claimed: {} };
  for (const fmt of ['singles', 'doubles']) {
    out.rise[fmt] = await risesOf(env, fmt, ids);
    out.claimed[fmt] = me ? [...await claimedPairs(env, fmt, ids)].filter((k) => k.startsWith(`${me.id}:`)).map((k) => k.split(':')[1]) : [];
  }
  return out;
};

/**
 * Loss factors for this week's matched game played through challenge `ch`: { player_id: f } for each owner who accepted
 * a matchup row pointing at it (f < 1 only). Empty when `ch` is not a matched challenge.
 */
async function matchedFactors(env, ch) {
  if (!ch || ch.format !== 'singles') return {};
  const rs = await all(env,
    `SELECT player_id, loss_factor FROM matchups WHERE challenge_id = ? AND said_yes_at IS NOT NULL AND settled_at IS NULL
       AND loss_factor IS NOT NULL AND loss_factor < 1`, ch.id);
  return Object.fromEntries(rs.map((r) => [r.player_id, r.loss_factor]));
}
/** Applies a matched-game loss factor to one stakes() entry (losses only; wins unchanged). */
function softenStakes(x, f) {
  const s = (v) => softenLoss(x.rating, v, f);
  x.lose = x.lose.map(s); x.narrow.lose = s(x.narrow.lose); x.dominant.lose = s(x.dominant.lose);
  x.lose_after = x.rating + x.lose[1];
  if (!x.placing) x.tier_lose = tierChange(x.rating, x.lose_after);
  x.loss_factor = f;
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
  const soften = await matchedFactors(env, ch);

  const rc = `${fmt}_rating`, wc = `${fmt}_wins`, lc = `${fmt}_losses`, gwc = `${fmt}_game_wins`, glc = `${fmt}_game_losses`, vc = `${fmt}_last_verified_at`, sc = `${fmt}_win_streak`, bc = `${fmt}_best_streak`;
  const rdc = `${fmt}_rd`, volc = `${fmt}_vol`, rdat = `${fmt}_rd_at`;
  const results = rateMatch(parts, m.winner_side, m.games, { target: m.target, challenge: !!ch });
  const claims = await bountyClaims(env, m, players, sideOf);
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
    // Bounties: collectors gain the rating the bountied player loses, plus bounty XP.
    const got = claims.filter((c) => c.to === p.id);
    const paid = claims.filter((c) => c.from === p.id);
    for (const c of got) xpRes.parts.push({ key: 'bounty', label: `bounty on ${c.from_name}`, xp: c.xp });
    const bountyDelta = got.reduce((t, c) => t + c.rating, 0) - paid.reduce((t, c) => t + c.rating, 0);
    if (bountyDelta) {
      res.after = Math.max(RATING_FLOOR, res.after + bountyDelta);
      res.delta = res.after - res.before;
    }
    // This week's matched game: the owner's loss is softened by the row's frozen factor (after everything else).
    const f = soften[p.id];
    let matched = null;
    if (f != null && !won && res.delta < 0) {
      const raw = res.delta;
      res.delta = softenLoss(res.before, res.delta, f);
      res.after = res.before + res.delta;
      matched = { loss_factor: f, unsoftened: raw };
    }
    const xpGain = xpRes.parts.reduce((t, x) => t + x.xp, 0);
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
      ...(res.close_loss ? { close_loss: res.close_loss } : null),
      ...(matched ? { matched } : null),
      ...(got.length ? { bounties: got.map((c) => ({ from: c.from, name: c.from_name, parts: c.parts, rating: c.rating, xp: c.xp })) } : null),
      ...(paid.length ? { bounty_paid: paid.reduce((t, c) => t + c.rating, 0) } : null),
      matches_played: p[wc] + p[lc] + 1, // in this format, including this match (placement badge)
      // Tier crossing (derived from rating); only once placed (5+ matches in this format before this one).
      ...(p[wc] + p[lc] >= PROVISIONAL ? tierChange(res.before, res.after) : null),
    });
  }
  stmts.push(...rankStmts(env)); // each format's rank SQL reads only its own columns; the other is a no-op
  if (fmt === 'singles') stmts.push(markPlayedStmt(env, m, now));
  if (ch) {
    stmts.push(guardRow(env, 'challenges', ch.id, ch.version, 'accepted'));
    stmts.push(stmt(env, `UPDATE challenges SET status = 'completed', updated_date = ?, version = version + 1 WHERE id = ?`, now, ch.id));
  }
  return { stmts, changes };
}

/** Folds bounty claims ({ a: [...], b: [...] } by winning side) into stakes() output, exactly as verification pays them. */
function withBounties(out, claims) {
  const sum = (cs) => cs.reduce((t, c) => t + c.rating, 0);
  for (const x of out) {
    const gets = claims[x.side].filter((c) => c.to === x.id);
    const pays = sum(claims[x.side === 'a' ? 'b' : 'a'].filter((c) => c.from === x.id));
    const bw = sum(gets);
    const lose = (v) => Math.max(RATING_FLOOR - x.rating, v - pays);
    if (bw) {
      x.win = x.win.map((v) => v + bw); x.narrow.win += bw; x.dominant.win += bw; x.win_after += bw;
      if (!x.placing) x.tier_win = tierChange(x.rating, x.win_after);
    }
    if (pays) {
      x.lose = x.lose.map(lose); x.narrow.lose = lose(x.narrow.lose); x.dominant.lose = lose(x.dominant.lose);
      x.lose_after = Math.max(RATING_FLOOR, x.rating + x.lose[1]);
      if (!x.placing) x.tier_lose = tierChange(x.rating, x.lose_after);
    }
    if (gets.length) x.bounty_win = { rating: bw, xp: gets.reduce((t, c) => t + c.xp, 0), from: gets.map((c) => c.from_name) };
    if (pays) x.bounty_risk = pays;
  }
  return out;
}

/**
 * "What's on the line": rating change for each player if their side wins / loses a typical 2-1 (STAKES_GAMES), plus
 * any tier crossing. Body: { match_id } (a pending match you are in) | { challenge_id } (an open/accepted challenge you
 * are in, singles or doubles, played as a challenge) | { format, target, side_a: [{ player_id, paddle }], side_b } (Record a match).
 */
fns.matchStakes = async ({ env, user }, body) => {
  const me = await requirePlayer(env, user);
  const now = nowIso();
  let fmt, target, sides, paddles = {}, challenge = false, match = null, matchedCh = null;
  if (body.match_id != null) {
    if (!isStr(body.match_id)) throw bad('Missing match.');
    const m = await getMatch(env, body.match_id);
    if (!m) throw new HttpError(404, 'Match not found.');
    if (!m.all_user_ids.includes(user.id)) throw new HttpError(403, 'Only players in this match can see this.');
    fmt = m.format; target = m.target; match = m;
    sides = { a: m.side_a.map((e) => e.player_id), b: m.side_b.map((e) => e.player_id) };
    for (const e of [...m.side_a, ...m.side_b]) paddles[e.player_id] = e.paddle;
    matchedCh = await challengeFor(env, fmt, sides, m.created_date, now);
    challenge = !!matchedCh;
  } else if (body.challenge_id != null) {
    if (!isStr(body.challenge_id)) throw bad('Missing challenge.');
    const c = await getChallenge(env, body.challenge_id);
    if (!c) throw new HttpError(404, 'Challenge not found.');
    const users = [c.challenger_user_id, c.defender_user_id, c.challenger_partner_user_id, c.defender_partner_user_id];
    if (!users.includes(user.id)) throw new HttpError(403, 'Only players in this challenge can see this.');
    target = 11; challenge = true; matchedCh = c;
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
    matchedCh = await challengeFor(env, fmt, sides, now, now);
    challenge = !!matchedCh;
  }
  const { players, parts, sideOf } = await ratingParts(env, { fmt, sides, paddleOf: (id) => paddles[id] || 'default', now });
  const bySide = { a: parts.filter((p) => p.side === 'a'), b: parts.filter((p) => p.side === 'b') };
  const out = stakes({ format: fmt, target, sides: bySide, paddles, challenge }, tierChange);
  // Bounties ride on top of the match result, exactly as verification pays them (ranked only).
  const ranked = match ? match.ranked !== false : body.ranked !== false;
  const claims = { a: [], b: [] };
  if (ranked) for (const w of ['a', 'b']) claims[w] = await bountyClaims(env, { format: fmt, id: match?.id || '', winner_side: w }, players, sideOf);
  withBounties(out, claims);
  const soften = await matchedFactors(env, matchedCh);
  for (const x of out) if (soften[x.id] != null) softenStakes(x, soften[x.id]);
  const sum = (cs) => cs.reduce((t, c) => t + c.rating, 0);
  const nameById = Object.fromEntries(players.map((p) => [p.id, nameOf(p)]));
  // A pending match already has its scores: also say exactly what confirming it does (same rules verification uses).
  const actual = match && ranked
    ? Object.fromEntries(rateMatch(parts.map((p) => ({ ...p, paddle: paddles[p.id] || 'default' })), match.winner_side, match.games,
      { target, challenge }).map((r) => {
        const cs = claims[match.winner_side];
        const after0 = Math.max(RATING_FLOOR, r.after + sum(cs.filter((c) => c.to === r.id)) - sum(cs.filter((c) => c.from === r.id)));
        const delta = sideOf(r.id) === match.winner_side ? after0 - r.before : softenLoss(r.before, after0 - r.before, soften[r.id]);
        return [r.id, { ...r, after: r.before + delta, delta }];
      }))
    : null;
  return {
    format: fmt, target, challenge, ranked, assumed: 'a narrow 2-1 (11-9, 9-11, 11-9) up to a dominant 2-0 (11-4, 11-5)',
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

/** INSERT for a singles challenge me -> def. Direction: 'down' when the challenger is rated above. matchupId = sent from a matchup. */
function insertSinglesChallenge(env, { id, me, def, message, now, matchupId = null }) {
  return stmt(env,
    `INSERT INTO challenges (id, challenger_user_id, challenger_player_id, challenger_name, challenger_rank, defender_user_id,
       defender_player_id, defender_name, defender_rank, message, status, expires_at, created_date, updated_date, created_by_id,
       format, direction, all_user_ids, all_player_ids, matchup_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,'open',?,?,?,?,'singles',?,?,?,?)`,
    id, me.user_id, me.id, nameOf(me), me.singles_rank, def.user_id, def.id, nameOf(def), def.singles_rank, message,
    weekdayDeadline(Date.parse(now), CHALLENGE_MS, [me.timezone, def.timezone]), now, now, me.user_id,
    me.singles_rating > def.singles_rating ? 'down' : 'up', J([me.user_id, def.user_id]), J([me.id, def.id]), matchupId);
}

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
    // Anyone on the ladder; 'down' (challenger rated above) is free to decline, see challengePenalty.
    const cool = await first(env,
      `SELECT penalized_at FROM challenges WHERE challenger_player_id = ? AND defender_player_id = ? AND penalized_at > ? AND reversed = 0
         ORDER BY penalized_at DESC LIMIT 1`, me.id, def.id, daysAgoIso(COOLDOWN_DAYS));
    if (cool) {
      const retry = new Date(Date.parse(cool.penalized_at) + COOLDOWN_DAYS * 86400000).toISOString();
      throw new HttpError(409, `You challenged ${nameOf(def)} recently. You can challenge them again after ${fmtUtc(retry)}.`);
    }
    if (await first(env, `SELECT 1 AS x FROM challenges WHERE challenger_user_id = ? AND format = 'singles' AND matchup_id IS NULL AND status IN ('open','accepted') LIMIT 1`, user.id)) {
      throw new HttpError(409, 'You already have an active challenge.');
    }
    const caps = await capGuards(env, me, [def]);
    const id = uuid();
    const now = nowIso();
    await commit(env, [
      guardLadder(env, lv),
      guard(env, `NOT EXISTS (SELECT 1 FROM challenges WHERE challenger_user_id = ? AND format = 'singles' AND matchup_id IS NULL AND status IN ('open','accepted'))`, user.id),
      ...caps,
      insertSinglesChallenge(env, { id, me, def, message, now }),
      touch(env, me.id, now),
    ]);
    await notify(env, 'challenge_received', { challenge_id: id, actor_user_id: user.id });
    return { challenge: pub('Challenge', await getChallenge(env, id)) };
  });

/**
 * What taking back your own regular singles challenge `c` would cost you: the same as ducking that player (you as the
 * defender, them as the challenger; half when they are rated above you), waived if you played them this week.
 */
async function revokeCost(env, c, me, def) {
  const ranks = rankPlayers(await rankRows(env), activeCut());
  const gap = ranks[me.id] != null && ranks[def.id] != null ? Math.abs(ranks[me.id] - ranks[def.id]) : 1;
  const facts = await penaltyFacts(env, c);
  return penaltyOf('declined', me, def, gap, { ...facts, direction: def.singles_rating > me.singles_rating ? 'down' : 'up' });
}

async function ownLiveChallenge(env, user, id) {
  if (!isStr(id)) throw bad('Missing challenge.');
  const c = await getChallenge(env, id);
  if (!c) throw new HttpError(404, 'Challenge not found.');
  if (c.challenger_user_id !== user.id) throw new HttpError(403, 'Only the player who sent a challenge can take it back.');
  if (c.matchup_id) throw bad("This is your weekly match: use Back out on the match card.");
  if (c.status !== 'open' && c.status !== 'accepted') throw bad('This challenge is no longer live.');
  return c;
}

/** Cost preview for the Revoke dialog: { revoke: { penalty, reason }, can_swap }. */
fns.revokeQuote = async ({ env, user }, body) => {
  const c = await ownLiveChallenge(env, user, body.challenge_id);
  if (c.format === 'doubles') return { revoke: { penalty: 0, reason: 'doubles' }, can_swap: false };
  const [me, def] = [(await getPlayers(env, [c.challenger_player_id]))[0], (await getPlayers(env, [c.defender_player_id]))[0]];
  if (!me || !def) return { revoke: { penalty: 0, reason: 'gone' }, can_swap: c.status === 'open' };
  const r = await revokeCost(env, c, me, def);
  return { revoke: { penalty: r.penalty, reason: r.reason }, can_swap: c.status === 'open' };
};

/**
 * Take back a challenge you sent. { challenge_id, swap_to_player_id?, message? }.
 * swap_to_player_id: send it to that player instead (open challenges only): free, and the old one counts toward nobody's
 * weekly caps. Without it: revoked for good, costing you what ducking them would (doubles: always free).
 */
fns.revokeChallenge = ({ env, user }, body) =>
  retrying(async () => {
    const c = await ownLiveChallenge(env, user, body.challenge_id);
    const now = nowIso();
    const close = (kind, penalty, swappedTo = null) =>
      stmt(env, `UPDATE challenges SET status = 'cancelled', revoke_kind = ?, revoke_penalty = ?, revoked_at = ?, swapped_to_id = ?,
        updated_date = ?, version = version + 1 WHERE id = ?`, kind, penalty, now, swappedTo, now, c.id);
    if (c.format === 'doubles') {
      await commit(env, [guardRow(env, 'challenges', c.id, c.version, c.status), close('revoked', 0)]);
      return { challenge: pub('Challenge', await getChallenge(env, c.id)) };
    }
    const lv = await ladderVersion(env);
    const me = await requirePlayer(env, user);
    if (body.swap_to_player_id != null) {
      if (c.status !== 'open') throw bad('They already accepted. You can only swap a challenge nobody has answered yet.');
      if (!isStr(body.swap_to_player_id)) throw bad('Pick a player to challenge.');
      if (body.swap_to_player_id === me.id) throw bad('You cannot challenge yourself.');
      if (body.swap_to_player_id === c.defender_player_id) throw bad('Pick someone else to swap to.');
      const def = (await getPlayers(env, [body.swap_to_player_id]))[0];
      if (!def) throw new HttpError(404, 'That player does not exist.');
      if (me.singles_rank == null || def.singles_rank == null) throw bad('Both players need a ladder position.');
      const cool = await first(env,
        `SELECT penalized_at FROM challenges WHERE challenger_player_id = ? AND defender_player_id = ? AND penalized_at > ? AND reversed = 0
           ORDER BY penalized_at DESC LIMIT 1`, me.id, def.id, daysAgoIso(COOLDOWN_DAYS));
      if (cool) throw new HttpError(409, `You challenged ${nameOf(def)} recently. You can challenge them again after ${fmtUtc(new Date(Date.parse(cool.penalized_at) + COOLDOWN_DAYS * 86400000).toISOString())}.`);
      const since = capSince();
      const got = (await first(env, `SELECT ${RECEIVED_N} AS n`, since, def.id, def.id)).n;
      if (got >= CHALLENGES_RECEIVED_PER_WEEK) throw new HttpError(409, `${nameOf(def)} has already been challenged ${times(CHALLENGES_RECEIVED_PER_WEEK)} this week.`);
      const id = uuid();
      await commit(env, [
        guardLadder(env, lv),
        guardRow(env, 'challenges', c.id, c.version, 'open'),
        guard(env, `${RECEIVED_N} < ?`, since, def.id, def.id, CHALLENGES_RECEIVED_PER_WEEK),
        close('swapped', 0, id),
        insertSinglesChallenge(env, { id, me, def, message: body.message != null ? cleanMessage(body.message) : c.message || '', now }),
        touch(env, me.id, now),
      ]);
      await notify(env, 'challenge_received', { challenge_id: id, actor_user_id: user.id });
      return { challenge: pub('Challenge', await getChallenge(env, id)), swapped_from: c.id };
    }
    const def = (await getPlayers(env, [c.defender_player_id]))[0];
    const cost = def ? await revokeCost(env, c, me, def) : { penalty: 0 };
    const p = Math.max(0, Math.min(cost.penalty, me.singles_rating - RATING_FLOOR));
    const stmts = [guardLadder(env, lv), guardRow(env, 'challenges', c.id, c.version, c.status), guardRow(env, 'players', me.id, me.version), close('revoked', p)];
    if (p > 0) {
      stmts.push(stmt(env, 'UPDATE players SET singles_rating = singles_rating - ?, updated_date = ?, version = version + 1 WHERE id = ?', p, now, me.id));
      stmts.push(...rankStmts(env));
    }
    await commit(env, stmts);
    return { challenge: pub('Challenge', await getChallenge(env, c.id)), penalty: p };
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
  await notify(env, 'challenge_received', { challenge_id: id, actor_user_id: user.id });
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
  const after = await getChallenge(env, c.id);
  return { challenge: pub('Challenge', after) };
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
    const free = { penalty: 0, reason: 'doubles', drops_rank: false, rank_after: c.defender_rank, challenger_gain: 0 };
    return { decline: free, expire: free };
  }
  const [def, chal] = await Promise.all([getPlayers(env, [c.defender_player_id]), getPlayers(env, [c.challenger_player_id])]).then((r) => [r[0][0], r[1][0]]);
  if (!def || !chal) throw new HttpError(404, 'Player not found.');
  return duckCosts(env, c, def, chal);
};

/** Before sending a singles challenge: what declining / ignoring it would cost `defender_player_id` (and pay you), and its direction. */
fns.challengeQuote = async ({ env, user }, body) => {
  if (!isStr(body.defender_player_id)) throw bad('Pick a player to challenge.');
  const me = await requirePlayer(env, user);
  const def = (await getPlayers(env, [body.defender_player_id]))[0];
  if (!def) throw new HttpError(404, 'That player does not exist.');
  if (def.id === me.id) throw bad('You cannot challenge yourself.');
  const direction = me.singles_rating > def.singles_rating ? 'down' : 'up';
  const c = { id: '', challenger_player_id: me.id, defender_player_id: def.id, direction };
  return { direction, ...(await duckCosts(env, c, def, me)) };
};

/** { decline, expire }: { penalty, reason, drops_rank, rank_after, challenger_gain } for singles challenge `c` (real or quoted). */
async function duckCosts(env, c, def, chal) {
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
}

/**
 * Weekly allowance for the signed-in player (both formats): sends left, when the next send frees up, and which players
 * are at their weekly receive limit ({ player_id: when they free up }). Plus the caps for the UI.
 */
fns.challengeLimits = async ({ env, user }) => {
  const me = await getPlayerByUser(env, user.id);
  const rows = await all(env,
    `SELECT challenger_player_id, defender_player_id, defender_partner_player_id, created_date, revoke_kind FROM challenges
       WHERE created_date > ? AND reversed = 0 AND matchup_id IS NULL ORDER BY created_date`, capSince());
  const sent = me ? rows.filter((r) => r.challenger_player_id === me.id && r.revoke_kind !== 'swapped').map((r) => r.created_date) : [];
  const got = {};
  for (const r of rows) if (!r.revoke_kind) for (const d of [r.defender_player_id, r.defender_partner_player_id]) if (d) (got[d] ||= []).push(r.created_date);
  const atLimit = {};
  for (const [id, ds] of Object.entries(got)) {
    const until = freesAt(ds, CHALLENGES_RECEIVED_PER_WEEK);
    if (until) atLimit[id] = until;
  }
  return {
    sent: sent.length, sent_cap: CHALLENGES_SENT_PER_WEEK, sends_left: Math.max(0, CHALLENGES_SENT_PER_WEEK - sent.length),
    send_again_at: freesAt(sent, CHALLENGES_SENT_PER_WEEK), received_cap: CHALLENGES_RECEIVED_PER_WEEK, at_limit: atLimit,
    window_days: CHALLENGE_CAP_DAYS,
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

// ---------- weekly matchmaking ("This week's match", singles only) ----------
// Rules: src/matchmaking.js (pure) + MATCHUP_* in rating.js. One row per (week, player who OWES the match); the
// opponent is that player's best pair score, so many players may pick the same opponent. The opponent is a MYSTERY to
// the owner (and to everyone else) until the owner accepts: only the max win / max loss (frozen at generation, the loss
// capped under the win) and the deadline show. "Accept" reveals them and sends a regular singles challenge (marked
// matchup_id; it skips the caps, the one-active rule and the cooldown); the opponent answers it like any challenge.
// "Decline" costs the max loss right away. If the owner loses the matched game, their loss is scaled by loss_factor.
// Week end (settleMatchups, from runSyncLadder): played = a verified ranked singles match between the pair recorded
// during the week. Otherwise the owner pays their max loss unless they accepted and the opponent then declined /
// ignored it (or never answered by week end).
const SINGLES_RANKED = `status = 'verified' AND ranked = 1 AND format = 'singles'`;
const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
const thisWeek = () => {
  const start = weekStartIso();
  return { start, end: weekEndIso(start) };
};
const myRow = (env, week, playerId) => first(env, 'SELECT * FROM matchups WHERE week_start = ? AND player_id = ?', week, playerId);

/** A verified ranked singles match between the pair marks every unsettled matchup of theirs whose week it was recorded in. */
const markPlayedStmt = (env, m, now) => {
  const [x, y] = [m.side_a[0].player_id, m.side_b[0].player_id];
  return stmt(env,
    `UPDATE matchups SET status = 'played', match_id = ?, settled_at = ?, updated_date = ?, version = version + 1
       WHERE settled_at IS NULL AND week_start <= ? AND week_end > ?
         AND ((player_id = ? AND opponent_player_id = ?) OR (player_id = ? AND opponent_player_id = ?))`,
    m.id, now, now, m.created_date, m.created_date, x, y, y, x);
};

/** Bulk inputs for singles quotes (a handful of queries for any number of pairs): players, recent meetings, bounty state. */
async function quoteCtx(env, now, ids = null) {
  const days = Math.max(REPEAT_WINDOW_DAYS, BOUNTY_CLAIM_DAYS, BOUNTY_RISE_DAYS);
  const inIds = ids ? ` AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value IN (${placeholders(ids.length)}))` : '';
  const players = ids ? await getPlayers(env, ids) : await all(env, 'SELECT * FROM players');
  const rows = await all(env, `SELECT side_a, side_b, verified_at, rating_changes FROM matches WHERE ${SINGLES_RANKED} AND verified_at > ?${inIds}`,
    daysAgoIso(days), ...(ids || []));
  const since = (d) => rows.filter((r) => r.verified_at > daysAgoIso(d));
  return {
    now, rows, byId: Object.fromEntries(players.map((p) => [p.id, p])),
    rises: risesFrom(since(BOUNTY_RISE_DAYS), players.map((p) => p.id)), claimed: claimedFrom(since(BOUNTY_CLAIM_DAYS)),
  };
}
/**
 * The owner's best case and worst case against `oppId`, played as a challenge: max_win = the best win (a dominant 2-0),
 * max_loss = the size of the worst loss (a dominant 0-2), bounties included, exactly as matchStakes shows them.
 */
function quoteOf(ctx, ownerId, oppId) {
  const a = ctx.byId[ownerId], b = ctx.byId[oppId];
  if (!a || !b) return { max_win: 0, max_loss: 0 };
  const sides = { a: [a.id], b: [b.id] };
  const { parts } = partsFrom({ fmt: 'singles', sides, paddleOf: () => 'default', now: ctx.now, players: [a, b], prevRows: ctx.rows });
  const out = stakes({ format: 'singles', target: 11, sides: { a: [parts[0]], b: [parts[1]] }, challenge: true }, tierChange);
  const claims = { a: claimsFrom('singles', [a], [b], ctx.rises, ctx.claimed), b: claimsFrom('singles', [b], [a], ctx.rises, ctx.claimed) };
  const me = withBounties(out, claims).find((x) => x.id === a.id);
  return { max_win: me.win[1], max_loss: Math.max(0, -me.lose[1]) };
}

/** The frozen matched-game stakes for owner vs opp: the raw quote plus the capped max loss and its loss factor. */
const matchupQuote = (ctx, ownerId, oppId) => {
  const raw = quoteOf(ctx, ownerId, oppId);
  return { raw, ...cappedStakes(raw) };
};
/** Has the owner seen who they got? Accepted, or the pair already played it. Until then the opponent is a mystery. */
const revealed = (m) => !!m.said_yes_at || m.status === 'played';

/** Where a matchup stands: settled status, else open | waiting (challenge sent) | accepted | unplayed (window ran out) | cleared. */
function matchupState(m, ch) {
  if (m.settled_at) return m.status;
  if (!m.said_yes_at) return 'open';
  if (!ch || ch.status === 'cancelled') return 'cleared';
  const sent = ch.challenger_player_id === m.player_id;
  if (sent && (ch.status === 'declined' || (ch.status === 'expired' && !ch.responded_at))) return 'cleared';
  if (ch.status === 'open') return 'waiting';
  if (ch.status === 'accepted' || ch.status === 'completed') return 'accepted';
  return 'unplayed';
}

/**
 * Generates this week's matchups once (lazily from any matchup call, and from runSyncLadder / cron). Race-safe: the
 * matchup_weeks insert leads the batch, so a concurrent second generation fails on its PRIMARY KEY and rolls back whole.
 * Emails each new row's owner (matchup_assigned), only from the call that inserted it. Returns the number of rows created.
 */
export async function ensureMatchupWeek(env) {
  const { start: week, end } = thisWeek();
  const ids = await retrying(async () => {
    if (await first(env, 'SELECT 1 AS x FROM matchup_weeks WHERE week_start = ?', week)) return [];
    const now = nowIso();
    const pool = await all(env, 'SELECT id, user_id, singles_rank FROM players WHERE singles_rank IS NOT NULL ORDER BY singles_rank, id');
    const last = {};
    for (const r of await all(env,
      `SELECT json_extract(side_a, '$[0].player_id') AS a, json_extract(side_b, '$[0].player_id') AS b, max(verified_at) AS at
         FROM matches WHERE ${SINGLES_RANKED} GROUP BY a, b`)) {
      const k = pairKey(r.a, r.b);
      if (!last[k] || r.at > last[k]) last[k] = r.at;
    }
    const ducked = {}; // "x>y": x ducked a singles challenge from y
    for (const r of await all(env,
      `SELECT challenger_player_id AS c, defender_player_id AS d, count(*) AS n FROM challenges
         WHERE format = 'singles' AND reversed = 0 AND created_date > ? AND (status = 'declined' OR (status = 'expired' AND responded_at IS NULL))
         GROUP BY c, d`, daysAgoIso(MATCHUP_DODGE_DAYS))) ducked[`${r.d}>${r.c}`] = r.n;
    const prevWeek = weekStartIso(Date.parse(week) - 3.5 * 86400000);
    const lastPick = Object.fromEntries((await all(env, 'SELECT player_id, opponent_player_id FROM matchups WHERE week_start = ?', prevWeek))
      .map((r) => [r.player_id, r.opponent_player_id]));
    const nowMs = Date.parse(now);
    const factsOf = (a, b) => {
      const at = last[pairKey(a, b)];
      return {
        lastDays: at ? Math.floor((nowMs - Date.parse(at)) / 86400000) : null,
        dodges: (ducked[`${b}>${a}`] || 0) + (ducked[`${a}>${b}`] || 0), repeat: lastPick[a] === b,
      };
    };
    const picks = assignMatchups(week, pool.map((p) => ({ id: p.id, rank: p.singles_rank })), factsOf);
    const ctx = picks.length ? await quoteCtx(env, now) : null;
    const byId = Object.fromEntries(pool.map((p) => [p.id, p]));
    const rows = picks.map((x) => {
      const f = factsOf(x.player, x.opponent);
      return { id: uuid(), ...x, f, q: matchupQuote(ctx, x.player, x.opponent) };
    });
    await commit(env, [
      stmt(env, 'INSERT INTO matchup_weeks (week_start, week_end, players, created_date) VALUES (?,?,?,?)', week, end, pool.length, now),
      ...rows.map((r) => stmt(env,
        `INSERT INTO matchups (id, week_start, week_end, player_id, user_id, opponent_player_id, opponent_user_id, score, never_played,
           last_played_days, dodged_by_them, dodged_by_me, opponent_rank, quote_win, quote_loss, max_win, max_loss, loss_factor,
           created_date, updated_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        r.id, week, end, r.player, byId[r.player].user_id, r.opponent, byId[r.opponent].user_id, r.score, r.f.lastDays == null ? 1 : 0,
        r.f.lastDays, ducked[`${r.opponent}>${r.player}`] || 0, ducked[`${r.player}>${r.opponent}`] || 0, byId[r.opponent].singles_rank,
        r.q.raw.max_win, r.q.raw.max_loss, r.q.max_win, r.q.max_loss, r.q.loss_factor, now, now)),
    ]);
    return rows.map((r) => r.id);
  });
  if (ids.length) await notify(env, 'matchup_assigned', { matchup_ids: ids });
  return ids.length;
}

/**
 * Rating hits ([{ key, player_id, cost: (rating) => points }]) applied in order to fresh player rows, with the rank before
 * and after each. Returns { guards, stmts (player updates + rank recompute), res: { key: { penalty, before, after } } }.
 */
async function ratingHits(env, hits, lv) {
  const roster = await rankRows(env);
  const byId = Object.fromEntries(roster.map((r) => [r.id, r]));
  const ids = [...new Set(hits.map((h) => h.player_id))];
  const pl = Object.fromEntries((ids.length ? await getPlayers(env, ids) : []).map((p) => [p.id, { ...p }]));
  const guards = [guardLadder(env, lv), ...Object.values(pl).map((p) => guardRow(env, 'players', p.id, p.version))];
  const res = {};
  const dirty = new Set();
  for (const h of hits) {
    const p = pl[h.player_id];
    if (!p) {
      res[h.key] = { penalty: 0, before: null, after: null };
      continue;
    }
    const before = rankPlayers(roster, activeCut())[p.id] ?? null;
    const penalty = h.cost(p.singles_rating);
    if (penalty > 0) {
      p.singles_rating -= penalty; dirty.add(p.id);
      if (byId[p.id]) byId[p.id].rating = p.singles_rating;
    }
    res[h.key] = { penalty, before, after: rankPlayers(roster, activeCut())[p.id] ?? null };
  }
  const now = nowIso();
  const stmts = [...dirty].map((id) => stmt(env, 'UPDATE players SET singles_rating = ?, updated_date = ?, version = version + 1 WHERE id = ?',
    pl[id].singles_rating, now, id));
  if (dirty.size) stmts.push(...rankStmts(env));
  return { guards, stmts, res };
}
const penaltyCols = `status = ?, penalty_rating = ?, penalty_reason = ?, penalty_rank_before = ?, penalty_rank_after = ?, settled_at = ?,
  updated_date = ?, version = version + 1`;

/**
 * Week-end processing for every unsettled matchup whose week is over (idempotent: each row is guarded on its version and
 * settled once). A pending result between the pair recorded that week holds the row until it resolves.
 */
async function settleMatchups(env) {
  return retrying(async () => {
    const now = nowIso();
    const due = await all(env, 'SELECT * FROM matchups WHERE settled_at IS NULL AND week_end <= ? ORDER BY week_end, id LIMIT 100', now);
    if (!due.length) return 0;
    const lv = await ladderVersion(env);
    const chIds = due.map((m) => m.challenge_id).filter(Boolean);
    const chs = Object.fromEntries((chIds.length ? await all(env, `SELECT * FROM challenges WHERE id IN (${placeholders(chIds.length)})`, ...chIds) : [])
      .map((c) => [c.id, c]));
    const from = due.reduce((t, m) => (m.week_start < t ? m.week_start : t), due[0].week_start);
    const to = due.reduce((t, m) => (m.week_end > t ? m.week_end : t), due[0].week_end);
    const ms = (await all(env,
      `SELECT id, status, created_date, all_player_ids FROM matches WHERE format = 'singles' AND ranked = 1 AND status IN ('verified','pending')
         AND created_date >= ? AND created_date < ? ORDER BY created_date`, from, to))
      .map((m) => ({ ...m, ids: JSON.parse(m.all_player_ids) }));
    const plan = [];
    for (const m of due) {
      const between = ms.filter((x) => x.ids.includes(m.player_id) && x.ids.includes(m.opponent_player_id)
        && x.created_date >= m.week_start && x.created_date < m.week_end);
      const played = between.find((x) => x.status === 'verified');
      if (played) plan.push({ m, played });
      else if (between.length) continue; // a result is waiting for sign-off: settle once it resolves
      else {
        const state = matchupState(m, chs[m.challenge_id]);
        plan.push({ m, state, owes: state === 'open' || state === 'accepted' || state === 'unplayed' });
      }
    }
    if (!plan.length) return 0;
    const fresh = plan.filter((x) => x.owes && x.m.max_loss == null); // rows always carry it; legacy safety net
    const ctx = fresh.length ? await quoteCtx(env, now, [...new Set(fresh.flatMap((x) => [x.m.player_id, x.m.opponent_player_id]))]) : null;
    const loss = (m) => (m.max_loss != null ? m.max_loss : matchupQuote(ctx, m.player_id, m.opponent_player_id).max_loss);
    const hits = plan.filter((x) => x.owes).map((x) => ({ key: x.m.id, player_id: x.m.player_id, cost: (r) => missCost(loss(x.m), r) }));
    const rh = await ratingHits(env, hits, lv);
    const stmts = [...rh.guards];
    for (const x of plan) {
      stmts.push(guardRow(env, 'matchups', x.m.id, x.m.version));
      if (x.played) {
        stmts.push(stmt(env, `UPDATE matchups SET status = 'played', match_id = ?, settled_at = ?, updated_date = ?, version = version + 1 WHERE id = ?`,
          x.played.id, now, now, x.m.id));
      } else if (x.owes) {
        const r = rh.res[x.m.id];
        stmts.push(stmt(env, `UPDATE matchups SET max_loss = COALESCE(max_loss, ?), ${penaltyCols} WHERE id = ?`,
          loss(x.m), 'missed', r.penalty, 'missed_match', r.before, r.after, now, now, x.m.id));
      } else {
        stmts.push(stmt(env, `UPDATE matchups SET status = 'cleared', settled_at = ?, updated_date = ?, version = version + 1 WHERE id = ?`, now, now, x.m.id));
      }
    }
    stmts.push(...rh.stmts);
    await commit(env, stmts);
    return plan.length;
  });
}

/**
 * This week's matchmaking for player `me`: their matchup and who was matched with them. Until `me` accepts, the matchup
 * is a mystery: no opponent, no why-them, no challenge, only the frozen max win / max loss, costs and the deadline.
 * "Matched with you" lists only owners who have accepted (an un-accepted owner's pick must not leak to its target).
 */
async function matchupView(env, me) {
  const { start, end } = thisWeek();
  const weekRow = await first(env, 'SELECT * FROM matchup_weeks WHERE week_start = ?', start);
  const mine = await myRow(env, start, me.id);
  const incoming = (await all(env, 'SELECT * FROM matchups WHERE week_start = ? AND opponent_player_id = ? ORDER BY created_date, id', start, me.id))
    .filter(revealed);
  const shown = mine && revealed(mine) ? mine : null;
  const rows = [shown, ...incoming].filter(Boolean);
  const chIds = rows.map((r) => r.challenge_id).filter(Boolean);
  const chs = Object.fromEntries((chIds.length ? await all(env, `SELECT * FROM challenges WHERE id IN (${placeholders(chIds.length)})`, ...chIds) : [])
    .map((c) => [c.id, c]));
  const pids = [...new Set(rows.flatMap((r) => [r.player_id, r.opponent_player_id]))];
  const ps = Object.fromEntries((pids.length ? await getPlayers(env, pids) : []).map((p) => [p.id, p]));
  let matchup = null;
  if (mine) {
    const ch = shown ? chs[mine.challenge_id] || null : null;
    const base = {
      id: mine.id, status: matchupState(mine, ch), mystery: !shown, max_win: mine.max_win, max_loss: mine.max_loss,
      loss_factor: mine.loss_factor, backout_cost: backoutCost(mine.max_loss, me.singles_rating),
      miss_cost: missCost(mine.max_loss, me.singles_rating), decline_cost: missCost(mine.max_loss, me.singles_rating),
      said_yes_at: mine.said_yes_at, penalty_rating: mine.penalty_rating, penalty_reason: mine.penalty_reason, frozen: true,
    };
    matchup = shown
      ? {
        ...base, opponent: pub('Player', ps[mine.opponent_player_id]), why: whyText(mine), challenge: pub('Challenge', ch),
        match_id: mine.match_id, mutual: incoming.some((r) => r.player_id === mine.opponent_player_id),
      }
      : { ...base, opponent: null, why: null, challenge: null, match_id: null, mutual: false };
  }
  return {
    week_start: start, week_end: end, deadline: end, ranked: me.singles_rank != null, generated: !!weekRow,
    bye: !mine && !!weekRow && me.singles_rank != null, reason: mine ? null : me.singles_rank == null ? 'unranked' : !weekRow ? 'pending' : weekRow.players < 2 ? 'alone' : 'late',
    matchup,
    incoming: incoming.map((r) => ({
      id: r.id, status: matchupState(r, chs[r.challenge_id]), player: pub('Player', ps[r.player_id]), challenge: pub('Challenge', chs[r.challenge_id] || null),
    })),
  };
}

fns.myMatchup = async ({ env, user }) => {
  const me = await requirePlayer(env, user);
  await ensureMatchupWeek(env);
  return matchupView(env, me);
};

/**
 * Everyone's matchups this week (public): who owes a match and where it stands. An un-accepted row is a mystery: no
 * opponent (id, name or rank), and it is not ordered by its opponent either (revealed rows first, by opponent rank).
 */
fns.listMatchups = async ({ env }) => {
  await ensureMatchupWeek(env);
  const { start, end } = thisWeek();
  const rows = await all(env,
    `SELECT m.*, c.status AS ch_status, c.challenger_player_id AS ch_challenger, c.responded_at AS ch_responded,
            p.display_name AS p_display, p.username AS p_user, o.display_name AS o_display, o.username AS o_user, o.singles_rank AS o_rank
       FROM matchups m LEFT JOIN challenges c ON c.id = m.challenge_id
       LEFT JOIN players p ON p.id = m.player_id LEFT JOIN players o ON o.id = m.opponent_player_id
       WHERE m.week_start = ? ORDER BY m.created_date, m.id`, start);
  const items = rows.map((r) => {
    const shown = revealed(r);
    return {
      id: r.id, player_id: r.player_id, player_name: r.p_display || r.p_user, mystery: !shown,
      opponent_player_id: shown ? r.opponent_player_id : null, opponent_name: shown ? r.o_display || r.o_user : null,
      opponent_rank: shown ? r.o_rank : null,
      status: matchupState(r, shown && r.challenge_id && r.ch_status ? { status: r.ch_status, challenger_player_id: r.ch_challenger, responded_at: r.ch_responded } : null),
    };
  });
  const order = (x) => (x.mystery ? 2e9 : x.opponent_rank ?? 1e9);
  items.sort((x, y) => order(x) - order(y) || String(x.player_name).localeCompare(String(y.player_name)) || x.id.localeCompare(y.id));
  return { week_start: start, week_end: end, items };
};

/**
 * "Accept": the owner commits to this week's mystery match. Reveals the opponent (the stakes were frozen at generation)
 * and sends the challenge: a live singles challenge between the pair is reused (one from the opponent is accepted),
 * otherwise a new matched challenge goes out. Backing out afterwards costs 2x the max loss.
 */
fns.matchupYes = async ({ env, user }) => {
  await requirePlayer(env, user);
  await ensureMatchupWeek(env);
  return retrying(async () => {
    const me = await requirePlayer(env, user);
    const { start } = thisWeek();
    const m = await myRow(env, start, me.id);
    if (!m) throw bad('You have no match this week.');
    if (m.settled_at) throw bad("This week's match is already settled.");
    if (m.status !== 'open') throw bad('You already accepted this match.');
    const now = nowIso();
    if (m.week_end <= now) throw bad('This week is over.');
    const opp = (await getPlayers(env, [m.opponent_player_id]))[0];
    if (!opp) throw new HttpError(409, 'Your opponent is no longer on the ladder.');
    const live = await first(env,
      `SELECT * FROM challenges WHERE format = 'singles' AND status IN ('open','accepted') AND (expires_at IS NULL OR expires_at > ?)
         AND ((challenger_player_id = ? AND defender_player_id = ?) OR (challenger_player_id = ? AND defender_player_id = ?))
         ORDER BY created_date LIMIT 1`, now, me.id, opp.id, opp.id, me.id);
    const stmts = [guardRow(env, 'matchups', m.id, m.version, 'open')];
    let chId, sent = false;
    if (live) {
      chId = live.id;
      stmts.push(guardRow(env, 'challenges', live.id, live.version, live.status));
      if (live.status === 'open' && live.defender_player_id === me.id) {
        stmts.push(stmt(env, `UPDATE challenges SET status = 'accepted', responded_at = ?, expires_at = ?, updated_date = ?, version = version + 1 WHERE id = ?`,
          now, weekdayDeadline(Date.parse(now), CHALLENGE_MS, [me.timezone, opp.timezone]), now, live.id));
      }
    } else {
      chId = uuid();
      sent = true;
      stmts.push(insertSinglesChallenge(env, { id: chId, me, def: opp, message: '', now, matchupId: m.id }), touch(env, me.id, now));
    }
    stmts.push(stmt(env,
      `UPDATE matchups SET status = 'committed', said_yes_at = ?, challenge_id = ?, updated_date = ?, version = version + 1 WHERE id = ?`,
      now, chId, now, m.id));
    await commit(env, stmts);
    if (sent) await notify(env, 'challenge_received', { challenge_id: chId, actor_user_id: user.id });
    return matchupView(env, me);
  });
};

/**
 * "Decline": the owner turns down this week's mystery match without ever learning who it was. Costs the max loss right
 * away (at most MAX_DELTA, never below the floor) and settles the week (no week-end charge).
 */
fns.matchupDecline = async ({ env, user }) => {
  await requirePlayer(env, user);
  await ensureMatchupWeek(env);
  return retrying(async () => {
    const me = await requirePlayer(env, user);
    const { start } = thisWeek();
    const m = await myRow(env, start, me.id);
    if (!m) throw bad('You have no match this week.');
    if (m.settled_at) throw bad("This week's match is already settled.");
    if (m.status !== 'open') throw bad('You already accepted this match. Backing out is the only way out now.');
    const now = nowIso();
    if (m.week_end <= now) throw bad('This week is over.');
    const lv = await ladderVersion(env);
    const rh = await ratingHits(env, [{ key: m.id, player_id: me.id, cost: (r) => missCost(m.max_loss, r) }], lv);
    const r = rh.res[m.id];
    await commit(env, [
      ...rh.guards,
      guardRow(env, 'matchups', m.id, m.version, 'open'),
      stmt(env, `UPDATE matchups SET ${penaltyCols} WHERE id = ?`, 'declined', r.penalty, 'declined', r.before, r.after, now, now, m.id),
      ...rh.stmts,
    ]);
    return matchupView(env, (await getPlayers(env, [me.id]))[0]);
  });
};

/** Backing out after "Accept": 2x the frozen max loss (at most 80, never below the floor); the challenge is cancelled. */
fns.matchupBackOut = ({ env, user }) =>
  retrying(async () => {
    const me = await requirePlayer(env, user);
    const { start } = thisWeek();
    const m = await myRow(env, start, me.id);
    if (!m || m.settled_at || m.status !== 'committed') throw bad('You have nothing to back out of.');
    const ch = m.challenge_id ? await getChallenge(env, m.challenge_id) : null;
    const state = matchupState(m, ch);
    if (state === 'cleared') throw bad("You're cleared for this week: there is nothing to back out of.");
    if (state === 'unplayed') throw bad('Your challenge window has closed. Play them before the week ends, or the max loss applies.');
    const lv = await ladderVersion(env);
    const now = nowIso();
    const rh = await ratingHits(env, [{ key: m.id, player_id: me.id, cost: (r) => backoutCost(m.max_loss, r) }], lv);
    const r = rh.res[m.id];
    await commit(env, [
      ...rh.guards,
      guardRow(env, 'matchups', m.id, m.version, 'committed'),
      guardRow(env, 'challenges', ch.id, ch.version, ch.status),
      stmt(env, `UPDATE challenges SET status = 'cancelled', updated_date = ?, version = version + 1 WHERE id = ?`, now, ch.id),
      stmt(env, `UPDATE matchups SET ${penaltyCols} WHERE id = ?`, 'backed_out', r.penalty, 'backed_out', r.before, r.after, now, now, m.id),
      ...rh.stmts,
    ]);
    return matchupView(env, (await getPlayers(env, [me.id]))[0]);
  });

/** Expire overdue challenges/matches, recompute flags and ranks; settle last week's matchups and make this week's. Session-free (also run by cron). */
export const runSyncLadder = async ({ env }) => {
  const res = await syncCore(env);
  res.matchups_settled = await settleMatchups(env);
  res.matchups_assigned = await ensureMatchupWeek(env);
  return res;
};
const syncCore = (env) =>
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
      ...(p ? [stmt(env, 'DELETE FROM matchups WHERE settled_at IS NULL AND (player_id = ? OR opponent_player_id = ?)', p.id, p.id)] : []),
      stmt(env, 'DELETE FROM players WHERE user_id = ?', user.id),
      ...chat.chatErasureStmts(env, user.id),
      ...(await guilds.guildErasureStmts(env, p)),
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
for (const n of [
  'listGuilds', 'getGuild', 'guildTags', 'createGuild', 'updateGuild', 'requestJoinGuild', 'cancelJoinRequest', 'respondJoinRequest',
  'leaveGuild', 'kickMember', 'transferLeadership',
]) fns[n] = guilds[n];

// The only functions callable without a session (they get user = null).
const PUBLIC_FNS = new Set(['submitFeedback', 'listTopics', 'getTopic', 'roomPosts', 'roomAround', 'listDisputes', 'disputeCounts', 'playerSearch', 'listGuilds', 'getGuild', 'guildTags', 'bountyBoard', 'listMatchups']);

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
