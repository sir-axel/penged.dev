// Notification emails about challenges and match results. Hooks in functions.js are one line each,
// `await notify(env, event, { ids })`, placed AFTER the write committed. Everything is re-read from D1 here, so
// the hooks stay tiny and the emails describe what was actually saved. On the Worker it runs via ctx.waitUntil
// (email.js `defer`), so it never slows down or fails the request; without an execution context (tests, cron)
// it is awaited. Nothing here throws.
//
// Who gets mail: the people the event is about, minus the person who acted, and only when their Better Auth
// account has a VERIFIED email and email_notifications = 1 (Profile toggle, setEmailNotifications).
// Budget: Resend's free plan is 100/day, shared with password-reset / verify mail, so notifications have their
// own lower daily cap (NOTIFY_DAILY_CAP) on top of email.js's per-address and global caps.
import { bump, defer, guardedSend, layout } from './email.js';
import { TIERS } from './tiers.js';
import { DEFAULT_TZ } from './weekdays.js';
import { whyText } from './matchmaking.js';
import { MAX_DELTA, MATCHUP_BACKOUT_MULT } from './rating.js';

/** Notification emails per UTC day; the rest of the Resend allowance stays free for account emails. */
export const NOTIFY_DAILY_CAP = 60;
// Only what players asked for: a challenge that names you, the final score of a match you played, and your weekly match.
export const EVENTS = ['challenge_received', 'match_verified', 'matchup_assigned'];

const site = (env) => String(env.SITE_URL || 'https://penged.dev').replace(/\/$/, '');
const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const tierName = (key) => TIERS.find((t) => t.key === key)?.name || key;
const nameOfEntry = (e) => e.display_name || e.username;
const names = (side) => side.map(nameOfEntry).join(' & ');

/** "Thu, Oct 30, 6:30pm CDT" in the reader's zone. */
export function when(iso, tz) {
  if (!iso) return '';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || DEFAULT_TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    }).formatToParts(new Date(iso));
  } catch {
    return when(iso, DEFAULT_TZ);
  }
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.month} ${p.day}, ${p.hour}:${p.minute}${String(p.dayPeriod).toLowerCase()} ${p.timeZoneName}`;
}

// ---- recipients --------------------------------------------------------------------------------------------
/**
 * user id -> { user_id, email, name, tz } for the accounts that may be emailed: verified address, notifications on.
 * Accounts without a player row still resolve (name from the account), so nobody is skipped for that alone.
 */
export async function recipients(env, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return {};
  const rows = (await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.emailVerified AS verified, u.email_notifications AS on_, p.timezone, p.display_name, p.username
       FROM "user" u LEFT JOIN players p ON p.user_id = u.id WHERE u.id IN (${ids.map(() => '?').join(',')})`,
  ).bind(...ids).all()).results;
  const out = {};
  for (const r of rows) {
    if (!r.email || !String(r.email).includes('@') || !r.verified || Number(r.on_) !== 1) continue;
    out[r.id] = { user_id: r.id, email: r.email, name: r.display_name || r.username || r.name, tz: r.timezone || DEFAULT_TZ };
  }
  return out;
}

// ---- message bodies ----------------------------------------------------------------------------------------
function message(env, r, { subject, heading, lines, button, path }) {
  const url = `${site(env)}${path}`;
  const settings = `${site(env)}/profile`;
  const footer = 'You get these because email notifications are on for your Penged.dev account.';
  const hi = r.name ? `Hi ${r.name},` : 'Hi,';
  return {
    to: r.email,
    user_id: r.user_id,
    subject,
    text: `${hi}\n\n${lines.join('\n')}\n\n${url}\n\n${footer} Turn them off on your profile: ${settings}\n\nPenged.dev`,
    html: layout({
      preheader: lines[0] || subject, heading, paragraphs: [hi, ...lines], button, url, footer,
      footerLink: { url: settings, text: 'Turn them off on your profile.' },
    }),
  };
}

