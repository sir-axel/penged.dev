import { getPlatformProxy } from 'wrangler';
import { createApp } from '../src/app.js';

const proxy = await getPlatformProxy({ configPath: 'wrangler.test.toml', persist: { path: '.wrangler/test-state/v3' } });
// Real local D1 + R2 (miniflare); config values pinned for determinism.
export const env = {
  DB: proxy.env.DB,
  AVATARS: proxy.env.AVATARS,
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
  BETTER_AUTH_URL: 'http://localhost:8787',
  TRUSTED_ORIGINS: 'http://localhost:8787,http://localhost:5173',
  RATE_LIMIT: 'off',
};
export const dispose = () => proxy.dispose();

const worker = createApp();
export const app = { request: (path, init) => worker.request(path, init, env) };
const ORIGIN = 'http://localhost:8787';

export async function reset() {
  for (const t of ['players', 'matches', 'challenges', '_guard', 'session', 'account', 'verification', 'avatars', '"user"']) {
    await env.DB.prepare(`DELETE FROM ${t}`).run();
  }
}

let n = 0;
export async function signUp(email, name) {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ email, password: 'password123', name: name || `user${++n}` }),
  });
  if (res.status !== 200) throw new Error('sign-up failed ' + res.status + ' ' + (await res.text()));
  const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const body = await res.json();
  return { cookie, id: body.user.id, email };
}

export async function call(who, name, body = {}) {
  const res = await app.request(`/api/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...(who ? { Cookie: who.cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

export async function get(path, who) {
  const res = await app.request(path, { headers: who ? { Cookie: who.cookie, Origin: ORIGIN } : {} });
  return { status: res.status, body: await res.json() };
}

export async function mkPlayer(username) {
  const u = await signUp(`${username.toLowerCase()}@x.test`, username);
  const r = await call(u, 'createPlayer', { username });
  if (r.status !== 200) throw new Error('createPlayer failed ' + JSON.stringify(r.body));
  return { ...u, player: r.body.player };
}

/** App bound to a modified env (e.g. no R2 binding, no BETTER_AUTH_URL). Sessions are shared via the same D1. */
export const appWith = (overrides) => {
  const e = { ...env, ...overrides };
  return { env: e, request: (path, init) => worker.request(path, init, e) };
};

/** Promote a signed-up user to admin (what `npm run make-admin` does). */
export const makeAdmin = (u) => env.DB.prepare(`UPDATE "user" SET role = 'admin' WHERE id = ?`).bind(u.id).run();
