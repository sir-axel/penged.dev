import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import { env, dispose, reset, call, mkPlayer } from './helpers.js';
import * as T from '../src/tiers.js';

beforeEach(reset);
afterAll(() => dispose());
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const games = [{ a: 11, b: 5 }, { a: 11, b: 7 }];

describe('tiers', () => {
  it('web and api copies are identical', () => {
    const web = fs.readFileSync(new URL('../../web/src/lib/tiers.js', import.meta.url), 'utf8');
    const api = fs.readFileSync(new URL('../src/tiers.js', import.meta.url), 'utf8');
    expect(api).toBe(web);
  });
  it('tierFor boundaries', () => {
    const cases = [[700, 'wood'], [1049, 'wood'], [1050, 'iron'], [1199, 'iron'], [1200, 'bronze'], [1349, 'bronze'], [1350, 'silver'], [1449, 'silver'], [1450, 'gold'], [1549, 'gold'], [1550, 'platinum'],
      [1649, 'platinum'], [1650, 'diamond'], [1799, 'diamond'], [1800, 'master'], [1949, 'master'], [1950, 'grandmaster'], [2400, 'grandmaster']];
    for (const [r, k] of cases) expect(T.tierFor(r).key, String(r)).toBe(k);
  });
  it('nextTier and tierChange', () => {
    expect(T.nextTier(1413)).toMatchObject({ pointsToGo: 37, tier: { key: 'gold' } });
    expect(T.nextTier(2000)).toBeNull();
    expect(T.tierChange(1440, 1455)).toEqual({ tier_before: 'silver', tier_after: 'gold' });
    expect(T.tierChange(1460, 1440)).toEqual({ tier_before: 'gold', tier_after: 'silver' });
    expect(T.tierChange(1460, 1480)).toBeNull();
  });
  it('placement until 5 matches', () => {
    expect(T.placementState(3)).toEqual({ placing: true, played: 3, needed: 5 });
    expect(T.placementState(5).placing).toBe(false);
    expect(T.placementState(0).placing).toBe(true);
  });
  const run = async (wRating, lRating, wWins, lLosses) => {
    const w = await mkPlayer('Aa1'), l = await mkPlayer('Bb2');
    // settled regulars (RD 60), so one match moves them a normal amount
    await sql('UPDATE players SET singles_rating = ?, singles_wins = ?, singles_rd = 60 WHERE id = ?', wRating, wWins, w.player.id);
    await sql('UPDATE players SET singles_rating = ?, singles_losses = ?, singles_rd = 60 WHERE id = ?', lRating, lLosses, l.player.id);
    const s = await call(w, 'submitMatch', { format: 'singles', target: 11, side_a: [{ player_id: w.player.id }], side_b: [{ player_id: l.player.id }], games });
    const rc = (await call(l, 'respondMatch', { match_id: s.body.match.id, decision: 'accept' })).body.match.rating_changes;
    return { w: rc.find((x) => x.player_id === w.player.id), l: rc.find((x) => x.player_id === l.player.id) };
  };
  it('sets tier_before/tier_after when a verified match crosses a boundary', async () => {
    const { w, l } = await run(1449, 1450, 10, 10);
    expect(w.after).toBeGreaterThan(1449);
    expect(w).toMatchObject({ tier_before: 'silver', tier_after: 'gold' });
    expect(l).toMatchObject({ tier_before: 'gold', tier_after: 'silver' });
  });
  it('sets no tier fields when not crossing', async () => {
    const { w, l } = await run(1500, 1500, 10, 10);
    expect(w.tier_before).toBeUndefined();
    expect(l.tier_after).toBeUndefined();
  });
  it('sets no tier fields while still in placement', async () => {
    const { w } = await run(1449, 1450, 1, 1);
    expect(w.after).toBeGreaterThanOrEqual(1450);
    expect(w.tier_before).toBeUndefined();
  });
  it('records matches played in the format, including this match, for the placement badge', async () => {
    const { w, l } = await run(1400, 1400, 1, 6);
    expect(w.matches_played).toBe(2);
    expect(l.matches_played).toBe(7);
  });
});