// Doubles challenges: everyone involved hears about it; nobody is ever penalised.
const pairs = (c) => `${c.challenger_name} & ${c.challenger_partner_name} vs ${c.defender_name} & ${c.defender_partner_name}`;
const everyone = (c) => [c.challenger_user_id, c.challenger_partner_user_id, c.defender_user_id, c.defender_partner_user_id];
const nameOfUser = (c, uid) => ({
  [c.challenger_user_id]: c.challenger_name, [c.challenger_partner_user_id]: c.challenger_partner_name,
  [c.defender_user_id]: c.defender_name, [c.defender_partner_user_id]: c.defender_partner_name,
})[uid] || 'Someone';
const doublesMsgs = {
  challenge_received(env, c, rs) {
    return everyone(c).slice(1).map((uid) => rs[uid]).filter(Boolean).map((r) => {
      const lines = [r.user_id === c.challenger_partner_user_id
        ? `${c.challenger_name} wants you as their partner in a doubles challenge: ${pairs(c)}.`
        : `${c.challenger_name} challenged you to doubles: ${pairs(c)}.`];
      if (c.message) lines.push(`Their message: "${c.message}"`);
      lines.push(`All three invited players need to accept by ${when(c.expires_at, r.tz)} (weekdays only). Saying no costs nothing.`);
      return message(env, r, { subject: `${c.challenger_name} challenged you to doubles`, heading: 'Doubles challenge', lines, button: 'ANSWER THE CHALLENGE', path: '/challenges' });
    });
  },
};

const rankOf = (n) => (n != null ? ` (#${n})` : '');
const challengeMsgs = {
  challenge_received(env, c, rs) {
    const r = rs[c.defender_user_id];
    if (!r) return [];
    const matched = !!c.matchup_id;
    const lines = [matched
      ? `${c.challenger_name}${rankOf(c.challenger_rank)} was matched with you for this week's match and said yes: this is their matched game. For you it is a regular challenge.`
      : `${c.challenger_name} (#${c.challenger_rank}) challenged you (#${c.defender_rank}).`];
    if (c.message) lines.push(`Their message: "${c.message}"`);
    lines.push(`Accept or decline by ${when(c.expires_at, r.tz)}. The clock only runs on weekdays. ${c.direction === 'down'
      ? "They're rated above you, so declining is free, but letting it run out costs you rating."
      : 'Letting it run out can cost you rating.'}`);
    return [message(env, r, {
      subject: matched ? `${c.challenger_name} wants this week's matched game with you` : `${c.challenger_name} challenged you`,
      heading: matched ? "This week's matched game" : 'You have been challenged', lines, button: 'ANSWER THE CHALLENGE', path: '/challenges',
    })];
  },
};

/** One participant's view of a match: their side, the other side, games from their side. */
function pov(m, userId) {
  const mine = m.side_a.some((e) => e.user_id === userId) ? 'a' : 'b';
  const us = mine === 'a' ? m.side_a : m.side_b;
  const them = mine === 'a' ? m.side_b : m.side_a;
  const games = m.games.map((g) => (mine === 'a' ? [g.a, g.b] : [g.b, g.a]));
  const won = m.winner_side === mine;
  const gw = games.filter(([x, y]) => x > y).length;
  const me = us.find((e) => e.user_id === userId);
  const mates = us.filter((e) => e.user_id !== userId);
  return {
    me, won, mates, opp: names(them), set: `${gw}-${games.length - gw}`,
    you: mates.length ? `you & ${names(mates)}` : 'you',
    games: games.map(([x, y]) => `${x}-${y}`).join(', '),
  };
}

const matchMsgs = {
  match_verified(env, m, rs, { actor_user_id: actor } = {}) {
    if (m.status !== 'verified') return [];
    const changes = m.rating_changes || [];
    const out = [];
    for (const uid of m.all_user_ids) {
      const r = rs[uid];
      if (!r || uid === actor) continue;
      const v = pov(m, uid);
      const ch = changes.find((x) => x.player_id === v.me?.player_id);
      const lines = [`Final: ${v.you} ${v.won ? 'beat' : 'lost to'} ${v.opp} ${v.set}.`, `Games: ${v.games}.`];
      if (ch) lines.push(`${m.format === 'doubles' ? 'Doubles' : 'Singles'} rating: ${ch.before} → ${ch.after} (${signed(ch.delta)}).`);
      if (ch?.tier_after) {
        const up = TIERS.findIndex((t) => t.key === ch.tier_after) > TIERS.findIndex((t) => t.key === ch.tier_before);
        lines.push(`New tier: ${tierName(ch.tier_after)} (${up ? 'up' : 'down'} from ${tierName(ch.tier_before)}).`);
      }
      out.push(message(env, r, {
        subject: `Final: ${v.you} ${v.won ? 'beat' : 'lost to'} ${v.opp} ${v.set}${ch ? ` (${signed(ch.delta)})` : ''}`,
        heading: v.won ? 'You won' : 'Match confirmed', lines, button: 'SEE THE MATCH', path: `/matches/${m.id}`,
      }));
    }
    return out;
  },
};

