import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { weekdayDeadline, cleanTimeZone } from '../src/weekdays.js';
import { env, dispose, reset, call, mkPlayer, seasoned } from './helpers.js';

const H = 3600000;
const CHI = 'America/Chicago';
const local = (iso, tz = CHI) => new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
const due = (start, tzs = [CHI]) => local(weekdayDeadline(Date.parse(start), 72 * H, tzs));

describe('weekday-only challenge clock', () => {
  it('Mon-Wed starts are a plain 72 hours', () => {
    expect(due('2026-10-26T15:00:00-05:00')).toBe('Thu 15:00');
  });
  it('skips the whole weekend', () => {
    expect(due('2026-10-29T07:00:00-05:00')).toBe('Tue 07:00'); // Thu 7am: Thu 17h + Fri 24h + Mon 24h + Tue 7h
    expect(due('2026-10-30T23:00:00-05:00')).toBe('Wed 23:00'); // Fri 11pm: 1h Fri, then Mon/Tue/Wed
  });
  it('a challenge sent on the weekend starts on Monday 00:00 (across the DST change)', () => {
    expect(due('2026-10-31T12:00:00-05:00')).toBe('Thu 00:00');
    expect(due('2026-11-01T22:00:00-06:00')).toBe('Thu 00:00');
  });
  it('different cities: the clock runs only while it is a weekday for both', () => {
    // New York's weekend starts at 11pm Friday Houston time and ends 11pm Sunday: one Friday hour is lost.
    expect(due('2026-10-29T07:00:00-05:00', [CHI, 'America/New_York'])).toBe('Tue 08:00');
    // Tokyo's Saturday starts Friday 10am Houston time (14h ahead): 2 Friday hours, then Mon-Wed.
    expect(due('2026-10-30T08:00:00-05:00', [CHI, 'Asia/Tokyo'])).toBe('Wed 22:00');
  });
  it('bad zones fall back to Houston time', () => {
    expect(cleanTimeZone('Not/AZone')).toBeNull();
    expect(cleanTimeZone('America/Los_Angeles')).toBe('America/Los_Angeles');
    expect(due('2026-10-29T07:00:00-05:00', ['nope'])).toBe('Tue 07:00');
  });
});

describe('challenge deadlines use both players\' zones', () => {
  beforeEach(reset);
  afterAll(() => dispose());
  it('setTimezone validates and is stored; createChallenge sets a weekday deadline', async () => {
    const a = await mkPlayer('Aa1');
    const b = await mkPlayer('Bb2');
    await seasoned(a, b);
    expect((await call(b, 'setTimezone', { timezone: 'Mars/Base' })).status).toBe(400);
    expect((await call(b, 'setTimezone', { timezone: 'Asia/Tokyo' })).body.timezone).toBe('Asia/Tokyo');
    const row = await env.DB.prepare('SELECT timezone FROM players WHERE id = ?').bind(b.player.id).first();
    expect(row.timezone).toBe('Asia/Tokyo');
    const ch = (await call(b, 'createChallenge', { defender_player_id: a.player.id })).body.challenge;
    const expected = weekdayDeadline(Date.parse(ch.created_date), 72 * H, [CHI, 'Asia/Tokyo']);
    expect(ch.expires_at).toBe(expected);
    expect(Date.parse(ch.expires_at) - Date.parse(ch.created_date)).toBeGreaterThanOrEqual(72 * H);
  });
});
