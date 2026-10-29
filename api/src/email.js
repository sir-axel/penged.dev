// Transactional email via Resend (plain fetch, no SDK). Without RESEND_API_KEY (local dev, tests) the
// message is logged instead of sent. Nothing here ever throws into the auth flow.
import { AsyncLocalStorage } from 'node:async_hooks';

const DEFAULT_FROM = 'Penged.dev <no-reply@mail.penged.dev>';
const SEND_TIMEOUT_MS = 8000;
/** Resend free plan allows 100/day; stop a little before it. */
export const DAILY_EMAIL_CAP = 90;
/** Max emails of one kind to one address per hour. */
export const PER_EMAIL_HOURLY_CAP = 3;

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** POST one message to Resend. Returns {sent:true,id} | {logged:true} | {sent:false,error}. */
export async function sendEmail(env, { to, subject, text, html }) {
  if (!env.RESEND_API_KEY) {
    if (env.EMAIL_LOG !== 'off') console.log(`[email:not-sent] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    return { logged: true };
  }
  try {
    const body = { from: env.EMAIL_FROM || DEFAULT_FROM, to: [to], subject, text, html };
    if (env.EMAIL_REPLY_TO) body.reply_to = env.EMAIL_REPLY_TO;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error('[email] resend rejected', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return { sent: false, error: `status ${res.status}` };
    }
    const data = await res.json().catch(() => ({}));
    return { sent: true, id: data.id };
  } catch (e) {
    console.error('[email] send failed', e?.name === 'TimeoutError' ? 'timeout' : e);
    return { sent: false, error: String(e?.message || e) };
  }
}

// ---- background work: ctx.waitUntil when the request has one, otherwise the caller awaits --------------
const als = new AsyncLocalStorage();
/** Run fn with the Worker execution context available to `defer`. */
export const withCtx = (ctx, fn) => (ctx ? als.run({ ctx }, fn) : fn());
/** Fire-and-forget on the Worker (so response time can't reveal whether an address exists); await if no ctx. */
export function defer(promise) {
  const ctx = als.getStore()?.ctx;
  const safe = Promise.resolve(promise).catch((e) => console.error('[email] background task failed', e));
  if (ctx?.waitUntil) {
    ctx.waitUntil(safe);
    return Promise.resolve();
  }
  return safe;
}

// ---- send guards (counters live in the Better Auth `verification` table; no migration) ------------------
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Atomically bump the counter row `id`; false once it already holds `cap`. */
export async function bump(env, id, cap, ttlMs) {
  const expires = new Date(Date.now() + ttlMs).toISOString();
  const row = await env.DB.prepare(
    `INSERT INTO "verification" (id, identifier, value, expiresAt) VALUES (?1, 'email-guard', '1', ?2)
     ON CONFLICT(id) DO UPDATE SET value = CAST(value AS INTEGER) + 1, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE CAST(value AS INTEGER) < ?3 RETURNING value`,
  ).bind(id, expires, cap).first();
  return !!row;
}

/**
 * Decide whether an email of `kind` to `to` may go out now. Per-address cap (3/hour/kind) first, then the
 * global daily cap (UTC day). Logs and returns false when blocked; fails closed on DB errors.
 */
export async function allowSend(env, kind, to) {
  try {
    const now = new Date();
    const hour = now.toISOString().slice(0, 13);
    const day = now.toISOString().slice(0, 10);
    const h = (await sha256Hex(`${kind}:${String(to).toLowerCase()}`)).slice(0, 32);
    if (!(await bump(env, `emailguard:addr:${h}:${hour}`, PER_EMAIL_HOURLY_CAP, 2 * 3600e3))) {
      console.warn(`[email] per-address hourly cap reached for ${kind}; not sending`);
      return false;
    }
    if (!(await bump(env, `emailguard:day:${day}`, DAILY_EMAIL_CAP, 36 * 3600e3))) {
      console.warn(`[email] daily cap (${DAILY_EMAIL_CAP}) reached; not sending ${kind}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email] guard failed, not sending', e);
    return false;
  }
}

/** Guard then send; used by the auth callbacks. Never throws. */
export async function guardedSend(env, kind, message) {
  if (!(await allowSend(env, kind, message.to))) return { sent: false, blocked: true };
  return sendEmail(env, message);
}

// ---- templates ------------------------------------------------------------------------------------------
/** Shared HTML shell. `footerLink` ({ url, text }) appends a plain link after the footer text (e.g. email settings). */
export function layout({ preheader, heading, paragraphs, button, url, footer, footerLink }) {
  const font = "'Courier New',Courier,monospace";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f0f0f0;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:2px solid #0d0d0d;">
<tr><td style="background:#0d0d0d;padding:14px 20px;font-family:${font};font-size:16px;font-weight:bold;letter-spacing:2px;color:#ffffff;">PENGED<span style="color:#d6361f;">.DEV</span></td></tr>
<tr><td style="padding:24px 20px 8px 20px;font-family:${font};font-size:18px;font-weight:bold;color:#0d0d0d;">${esc(heading)}</td></tr>
${paragraphs.map((p) => `<tr><td style="padding:6px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222222;">${esc(p)}</td></tr>`).join('\n')}
<tr><td style="padding:18px 20px;"><a href="${esc(url)}" style="display:inline-block;background:#d6361f;color:#ffffff;font-family:${font};font-size:14px;font-weight:bold;letter-spacing:1px;text-decoration:none;padding:14px 22px;border:2px solid #0d0d0d;">${esc(button)}</a></td></tr>
<tr><td style="padding:0 20px 8px 20px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#666666;">Button not working? Paste this link into your browser:<br><span style="word-break:break-all;color:#0d0d0d;">${esc(url)}</span></td></tr>
<tr><td style="padding:12px 20px 22px 20px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#666666;">${esc(footer)}${footerLink ? ` <a href="${esc(footerLink.url)}" style="color:#0d0d0d;">${esc(footerLink.text)}</a>` : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

const hello = (name) => (name && String(name).trim() ? `Hi ${String(name).trim()},` : 'Hi,');

export function passwordReset({ url, name }) {
  const footer = "If you didn't ask for this, ignore this email; your password stays as it is.";
  return {
    subject: 'Reset your Penged.dev password',
    text: `${hello(name)}\n\nSomeone asked to reset the password for your Penged.dev account. Use this link within 1 hour:\n\n${url}\n\n${footer}\n\nPenged.dev`,
    html: layout({
      preheader: 'Reset your Penged.dev password',
      heading: 'Reset your password',
      paragraphs: [hello(name), 'Someone asked to reset the password for your Penged.dev account. The link works for 1 hour.'],
      button: 'CHOOSE A NEW PASSWORD',
      url,
      footer,
    }),
  };
}

export function verifyEmail({ url, name }) {
  const footer = "If you didn't create a Penged.dev account, ignore this email.";
  return {
    subject: 'Verify your email for Penged.dev',
    text: `${hello(name)}\n\nConfirm this is your email address for Penged.dev. The link works for 24 hours:\n\n${url}\n\n${footer}\n\nPenged.dev`,
    html: layout({
      preheader: 'Confirm your email address',
      heading: 'Verify your email',
      paragraphs: [hello(name), 'Confirm this is your email address so we can reach you if you ever lose your password. The link works for 24 hours.'],
      button: 'VERIFY MY EMAIL',
      url,
      footer,
    }),
  };
}