// Weekly matchmaking: each owner hears once, when the week's matchups are generated (ensureMatchupWeek).
const minus = (n) => `−${Math.abs(n)}`;
function matchupMsg(env, m, r) {
  const opp = m.o_display || m.o_user || 'your opponent';
  const loss = m.quote_loss || 0;
  const back = Math.min(MAX_DELTA, MATCHUP_BACKOUT_MULT * loss);
  const why = whyText(m);
  const lines = [
    `Your match this week is ${opp}${rankOf(m.opponent_rank)}.`,
    ...(why ? [`Why them: ${why}.`] : []),
    `On the line: max win +${m.quote_win || 0}, max loss ${minus(loss)} (a 2-0 either way, played as a challenge).`,
    `Play it by ${when(new Date(Date.parse(m.week_end) - 60000).toISOString(), r.tz)}, or lose ${loss}.`,
    `Say "I'm in" to send them the challenge. Once you say yes you can't back out without losing 2x the max loss (${minus(back)}).`,
  ];
  return message(env, r, { subject: `Your match this week: ${opp}`, heading: "This week's match", lines, button: 'SEE YOUR MATCH', path: '/challenges' });
}

// ---- planning + delivery ---------------------------------------------------------------------------------
/** The emails an event should produce right now (recipients filtered). data: { challenge_id | challenge_ids | match_id, actor_user_id? } */
export async function compose(env, event, data = {}) {
  if (challengeMsgs[event]) {
    const ids = data.challenge_ids || (data.challenge_id ? [data.challenge_id] : []);
    if (!ids.length) return [];
    const cs = (await env.DB.prepare(`SELECT * FROM challenges WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
    const rs = await recipients(env, cs.flatMap(everyone));
    return cs.flatMap((c) => (c.format === 'doubles' ? doublesMsgs : challengeMsgs)[event](env, c, rs).filter((msg) => msg.user_id !== data.actor_user_id));
  }
  if (event === 'matchup_assigned') {
    const ids = data.matchup_ids || [];
    if (!ids.length) return [];
    const rows = (await env.DB.prepare(
      `SELECT m.*, o.display_name AS o_display, o.username AS o_user FROM matchups m LEFT JOIN players o ON o.id = m.opponent_player_id
         WHERE m.id IN (${ids.map(() => '?').join(',')}) ORDER BY m.created_date, m.id`,
    ).bind(...ids).all()).results;
    const rs = await recipients(env, rows.map((m) => m.user_id));
    return rows.filter((m) => rs[m.user_id]).map((m) => matchupMsg(env, m, rs[m.user_id]));
  }
  if (matchMsgs[event]) {
    const row = data.match_id ? await env.DB.prepare('SELECT * FROM matches WHERE id = ?').bind(data.match_id).first() : null;
    if (!row) return [];
    const m = { ...row };
    for (const k of ['side_a', 'side_b', 'games', 'all_user_ids', 'accepted_user_ids', 'rating_changes']) m[k] = parse(m[k]) ?? (k === 'rating_changes' ? null : []);
    const rs = await recipients(env, m.all_user_ids);
    return matchMsgs[event](env, m, rs, data).filter((msg) => msg.user_id !== data.actor_user_id);
  }
  console.warn(`[notify] unknown event ${event}`);
  return [];
}

/** Compose and send (caps applied). Returns the send results; never throws. */
export async function run(env, event, data) {
  try {
    const msgs = await compose(env, event, data);
    const results = [];
    for (const { user_id: _u, ...msg } of msgs) {
      const day = new Date().toISOString().slice(0, 10);
      if (!(await bump(env, `emailguard:notify:${day}`, NOTIFY_DAILY_CAP, 36 * 3600e3))) {
        console.warn(`[notify] daily cap (${NOTIFY_DAILY_CAP}) reached; not sending ${event}`);
        results.push({ sent: false, blocked: true });
        continue;
      }
      results.push(await guardedSend(env, `notify:${event}`, msg));
    }
    return results;
  } catch (e) {
    console.error(`[notify] ${event} failed`, e);
    return [];
  }
}

/** Fire-and-forget notification (awaitable; resolves immediately on the Worker, after sending without a ctx). */
export const notify = (env, event, data) => defer(run(env, event, data));
