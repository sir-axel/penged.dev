import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { app, env, dispose, reset, signUp, call } from './helpers.js';

beforeEach(reset);
afterAll(() => dispose());

const ORIGIN = 'http://localhost:8787';
const session = async (who) => {
  const res = await app.request('/api/auth/get-session', { headers: { Cookie: who.cookie, Origin: ORIGIN } });
  return (await res.json())?.user;
};
const dbTheme = async (u) => (await env.DB.prepare('SELECT theme FROM "user" WHERE id = ?').bind(u.id).first()).theme;

describe('setTheme', () => {
  it('requires a session', async () => {
    const r = await call(null, 'setTheme', { theme: 'dark' });
    expect(r.status).toBe(401);
  });

  it('validates the value', async () => {
    const u = await signUp('t1@x.test', 'tee');
    for (const theme of ['blue', '', 1, true, undefined, {}, ['dark']]) {
      const r = await call(u, 'setTheme', theme === undefined ? {} : { theme });
      expect(r.status).toBe(400);
    }
    expect(await dbTheme(u)).toBeNull();
  });

  it('persists and is returned by the session payload', async () => {
    const u = await signUp('t2@x.test', 'tee2');
    expect((await session(u)).theme ?? null).toBeNull();
    expect((await call(u, 'setTheme', { theme: 'dark' })).body).toEqual({ theme: 'dark' });
    expect(await dbTheme(u)).toBe('dark');
    expect((await session(u)).theme).toBe('dark');
    await call(u, 'setTheme', { theme: 'light' });
    expect((await session(u)).theme).toBe('light');
    await call(u, 'setTheme', { theme: null });
    expect((await session(u)).theme ?? null).toBeNull();
  });

  it("cannot change another user's theme", async () => {
    const a = await signUp('a@x.test', 'aa');
    const b = await signUp('b@x.test', 'bb');
    await call(a, 'setTheme', { theme: 'dark' });
    const r = await call(b, 'setTheme', { theme: 'light', user_id: a.id, id: a.id });
    expect(r.status).toBe(200);
    expect(await dbTheme(a)).toBe('dark');
    expect(await dbTheme(b)).toBe('light');
  });

  it('cannot be set through the generic update-user endpoint or at sign-up', async () => {
    const u = await signUp('c@x.test', 'cc');
    await app.request('/api/auth/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: u.cookie },
      body: JSON.stringify({ theme: 'bogus' }),
    });
    expect(await dbTheme(u)).toBeNull();
  });
});
