// Migration 0016 backfill on a seeded DB: the SQL gives exactly backfillRd(games) per format, dates the RD at the last
// verified match, leaves ratings alone, and new players get the column defaults.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import { env, dispose, reset, mkPlayer, get } from './helpers.js';
import { backfillRd, currentRd } from '../src/rating.js';

beforeEach(reset);
afterAll(() => dispose());
const sql = (q, ...p) => env.DB.prepare(q).bind(...p).run();
const UPDATE = fs.readFileSync(new URL('../migrations/0016_glicko.sql', import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.startsWith('--')).join('\n')
  .split(';').map((x) => x.trim()).find((x) => x.startsWith('UPDATE players'));

describe('0016_glicko backfill', () => {
  it('new players get RD 200, sigma 0.06, no RD date', async () => {
    const a = await mkPlayer('Aa1');
    expect((await get('/api/entities/Player/' + a.player.id)).body).toMatchObject({
      singles_rd: 200, singles_vol: 0.06, singles_rd_at: null, doubles_rd: 200, doubles_vol: 0.06, doubles_rd_at: null,
    });
  });
  it('per format: RD from games played, dated at the last verified match; ratings unchanged', async () => {
    const seeded = [
      ['Aa1', 0, 0, null, 0, 0, null],
      ['Bb2', 3, 2, '2026-10-01T10:00:00.000Z', 0, 1, '2026-09-01T10:00:00.000Z'],
      ['Cc3', 12, 8, '2026-10-20T10:00:00.000Z', 30, 25, '2026-10-27T10:00:00.000Z'],
      ['Dd4', 200, 150, '2026-06-01T10:00:00.000Z', 2, 2, '2026-10-25T10:00:00.000Z'],
    ];
    const ps = [];
    for (const [name, sw, sl, sv, dw, dl, dv] of seeded) {
      const p = await mkPlayer(name);
      await sql(`UPDATE players SET singles_game_wins = ?, singles_game_losses = ?, singles_last_verified_at = ?, doubles_game_wins = ?,
        doubles_game_losses = ?, doubles_last_verified_at = ?, singles_rating = ?, singles_rd = 1, doubles_rd = 1 WHERE id = ?`,
      sw, sl, sv, dw, dl, dv, 1300 + ps.length * 77, p.player.id);
      ps.push({ p, sg: sw + sl, dg: dw + dl, sv, dv, rating: 1300 + ps.length * 77 });
    }
    expect(UPDATE).toContain('sqrt');
    await sql(UPDATE);
    for (const x of ps) {
      const row = (await get('/api/entities/Player/' + x.p.player.id)).body;
      expect(row.singles_rd).toBeCloseTo(backfillRd(x.sg), 9);
      expect(row.doubles_rd).toBeCloseTo(backfillRd(x.dg), 9);
      expect(row.singles_rd_at).toBe(x.sv);
      expect(row.doubles_rd_at).toBe(x.dv);
      expect(row.singles_rating).toBe(x.rating);
    }
    // current confidence adds the time away since that date
    const d = ps[3];
    const now = Date.parse('2026-10-28T10:00:00.000Z');
    expect(currentRd({ rd: backfillRd(d.sg), vol: 0.06, rdAt: d.sv }, now)).toBeGreaterThan(backfillRd(d.sg) + 50);
  });
});
