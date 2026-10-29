// Seeds the LOCAL D1 state (./.wrangler/state) with a demo ladder, driving the real HTTP functions so
// ratings, xp, ranks and rating_changes are exactly what the app itself would produce.
//   npm run seed            refuses if data exists
//   npm run seed -- --reset wipes players/matches/challenges/users first
// Demo login: demo@penged.test / demo1234demo   (admin@penged.test is made an admin; same password)
import { getPlatformProxy } from 'wrangler';
import { createApp } from '../src/app.js';

const PASSWORD = 'demo1234demo';
const ORIGIN = 'http://localhost:8787';
const reset = process.argv.includes('--reset');

const proxy = await getPlatformProxy({ persist: { path: '.wrangler/state/v3' } });
const env = proxy.env;
const worker = createApp();
const req = (path, init) => worker.request(`${ORIGIN}${path}`, init, env);
const run = (sql, ...p) => env.DB.prepare(sql).bind(...p).run();

async function main() {
  try {
    await env.DB.prepare('SELECT 1 FROM players LIMIT 1').first();
  } catch {
    throw new Error('Tables missing. Run `npm run migrate:local` first.');
  }
  const existing = (await env.DB.prepare('SELECT (SELECT count(*) FROM "user") u, (SELECT count(*) FROM players) p').first());
  if (existing.u || existing.p) {
    if (!reset) throw new Error(`Database already has data (${existing.u} users, ${existing.p} players). Re-run with: npm run seed -- --reset`);
    for (const t of ['players', 'matches', 'challenges', '_guard', 'session', 'account', 'verification', 'avatars', 'guild_requests', 'guild_members', 'guilds', '"user"']) await run(`DELETE FROM ${t}`);
  }

  async function signUp(email, name) {
    const res = await req('/api/auth/sign-up/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ email, password: PASSWORD, name }),
    });
    if (res.status !== 200) throw new Error(`sign-up ${email}: ${res.status} ${await res.text()}`);
    return { cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; '), id: (await res.json()).user.id };
  }
  async function call(who, name, body) {
    const res = await req(`/api/functions/${name}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: who.cookie }, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.status !== 200) throw new Error(`${name}: ${res.status} ${json.error}`);
    return json;
  }

  // Creation order = starting ladder order (Demo starts 4th so it can challenge up).
  const roster = [
    ['ana', 'AnaPark', 'Ana Park'], ['ben', 'BenSpin', 'Ben Spin'], ['cleo', 'CleoSmash', 'Cleo Smash'],
    ['demo', 'Demo', 'Demo Player'], ['dev', 'DevDrop', 'Dev Drop'], ['eli', 'EliLoop', 'Eli Loop'],
  ];
  const P = {};
  for (const [key, username, display_name] of roster) {
    const email = key === 'demo' ? 'demo@penged.test' : `${key}@penged.test`;
    const u = await signUp(email, username);
    P[key] = { ...u, player: (await call(u, 'createPlayer', { username, display_name })).player };
  }
  const admin = await signUp('admin@penged.test', 'Admin');
  await run(`UPDATE "user" SET role = 'admin' WHERE id = ?`, admin.id);

  const side = (...keys) => keys.map((k) => ({ player_id: P[k].player.id }));
  const g = (...pairs) => pairs.map(([a, b]) => ({ a, b }));
  const verified = [];
  async function play(format, target, a, b, games) {
    const { match } = await call(P[a[0]], 'submitMatch', { format, target, side_a: side(...a), side_b: side(...b), games });
    for (const k of [...a.slice(1), ...b]) await call(P[k], 'respondMatch', { match_id: match.id, decision: 'accept' });
    verified.push(match.id);
  }
  await play('singles', 11, ['ben'], ['ana'], g([11, 7], [11, 9]));
  await play('singles', 11, ['cleo'], ['ana'], g([11, 8], [11, 6]));
  await play('singles', 11, ['demo'], ['cleo'], g([11, 9], [8, 11], [11, 7]));
  await play('singles', 21, ['dev'], ['eli'], g([21, 15], [21, 18]));
  await play('singles', 11, ['ben'], ['demo'], g([11, 5], [11, 8]));
  await play('singles', 11, ['demo'], ['ana'], g([11, 7], [11, 9]));
  await play('doubles', 21, ['demo', 'dev'], ['ben', 'cleo'], g([21, 17], [19, 21], [21, 16]));
  // Spread the verified matches over the past ~two weeks so history looks lived-in.
  const day = 86400000;
  for (const [i, id] of verified.entries()) {
    const t = new Date(Date.now() - (verified.length - i) * 2 * day).toISOString();
    await run('UPDATE matches SET created_date = ?, verified_at = ?, updated_date = ? WHERE id = ?', t, t, t, id);
  }
  // One pending match awaiting Demo's confirmation.
  await call(P.ben, 'submitMatch', { format: 'singles', target: 11, side_a: side('ben'), side_b: side('demo'), games: g([11, 9], [11, 9]) });
  // One open challenge: Dev challenges Demo (if the ladder allows it).
  const ranks = Object.fromEntries((await env.DB.prepare('SELECT username, singles_rank r FROM players').all()).results.map((x) => [x.username, x.r]));
  const gap = ranks.DevDrop - ranks.Demo;
  if (gap >= 1 && gap <= 3) await call(P.dev, 'createChallenge', { defender_player_id: P.demo.player.id, message: 'Rematch? Winner takes the spot.' });
  else console.warn('skipped challenge: ladder gap not in 1-3 (', gap, ')');

  const rows = (await env.DB.prepare('SELECT singles_rank r, username, singles_rating s, doubles_rating d, xp, level FROM players ORDER BY singles_rank').all()).results;
  console.table(rows);
  console.log('Seeded. Demo login: demo@penged.test / ' + PASSWORD + ' (admin@penged.test uses the same password)');
}

try {
  await main();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await proxy.dispose();
}
