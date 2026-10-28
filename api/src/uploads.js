import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getUser } from './auth.js';
import { HttpError } from './errors.js';

// Storage is pluggable: the R2 `AVATARS` binding when present (2MB cap), otherwise the D1 `avatars` table (200KB cap).
const MAX_R2 = 2 * 1024 * 1024;
const MAX_D1 = 200 * 1024;
const MAX = MAX_R2;
const D1_PER_USER = 10;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

function sniff(b) {
  const ascii = (s, e) => String.fromCharCode(...b.subarray(s, e));
  if (b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (b.length > 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'gif';
  return null;
}

export const uploads = new Hono();
uploads.post('/', bodyLimit({ maxSize: MAX + 64 * 1024, onError: (c) => c.json({ error: 'That file is too large (2MB max).' }, 413) }), async (c) => {
  const user = await getUser(c);
  if (!user) throw new HttpError(401, 'Sign in required');
  let form;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new HttpError(400, 'Send the image as multipart form data.');
  }
  const file = form.file;
  if (!file || typeof file === 'string') throw new HttpError(400, 'Attach an image in the "file" field.');
  if (!TYPES[file.type]) throw new HttpError(400, 'Only PNG, JPEG, WebP and GIF images are allowed.');
  const useR2 = !!c.env.AVATARS;
  const cap = useR2 ? MAX_R2 : MAX_D1;
  const capLabel = useR2 ? '2MB' : '200KB';
  if (file.size > cap) throw new HttpError(413, `That file is too large (${capLabel} max).`);
  const buf = new Uint8Array(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext) throw new HttpError(400, 'That file does not look like an image.');
  const key = `${crypto.randomUUID()}.${ext}`;
  if (useR2) {
    await c.env.AVATARS.put(key, buf, { httpMetadata: { contentType: MIME[ext] }, customMetadata: { owner: user.id } });
  } else {
    const mine = await c.env.DB.prepare('SELECT count(*) AS n FROM avatars WHERE owner = ?').bind(user.id).first();
    if (mine.n >= D1_PER_USER) throw new HttpError(429, 'Too many uploads. Use or replace an existing avatar.');
    await c.env.DB.prepare('INSERT INTO avatars (id, content_type, data, created, owner) VALUES (?,?,?,?,?)')
      .bind(key, MIME[ext], buf, new Date().toISOString(), user.id).run();
  }
  return c.json({ file_url: `/api/files/${key}` });
});

export const files = new Hono();
files.get('/:key', async (c) => {
  const m = /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.exec(c.req.param('key'));
  if (!m) throw new HttpError(404, 'Not found');
  const key = c.req.param('key');
  const headers = {
    'Content-Type': MIME[m[1]],
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };
  if (c.env.AVATARS) {
    const obj = await c.env.AVATARS.get(key);
    if (obj) return new Response(obj.body, { headers: { ...headers, ETag: obj.httpEtag } });
  }
  // D1 store (also used if an earlier upload predates enabling R2).
  const row = await c.env.DB.prepare('SELECT data FROM avatars WHERE id = ?').bind(key).first();
  if (!row) throw new HttpError(404, 'Not found');
  const data = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : Uint8Array.from(row.data);
  return new Response(data, { headers });
});

/** Uploader's user id for a stored avatar key, or null if missing/unowned. */
export async function avatarOwner(env, key) {
  if (env.AVATARS) {
    const o = await env.AVATARS.head(key);
    if (o) return o.customMetadata?.owner ?? null;
  }
  const r = await env.DB.prepare('SELECT owner FROM avatars WHERE id = ?').bind(key).first();
  return r?.owner ?? null;
}

/** Best-effort delete of a stored avatar given its /api/files/<key> url. */
export async function removeAvatar(env, url) {
  const m = /^\/api\/files\/([0-9a-f-]{36}\.(?:png|jpg|webp|gif))$/.exec(url || '');
  if (!m) return;
  try {
    if (env.AVATARS) await env.AVATARS.delete(m[1]);
    await env.DB.prepare('DELETE FROM avatars WHERE id = ?').bind(m[1]).run();
  } catch (e) {
    console.error('avatar cleanup failed', e);
  }
}
