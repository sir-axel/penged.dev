import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { app, env, dispose, reset, call, mkPlayer as mkUser } from './helpers.js';
import { weekStartIso, MAX_MEMBERS } from '../src/guilds.js';

beforeEach(reset);
afterAll(() => dispose());

const games = [{ a: 11, b: 5 }, { a: 11, b: 0 }];
const play = async (w, l, extra = {}) => {
  const s = await call(w, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: w.player.id }], side_b: [{ player_id: l.player.id }], games, ...extra });
  expect(s.status).toBe(200);
  const r = await call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' });
  expect(r.body.match.status).toBe('verified');
  return r.body.match;
};
// Every user made here, by player id, so a test can act as a guild's leader.
const users = {};
const mkPlayer = async (n) => {
  const u = await mkUser(n);
  users[u.player.id] = u;
  return u;
};
/** Ask to join, then the guild's leader approves. Returns the first failing response, else the approval. */
const join = async (who, guildId) => {
  const rq = await call(who, 'requestJoinGuild', { guild_id: guildId });
  if (rq.status !== 200) return rq;
  const g = await env.DB.prepare('SELECT leader_player_id FROM guilds WHERE id = ?').bind(guildId).first();
  const lead = users[g.leader_player_id];
  const req = (await call(lead, 'getGuild', { guild_id: guildId })).body.requests.find((r) => r.player.id === who.player.id);
  return call(lead, 'respondJoinRequest', { request_id: req.id, decision: 'approve' });
};
const xpOf = (m, p) => m.rating_changes.find((c) => c.player_id === p.player.id).xp_gained;
const mkGuild = async (who, extra = {}) => {
  const r = await call(who, 'createGuild', { name: 'Spin Doctors', tag: 'spn', color: 'blue', ...extra });
  expect(r.status).toBe(200);
  return r.body.guild;
};
const view = async (who, g) => (await call(who, 'getGuild', { guild_id: g.id })).body;
const memberRow = (p) => env.DB.prepare('SELECT * FROM guild_members WHERE player_id = ?').bind(p.player.id).first();
const guildRow = (id) => env.DB.prepare('SELECT * FROM guilds WHERE id = ?').bind(id).first();

