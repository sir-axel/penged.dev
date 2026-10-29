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

/** Notification emails per UTC day; the rest of the Resend allowance stays free for account emails. */
export const NOTIFY_DAILY_CAP = 60;
export const EVENTS = ['challenge_received', 'challenge_accepted', 'challenge_declined', 'challenge_expired', 'match_submitted', 'match_verified'];

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

const challengeMsgs = {
  challenge_received(env, c, rs) {
    const r = rs[c.defender_user_id];
    if (!r) return [];
    const lines = [`${c.challenger_name} (#${c.challenger_rank}) challenged you (#${c.defender_rank}).`];
    if (c.message) lines.push(`Their message: "${c.message}"`);
    lines.push(`Accept or decline by ${when(c.expires_at, r.tz)}. The clock only runs on weekdays. Letting it run out can cost you rating.`);
    return [message(env, r, { subject: `${c.challenger_name} challenged you`, heading: 'You have been challenged', lines, button: 'ANSWER THE CHALLENGE', path: '/challenges' })];
  },
  challenge_accepted(env, c, rs) {
    const r = rs[c.challenger_user_id];
    if (!r) return [];
    const lines = [`${c.defender_name} accepted your challenge.`, `Play by ${when(c.expires_at, r.tz)} (weekdays only) and log the result.`];
    return [message(env, r, { subject: `${c.defender_name} accepted your challenge`, heading: 'Challenge accepted', lines, button: 'SEE THE CHALLENGE', path: '/challenges' })];
  },
  challenge_declined(env, c, rs) {
    const r = rs[c.challenger_user_id];
    if (!r) return [];
    const lines = [`${c.defender_name} declined your challenge.`];
    if (c.penalty_rating > 0) lines.push(`Declining cost them ${c.penalty_rating} rating.`);
    return [message(env, r, { subject: `${c.defender_name} declined your challenge`, heading: 'Challenge declined', lines, button: 'SEE THE CHALLENGE', path: '/challenges' })];
  },
  challenge_expired(env, c, rs) {
    const out = [];
    const def = rs[c.defender_user_id];
    const chal = rs[c.challenger_user_id];
    if (c.responded_at) {
      // Accepted but never played: no penalty either way.
      for (const [r, other] of [[def, c.challenger_name], [chal, c.defender_name]]) {
        if (!r) continue;
        out.push(message(env, r, {
          subject: `Challenge with ${other} expired`, heading: 'Challenge expired',
          lines: [`Your challenge with ${other} ran out of time before a result was confirmed.`, 'No rating changed.'],
          button: 'SEE CHALLENGES', path: '/challenges',
        }));
      }
      return out;
    }
    const p = c.penalty_rating || 0;
    if (def) {
      const lines = [`You didn't answer ${c.challenger_name}'s challenge in time.`];
      if (p > 0) {
        const drop = c.penalty_rank_before != null && c.penalty_rank_after != null && c.penalty_rank_after !== c.penalty_rank_before
          ? `, and you moved from #${c.penalty_rank_before} to #${c.penalty_rank_after}` : '';
        lines.push(`It cost you ${p} rating${drop}.`);
      } else lines.push('No rating penalty this time.');
      out.push(message(env, def, {
        subject: `Challenge from ${c.challenger_name} expired${p > 0 ? ` (-${p})` : ''}`, heading: 'Challenge expired', lines,
        button: 'SEE CHALLENGES', path: '/challenges',
      }));
    }
    if (chal) {
      const g = c.challenger_rating_gain || 0;
      const lines = [`${c.defender_name} didn't answer your challenge in time.`, g > 0 ? `You get a walkover: +${g} rating.` : 'No rating changed.'];
      out.push(message(env, chal, {
        subject: `${c.defender_name} didn't answer${g > 0 ? `: walkover (+${g})` : ''}`, heading: 'Challenge expired', lines,
        button: 'SEE CHALLENGES', path: '/challenges',
      }));
    }
    return out;
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
  match_submitted(env, m, rs) {
    if (m.status !== 'pending') return [];
    const out = [];
    for (const uid of m.all_user_ids) {
      const r = rs[uid];
      if (!r || uid === m.submitted_by_user_id || m.accepted_user_ids.includes(uid)) continue;
      const v = pov(m, uid);
      out.push(message(env, r, {
        subject: `${m.submitted_by_name} logged a result: confirm it`, heading: 'Confirm your result',
        lines: [
          `${m.submitted_by_name} logged your ${m.format} match: ${v.you} ${v.won ? 'beat' : 'lost to'} ${v.opp} ${v.set} (${v.games}).`,
          `Confirm it, or dispute it if it's wrong. It expires ${when(m.expires_at, r.tz)}.`,
        ],
        button: 'CONFIRM THE RESULT', path: `/matches/${m.id}`,
      }));
    }
    return out;
  },
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

// ---- planning + delivery ---------------------------------------------------------------------------------
/** The emails an event should produce right now (recipients filtered). data: { challenge_id | challenge_ids | match_id, actor_user_id? } */
export async function compose(env, event, data = {}) {
  if (challengeMsgs[event]) {
    const ids = data.challenge_ids || (data.challenge_id ? [data.challenge_id] : []);
    if (!ids.length) return [];
    const cs = (await env.DB.prepare(`SELECT * FROM challenges WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
    const rs = await recipients(env, cs.flatMap((c) => [c.challenger_user_id, c.defender_user_id]));
    return cs.flatMap((c) => challengeMsgs[event](env, c, rs).filter((msg) => msg.user_id !== data.actor_user_id));
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
