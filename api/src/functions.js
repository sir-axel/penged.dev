import { Hono } from 'hono';
import {
  all, first, stmt, guard, guardRow, guardLadder, bumpLadder, ladderVersion, commit, retrying, uuid, nowIso,
  daysAgoIso, inFutureIso, placeholders,
} from './db.js';
import { getUser } from './auth.js';
import { HttpError, bad } from './errors.js';
import { submitFeedback, listFeedback, updateFeedback, myFeedback, myFeedbackUnread, markFeedbackSeen, replyFeedback } from './feedback.js';
import { avatarOwner, removeAvatar } from './uploads.js';
import { decodeInternal, pub } from './schema.js';
import {
  START_RATING, REPEAT_WINDOW_DAYS, rateMatch, xpForMatch, levelForXp, validateGames, summarizeGames,
  RANK_SQL, DOUBLES_RANK_SQL, rankPlayers, ACTIVE_DAYS, REPEAT_RECENT_DAYS, meetingWeight, RATING_FLOOR, challengePenalty, WALKOVER_XP, COOLDOWN_DAYS, WAIVER_DAYS, FATIGUE_DAYS,
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
  const un = `(SELECT count(*) FROM challenges c WHERE c.defender_player_id = players.id AND c.status = 'expired' AND c.responded_at IS NULL AND c.reversed = 0)`;
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
/** Meeting count (180d), recent pair match (7d) and defender fatigue (verified matches in 7d) for a challenge. */
async function penaltyFacts(env, c) {
  const ids = [c.challenger_player_id, c.defender_player_id];
  const pair = (days) => first(env,
    `SELECT count(*) AS n FROM matches WHERE status = 'verified' AND format = 'singles' AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?) AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?)`,
    daysAgoIso(days), ...ids);
  const meetings = (await pair(REPEAT_WINDOW_DAYS)).n;
  const recentPairMatch = (await pair(WAIVER_DAYS)).n > 0;
  const defRecentMatches = (await first(env,
    `SELECT count(*) AS n FROM matches WHERE status = 'verified' AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value = ?)`, daysAgoIso(FATIGUE_DAYS), c.defender_player_id)).n;
  return { meetings, recentPairMatch, defRecentMatches };
}
const penaltyOf = (kind, def, chal, rankGap, facts) =>
  challengePenalty({
    kind, rankGap, defRating: def.singles_rating, defMatches: def.singles_wins + def.singles_losses, chalRating: chal.singles_rating, ...facts,
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
    const rank = (await first(env, 'SELECT coalesce(max(singles_rank), 0) + 1 AS r FROM players')).r; // provisional; recomputed below
    const id = uuid();
    const now = nowIso();
    await commit(env, [
      guardLadder(env, lv),
      stmt(env,
        `INSERT INTO players (id, user_id, username, username_lower, display_name, avatar_url, singles_rating, doubles_rating,
           singles_rank, last_active_at, created_date, updated_date, created_by_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, user.id, username, username.toLowerCase(), display, avatar, START_RATING, START_RATING, rank, now, now, now, user.id),
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
async function verifyPlan(env, m, now) {
  const players = await getPlayers(env, m.all_player_ids);
  if (players.length !== m.all_player_ids.length) throw new HttpError(409, 'A player in this match no longer exists.');
  const fmt = m.format;
  const sides = { a: m.side_a.map((e) => e.player_id), b: m.side_b.map((e) => e.player_id) };
  const sideOf = (id) => (sides.a.includes(id) ? 'a' : 'b');
  const ids = m.all_player_ids;

  // Earlier VERIFIED same-format meetings in the last 180 days. For player P, a meeting is an earlier match
  // where P was opposite at least one of P's opponents in this match (singles: the same opponent).
  // Each counts 1 if within REPEAT_RECENT_DAYS, else 0.5 (meetingWeight).
  const prevRows = await all(env,
    `SELECT side_a, side_b, verified_at FROM matches WHERE status = 'verified' AND format = ? AND id <> ? AND verified_at > ?
       AND EXISTS (SELECT 1 FROM json_each(all_player_ids) WHERE value IN (${placeholders(ids.length)}))`,
    fmt, m.id, daysAgoIso(REPEAT_WINDOW_DAYS), ...ids);
  const prev = prevRows.map((r) => ({
    A: JSON.parse(r.side_a).map((e) => e.player_id), B: JSON.parse(r.side_b).map((e) => e.player_id),
    w: meetingWeight((Date.parse(now) - Date.parse(r.verified_at)) / 86400000),
  }));
  const earlier = (pid) => {
    const opps = sides[sideOf(pid) === 'a' ? 'b' : 'a'];
    let n = 0;
    for (const { A, B, w } of prev) {
      const mine = A.includes(pid) ? A : B.includes(pid) ? B : null;
      if (!mine) continue;
      const theirs = mine === A ? B : A;
      if (opps.some((o) => theirs.includes(o))) n += w;
    }
    return n;
  };

  // An accepted challenge between these two players, accepted before this result was submitted, is played by this match.
  let ch = null;
  if (fmt === 'singles') {
    const winner = sides[m.winner_side][0];
    const loser = sides[m.winner_side === 'a' ? 'b' : 'a'][0];
    ch = await first(env,
      `SELECT * FROM challenges WHERE status = 'accepted' AND responded_at <= ? AND (expires_at IS NULL OR expires_at > ?)
         AND ((challenger_player_id = ? AND defender_player_id = ?) OR (challenger_player_id = ? AND defender_player_id = ?)) LIMIT 1`,
      m.created_date, now, winner, loser, loser, winner);
  }

  const rc = `${fmt}_rating`, wc = `${fmt}_wins`, lc = `${fmt}_losses`, gwc = `${fmt}_game_wins`, glc = `${fmt}_game_losses`, vc = `${fmt}_last_verified_at`, sc = `${fmt}_win_streak`, bc = `${fmt}_best_streak`;
  const paddleOf = (id) => [...m.side_a, ...m.side_b].find((e) => e.player_id === id)?.paddle;
  const parts = players.map((p) => ({
    id: p.id, side: sideOf(p.id), paddle: paddleOf(p.id), rating: p[rc], gamesPlayed: p[gwc] + p[glc], earlierMeetings: earlier(p.id),
    daysSinceLast: p[vc] ? Math.max(0, (Date.parse(now) - Date.parse(p[vc])) / 86400000) : null,
  }));
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
    });
    const xpGain = xpRes.total;
    const xp = p.xp + xpGain;
    stmts.push(guardRow(env, 'players', p.id, p.version));
    stmts.push(stmt(env,
      `UPDATE players SET ${rc} = ?, ${won ? wc : lc} = ${won ? wc : lc} + 1, ${gwc} = ${gwc} + ?, ${glc} = ${glc} + ?, xp = ?, level = ?, last_active_at = ?,
         ${sc} = ?, ${bc} = ?, last_match_day = ?, ${vc} = ?, updated_date = ?, version = version + 1 WHERE id = ?`,
      res.after, gamesWon, m.games.length - gamesWon, xp, levelForXp(xp), now, streak, best, today, now, now, p.id));
    changes.push({
      player_id: p.id, name: nameOf(p), before: res.before, after: res.after, delta: res.delta,
      dominance: res.dominance, rust: res.rust, repeat: res.repeat, evidence: res.evidence, challenge: res.challenge,
      games: res.games.map((g) => ({
        game: g.game, score: g.score, won: g.won, before: g.before, after: g.after, delta: g.delta,
        expected: g.expected, dominance: g.dominance, mov: g.mov, ac: g.ac, paddle_edge: g.paddle_edge, k: g.k,
        rust: g.rust, opp_certainty: g.opp_certainty, evidence: g.evidence, repeat: g.repeat, teammate: g.teammate,
        challenge: g.challenge,
      })),
      xp_gained: xpGain, xp_parts: xpRes.parts, win_streak: streak,
    });
  }
  stmts.push(...rankStmts(env)); // each format's rank SQL reads only its own columns; the other is a no-op
  if (fmt === 'singles') {
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
    const cool = await first(env,
      `SELECT penalized_at FROM challenges WHERE challenger_player_id = ? AND defender_player_id = ? AND penalized_at > ? AND reversed = 0
         ORDER BY penalized_at DESC LIMIT 1`, me.id, def.id, daysAgoIso(COOLDOWN_DAYS));
    if (cool) {
      const retry = new Date(Date.parse(cool.penalized_at) + COOLDOWN_DAYS * 86400000).toISOString();
      throw new HttpError(409, `You challenged ${nameOf(def)} recently. You can challenge them again after ${fmtUtc(retry)}.`);
    }
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
    if (decision === 'decline') {
      const lv = await ladderVersion(env);
      const plan = await penaltyPlan(env, [c], 'declined', now, lv);
      if (!plan.changed) throw new HttpError(409, 'That challenge can no longer be answered.');
      await commit(env, [...plan.guards, ...plan.stmts, flagsStmt(env)]);
      return { challenge: pub('Challenge', await getChallenge(env, id)) };
    }
    // Accepting starts a fresh 72h window to actually play; unplayed accepted challenges expire in syncLadder.
    await commit(env, [
      guardRow(env, 'challenges', c.id, c.version, 'open'),
      stmt(env, 'UPDATE challenges SET status = ?, responded_at = ?, expires_at = ?, updated_date = ?, version = version + 1 WHERE id = ?',
        'accepted', now, inFutureIso(CHALLENGE_MS), now, c.id),
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
    const iC = stmts.push(stmt(env, `UPDATE challenges SET status = 'expired', updated_date = ?, version = version + 1 WHERE status IN ('open','accepted') AND expires_at < ?`, now, now)) - 1;
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
      stmt(env, `DELETE FROM challenges WHERE status IN ('open','accepted') AND (challenger_user_id = ? OR defender_user_id = ?)`, user.id, user.id),
      stmt(env, `DELETE FROM matches WHERE status = 'pending' AND EXISTS (SELECT 1 FROM json_each(all_user_ids) WHERE value = ?)`, user.id),
      stmt(env, 'DELETE FROM players WHERE user_id = ?', user.id),
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
fns.myFeedbackUnread = myFeedbackUnread;
fns.markFeedbackSeen = markFeedbackSeen;
fns.replyFeedback = replyFeedback;

// The only functions callable without a session (they get user = null).
const PUBLIC_FNS = new Set(['submitFeedback']);

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
  return c.json(await fn({ env: c.env, user, request: c.req.raw }, body));
});