describe('guilds', () => {
  it('creates a guild with the creator as leader; names unique case-insensitively, tags unique; one guild per player', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const g = await mkGuild(a, { description: '  Top   spin only  ' });
    expect(g).toMatchObject({ name: 'Spin Doctors', tag: 'SPN', color: 'blue', member_count: 1, leader_player_id: a.player.id, description: 'Top spin only' });
    expect(await memberRow(a)).toMatchObject({ guild_id: g.id, role: 'leader' });

    expect((await call(b, 'createGuild', { name: 'spin DOCTORS', tag: 'ZZ', color: 'red' })).status).toBe(409);
    expect((await call(b, 'createGuild', { name: 'Other One', tag: 'Spn', color: 'red' })).status).toBe(409);
    expect((await call(a, 'createGuild', { name: 'Second Home', tag: 'SH', color: 'red' })).body.error).toMatch(/already in a guild/);
    expect((await call(b, 'createGuild', { name: 'ab', tag: 'AB', color: 'red' })).status).toBe(400);
    expect((await call(b, 'createGuild', { name: 'x'.repeat(25), tag: 'AB', color: 'red' })).status).toBe(400);
    expect((await call(b, 'createGuild', { name: 'Okay Name', tag: 'A', color: 'red' })).status).toBe(400);
    expect((await call(b, 'createGuild', { name: 'Okay Name', tag: 'ABCDE', color: 'red' })).status).toBe(400);
    expect((await call(b, 'createGuild', { name: 'Okay Name', tag: 'AB', color: 'chartreuse' })).status).toBe(400);
    expect((await call(b, 'createGuild', { name: 'Okay Name', tag: 'AB', color: 'red', description: 'x'.repeat(141) })).status).toBe(400);
    expect((await call(null, 'createGuild', { name: 'Okay Name', tag: 'AB', color: 'red' })).status).toBe(401);

    // Joined one guild: cannot create or join another.
    expect((await join(b, g.id)).status).toBe(200);
    expect((await call(b, 'createGuild', { name: 'Okay Name', tag: 'AB', color: 'red' })).status).toBe(409);
  });

  it('joining takes the leader saying yes; capped at MAX_MEMBERS', async () => {
    const lead = await mkPlayer('Leader');
    const g = await mkGuild(lead);
    const others = [];
    for (let i = 0; i < MAX_MEMBERS; i++) others.push(await mkPlayer(`Mem${i}`));
    for (const p of others.slice(0, MAX_MEMBERS - 1)) expect((await join(p, g.id)).status).toBe(200);
    expect((await guildRow(g.id)).member_count).toBe(MAX_MEMBERS);
    // Before the leader says yes, a request is only a request.
    const pending = await mkPlayer('Pending');
    expect((await call(pending, 'requestJoinGuild', { guild_id: g.id })).status).toBe(409); // already full: no point asking
    expect(await memberRow(pending)).toBeNull();
    const full = await join(others[MAX_MEMBERS - 1], g.id);
    expect(full.status).toBe(409);
    expect(full.body.error).toMatch(/full/);
    const v = await view(lead, g);
    expect(v.members).toHaveLength(MAX_MEMBERS);
    expect(v.members[0]).toMatchObject({ role: 'leader', player: { id: lead.player.id } });
  });

  it('two requests approved at once for the last spot: exactly one gets in', async () => {
    const lead = await mkPlayer('Leader');
    const g = await mkGuild(lead);
    for (let i = 0; i < MAX_MEMBERS - 2; i++) await join(await mkPlayer(`Mem${i}`), g.id);
    const [p, q] = [await mkPlayer('Racer1'), await mkPlayer('Racer2')];
    await call(p, 'requestJoinGuild', { guild_id: g.id });
    await call(q, 'requestJoinGuild', { guild_id: g.id });
    const reqs = (await view(lead, g)).requests;
    const res = await Promise.all(reqs.map((r) => call(lead, 'respondJoinRequest', { request_id: r.id, decision: 'approve' })));
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await guildRow(g.id)).member_count).toBe(MAX_MEMBERS);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM guild_members WHERE guild_id = ?').bind(g.id).first()).n).toBe(MAX_MEMBERS);
  });

  it('requests: approve, decline; joining clears other requests', async () => {
    const lead = await mkPlayer('Leader');
    const c = await mkPlayer('Carol');
    const d = await mkPlayer('Dave');
    const other = await mkPlayer('Other');
    const g = await mkGuild(lead, {});
    const g2 = await mkGuild(other, { name: 'Net Cords', tag: 'NET' });

    expect((await call(c, 'requestJoinGuild', { guild_id: g.id })).body).toEqual({ requested: true });
    expect((await call(c, 'requestJoinGuild', { guild_id: g2.id })).status).toBe(200);
    expect((await call(d, 'requestJoinGuild', { guild_id: g.id })).status).toBe(200);
    expect((await view(c, g)).me).toMatchObject({ requested: true, member: false });

    // Only the leader sees and answers requests.
    expect((await view(c, g)).requests).toEqual([]);
    const reqs = (await view(lead, g)).requests;
    expect(reqs.map((r) => r.player.id)).toEqual([c.player.id, d.player.id]);
    expect((await call(c, 'respondJoinRequest', { request_id: reqs[0].id, decision: 'approve' })).status).toBe(403);

    expect((await call(lead, 'respondJoinRequest', { request_id: reqs[0].id, decision: 'approve' })).status).toBe(200);
    expect(await memberRow(c)).toMatchObject({ guild_id: g.id, role: 'member' });
    // Carol's request to the other guild is gone.
    expect((await view(other, g2)).requests).toEqual([]);

    expect((await call(lead, 'respondJoinRequest', { request_id: reqs[1].id, decision: 'decline' })).status).toBe(200);
    expect(await memberRow(d)).toBeNull();
    expect((await view(d, g)).me.requested).toBe(false);
    expect((await guildRow(g.id)).member_count).toBe(2);

  });

  it('approving someone who joined elsewhere fails cleanly', async () => {
    const lead = await mkPlayer('Leader');
    const c = await mkPlayer('Carol');
    const o = await mkPlayer('Opener');
    const g = await mkGuild(lead, {});
    const g2 = await mkGuild(o, { name: 'Open House', tag: 'OPN' });
    await call(c, 'requestJoinGuild', { guild_id: g.id });
    const [rq] = (await view(lead, g)).requests;
    await join(c, g2.id);
    expect((await call(lead, 'respondJoinRequest', { request_id: rq.id, decision: 'approve' })).status).toBe(404);
  });

  it('leader can kick and transfer; members cannot', async () => {
    const lead = await mkPlayer('Leader');
    const b = await mkPlayer('Bobby');
    const c = await mkPlayer('Carol');
    const g = await mkGuild(lead);
    await join(b, g.id);
    await join(c, g.id);

    expect((await call(b, 'kickMember', { guild_id: g.id, player_id: c.player.id })).status).toBe(403);
    expect((await call(lead, 'kickMember', { guild_id: g.id, player_id: lead.player.id })).status).toBe(400);
    expect((await call(lead, 'kickMember', { guild_id: g.id, player_id: c.player.id })).status).toBe(200);
    expect(await memberRow(c)).toBeNull();
    expect((await guildRow(g.id)).member_count).toBe(2);

    expect((await call(b, 'transferLeadership', { guild_id: g.id, player_id: b.player.id })).status).toBe(403);
    expect((await call(lead, 'transferLeadership', { guild_id: g.id, player_id: c.player.id })).status).toBe(404);
    expect((await call(lead, 'transferLeadership', { guild_id: g.id, player_id: b.player.id })).status).toBe(200);
    expect((await guildRow(g.id)).leader_player_id).toBe(b.player.id);
    expect((await memberRow(b)).role).toBe('leader');
    expect((await memberRow(lead)).role).toBe('member');
    // Old leader lost their powers; the new one can edit.
    expect((await call(lead, 'updateGuild', { guild_id: g.id, name: 'Hijack' })).status).toBe(403);
    const up = await call(b, 'updateGuild', { guild_id: g.id, name: 'Loop Gang', tag: 'lg', color: 'pink', description: '' });
    expect(up.body.guild).toMatchObject({ name: 'Loop Gang', tag: 'LG', color: 'pink', description: null });
  });

  it('leader leaving passes the lead to the longest-standing member; last one out deletes the guild', async () => {
    const lead = await mkPlayer('Leader');
    const b = await mkPlayer('Bobby');
    const c = await mkPlayer('Carol');
    const d = await mkPlayer('Dave');
    const g = await mkGuild(lead, {});
    await join(c, g.id);
    await join(b, g.id);
    // Carol joined first, but make the order explicit.
    await env.DB.prepare('UPDATE guild_members SET joined_at = ? WHERE player_id = ?').bind('2026-01-01T00:00:00.000Z', c.player.id).run();
    await env.DB.prepare('UPDATE guild_members SET joined_at = ? WHERE player_id = ?').bind('2026-02-01T00:00:00.000Z', b.player.id).run();
    await call(lead, 'updateGuild', { guild_id: g.id });
    await call(d, 'requestJoinGuild', { guild_id: g.id });

    expect((await call(lead, 'leaveGuild')).body).toEqual({ ok: true, deleted: false });
    expect((await guildRow(g.id))).toMatchObject({ leader_player_id: c.player.id, member_count: 2 });
    expect((await memberRow(c)).role).toBe('leader');

    expect((await call(c, 'leaveGuild')).status).toBe(200);
    expect((await guildRow(g.id)).leader_player_id).toBe(b.player.id);
    expect((await call(b, 'leaveGuild')).body).toEqual({ ok: true, deleted: true });
    expect(await guildRow(g.id)).toBeNull();
    expect((await env.DB.prepare('SELECT count(*) AS n FROM guild_requests').first()).n).toBe(0);
    expect((await call(b, 'leaveGuild')).status).toBe(400);
    // The name is free again.
    expect((await call(b, 'createGuild', { name: 'Spin Doctors', tag: 'SPN', color: 'green' })).status).toBe(200);
  });

  it('weekly score counts only XP earned after joining (ranked and unranked)', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const x = await mkPlayer('Xavier');
    const before = await play(a, x); // Alice is in no guild yet
    const g = await mkGuild(b);
    expect((await join(a, g.id)).status).toBe(200);
    const m2 = await play(a, x);
    const m3 = await play(x, b, { ranked: false }); // unranked: XP only, still counts
    const old = await play(a, x);
    // Pin the clock: both joined an hour before last week ended; `before` was long before that; `old` was last week.
    const lastWeek = new Date(Date.parse(weekStartIso()) - 3600000).toISOString();
    const joined = new Date(Date.parse(lastWeek) - 3600000).toISOString();
    await env.DB.prepare('UPDATE guild_members SET joined_at = ?').bind(joined).run();
    await env.DB.prepare('UPDATE matches SET verified_at = ? WHERE id = ?').bind('2020-01-01T00:00:00.000Z', before.id).run();
    await env.DB.prepare('UPDATE matches SET verified_at = ? WHERE id = ?').bind(lastWeek, old.id).run();

    const week = xpOf(m2, a) + xpOf(m3, b);
    const v = await view(a, g);
    expect(v.guild.week_xp).toBe(week);
    expect(v.guild.total_xp).toBe(week + xpOf(old, a));
    expect(v.members.find((m) => m.player.id === a.player.id)).toMatchObject({ week_xp: xpOf(m2, a), total_xp: xpOf(m2, a) + xpOf(old, a) });
    expect(v.members.find((m) => m.player.id === b.player.id).week_xp).toBe(xpOf(m3, b));
    expect(xpOf(m3, b)).toBeGreaterThan(0);

    const list = await call(a, 'listGuilds');
    expect(list.body.my_guild_id).toBe(g.id);
    expect(list.body.guilds[0]).toMatchObject({ id: g.id, rank: 1, week_xp: week, member_count: 2 }); // Alice (3 matches) is placed, so she counts in avg_rating
    // Xavier (not in a guild) earns nothing for anyone.
    expect((await call(null, 'guildTags')).body.tags).toEqual({
      [a.player.id]: expect.objectContaining({ guild_id: g.id, tag: 'SPN' }),
      [b.player.id]: expect.objectContaining({ guild_id: g.id, tag: 'SPN' }),
    });
  });

  it('average rating uses members with 5+ singles matches', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const g = await mkGuild(a);
    await join(b, g.id);
    await env.DB.prepare('UPDATE players SET singles_wins = 5, singles_rating = 1500 WHERE id = ?').bind(a.player.id).run();
    await env.DB.prepare('UPDATE players SET singles_wins = 2, singles_rating = 900 WHERE id = ?').bind(b.player.id).run();
    expect((await view(null, g)).guild).toMatchObject({ avg_rating: 1500, rated_members: 1 });
  });

  it('week starts Monday 00:00 America/Chicago', () => {
    // Wed 2026-10-28 15:00 UTC (CDT, UTC-5) -> Mon 2026-10-26 05:00 UTC.
    expect(weekStartIso(Date.parse('2026-10-28T15:00:00Z'))).toBe('2026-10-26T05:00:00.000Z');
    // Mon 2026-11-02 03:00 UTC is still Sunday evening in Chicago -> previous Monday (CDT).
    expect(weekStartIso(Date.parse('2026-11-02T03:00:00Z'))).toBe('2026-10-26T05:00:00.000Z');
    // After the DST switch (CST, UTC-6).
    expect(weekStartIso(Date.parse('2026-11-04T12:00:00Z'))).toBe('2026-11-02T06:00:00.000Z');
    // Week containing the DST switch (Sun 2026-11-01): Monday was CDT.
    expect(weekStartIso(Date.parse('2026-11-01T20:00:00Z'))).toBe('2026-10-26T05:00:00.000Z');
  });

  it('deleting an account removes the membership and hands off or deletes the guild', async () => {
    const a = await mkPlayer('Alice');
    const b = await mkPlayer('Bobby');
    const c = await mkPlayer('Carol');
    const g = await mkGuild(a);
    await join(b, g.id);
    const solo = await mkGuild(c, { name: 'Solo Act', tag: 'SOLO' });
    await call(b, 'leaveGuild');
    await call(b, 'requestJoinGuild', { guild_id: solo.id });
    await join(b, g.id);
    // b's request was cleared on join; re-create one directly to check erasure.
    await env.DB.prepare('INSERT INTO guild_requests (id, guild_id, player_id, created_date) VALUES (?,?,?,?)').bind('rq1', solo.id, b.player.id, new Date().toISOString()).run();

    expect((await call(a, 'deleteAccount', { confirm: 'DELETE' })).status).toBe(200);
    expect(await memberRow(a)).toBeNull();
    expect(await guildRow(g.id)).toMatchObject({ leader_player_id: b.player.id, member_count: 1 });

    expect((await call(b, 'deleteAccount', { confirm: 'DELETE' })).status).toBe(200);
    expect(await guildRow(g.id)).toBeNull();
    expect((await env.DB.prepare('SELECT count(*) AS n FROM guild_requests WHERE player_id = ?').bind(b.player.id).first()).n).toBe(0);

    expect((await call(c, 'deleteAccount', { confirm: 'DELETE' })).status).toBe(200);
    expect(await guildRow(solo.id)).toBeNull();
    expect((await env.DB.prepare('SELECT count(*) AS n FROM guild_members').first()).n).toBe(0);
  });

  it('username changes show up in the guild without any fix-up', async () => {
    const a = await mkPlayer('Alice');
    const g = await mkGuild(a);
    await call(a, 'updatePlayer', { username: 'Alicia', display_name: 'Ali' });
    const v = await view(null, g);
    expect(v.members[0].player).toMatchObject({ username: 'Alicia', display_name: 'Ali' });
  });

  it('guild picture: only an image the leader uploaded; the old one is replaced', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const upload = async (u) => {
      const fd = new FormData();
      fd.append('file', new File([png], 'a.png', { type: 'image/png' }));
      return (await (await app.request('/api/uploads', { method: 'POST', headers: { Cookie: u.cookie }, body: fd })).json()).file_url;
    };
    const lead = await mkPlayer('Leader');
    const b = await mkPlayer('Bobby');
    const mine = await upload(lead);
    const g = await mkGuild(lead, { avatar_url: mine });
    expect(g.avatar_url).toBe(mine);
    expect((await call(lead, 'updateGuild', { guild_id: g.id, avatar_url: await upload(b) })).status).toBe(400); // someone else's file
    expect((await call(lead, 'updateGuild', { guild_id: g.id, avatar_url: 'https://evil.test/x.png' })).status).toBe(400);
    const next = await upload(lead);
    expect((await call(lead, 'updateGuild', { guild_id: g.id, avatar_url: next })).body.guild.avatar_url).toBe(next);
    expect((await env.DB.prepare('SELECT 1 AS x FROM avatars WHERE id = ?').bind(mine.split('/').pop()).first())).toBeNull();
    expect((await call(lead, 'updateGuild', { guild_id: g.id, avatar_url: '' })).body.guild.avatar_url).toBeNull();
  });
});

describe('guild duo', () => {
  it('doubles partners in the same guild each get the guild duo XP (ranked and unranked); others do not', async () => {
    const [a, b, c, d] = [await mkPlayer('Aa1'), await mkPlayer('Bb2'), await mkPlayer('Cc3'), await mkPlayer('Dd4')];
    const g = await mkGuild(a);
    expect((await join(b, g.id)).status).toBe(200);
    const go = async (ranked) => {
      const s = await call(a, 'submitMatch', { format: 'doubles', target: 11, ranked, side_a: [{ player_id: a.player.id }, { player_id: b.player.id }], side_b: [{ player_id: c.player.id }, { player_id: d.player.id }], games });
      let m;
      for (const u of [b, c, d]) m = (await call(u, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match;
      return m;
    };
    for (const ranked of [true, false]) {
      const m = await go(ranked);
      const keys = (p) => m.rating_changes.find((x) => x.player_id === p.player.id).xp_parts.map((x) => x.key);
      expect(keys(a)).toContain('guild_duo');
      expect(keys(b)).toContain('guild_duo');
      expect(keys(c)).not.toContain('guild_duo');
    }
  });
});
