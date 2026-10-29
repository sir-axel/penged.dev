// "How ratings work" (web/src/lib/ratingCopy.js, shown on Home and /rules) must describe the SHIPPED rules: every number
// it quotes is checked against api/src/rating.js constants or recomputed with the real rating code.
import { describe, it, expect } from 'vitest';
import * as R from '../src/rating.js';
import { RATING_POINTS, RATING_FORMULA, WORKED_EXAMPLE, XP_POINTS, CHALLENGE_POINTS, MATCHUP_POINTS } from '../../web/src/lib/ratingCopy.js';

const ALL = [...RATING_POINTS, RATING_FORMULA, WORKED_EXAMPLE, ...XP_POINTS, ...CHALLENGE_POINTS].join('\n');
const has = (s) => expect(ALL).toContain(s);
const pl = (id, side, o = {}) => ({ id, side, rating: 1400, rd: 60, vol: 0.06, earlierMeetings: 0, daysSinceLast: 3, matchesPlayed: 25, ...o });
const duel = (a, b, games) => { const r = R.rateMatch([pl('w', 'a', a), pl('l', 'b', b)], 'a', games, { target: 11 }); return { w: r[0], l: r[1] }; };
const steady = (gap) => { let w = 0; for (let d = gap; d <= 180; d += gap) w += R.meetingWeight(d); return w; };
const range = (o, oo = o) => R.stakes({ format: 'singles', target: 11, sides: { a: [pl('a', 'a', o)], b: [pl('b', 'b', oo)] } })[0].win;
const sg = (n) => (n >= 0 ? `+${n}` : `−${-n}`);

describe('explainer quotes the shipped constants', () => {
  it('start, floor, caps', () => {
    has(`starts at ${R.START_RATING}`); has(`below ${R.RATING_FLOOR}`);
    has(`at most ${R.MAX_GAME_DELTA} points`); has(`at most ${R.MAX_DELTA}`);
    expect(RATING_FORMULA).toContain(`max ${R.MAX_GAME_DELTA} per game`);
    expect(RATING_FORMULA).toContain(`never more than ${R.MAX_DELTA}`);
  });
  it('confidence (RD), time away, settling hint, volatility, scale', () => {
    has(`±${R.RD_START} when you are brand new`); has(`never tighter than ±${R.RD_MIN}`);
    has(`±${Math.round(R.rdAfterIdle(R.RD_MIN, R.VOL_START, 30))} after 30 days`);
    has(`±${Math.round(R.rdAfterIdle(R.RD_MIN, R.VOL_START, 60))} after 60`);
    has(`±${R.RD_SETTLING} or wider`); has(`starting at ${R.VOL_START}`);
    expect(RATING_FORMULA).toContain(`${R.RD_START} brand new, at least ${R.RD_MIN}, max ${R.RD_MAX}`);
    expect(RATING_FORMULA).toContain(`change          = ${R.GLICKO_SCALE} *`);
    expect(RATING_FORMULA).toContain(`(${R.VOL_START} x 173.7)`);
  });
  it('every multiplier with its real number', () => {
    has(`×${R.MOV_BASE} to ×${R.movMultiplier(1).toFixed(1)}`);
    has(`up to ×${R.AC_MAX}`); has(`down to ×${R.AC_MIN}`);
    has(`+${R.PADDLE_EDGE} rating`);
    has(`${Math.round((R.EVIDENCE_TARGET_21 - 1) * 100)}% more`); has(`×${R.CHALLENGE_STAKES}`);
    has(`${R.NOVELTY_DAYS}+ days`); has(`×${R.NOVELTY_BONUS} and +${R.XP_NEW_RIVAL} xp`);
    has(`halves every ${R.REPEAT_HALF_LIFE_DAYS} days`); has(`below ×${R.REPEAT_FLOOR.toFixed(2)}`);
    has(`(×${R.repeatFactor(steady(1)).toFixed(2)})`); has(`weekly ×${R.repeatFactor(steady(7)).toFixed(2)}`);
    has(`(×${R.TEAMMATE_MIN} to ×${R.TEAMMATE_MAX})`);
    expect(RATING_FORMULA).toContain(`${R.MOV_BASE} + ${R.MOV_SCALE} * sqrt(dominance)`);
    expect(RATING_FORMULA).toContain(`${R.AC_NUM} / (${R.AC_NUM} + ${R.AC_SLOPE} * (winner - loser))`);
    expect(RATING_FORMULA).toContain(`${R.REPEAT_FLOOR} + ${1 - R.REPEAT_FLOOR} / (1 + ${R.REPEAT_STEP} * meetings)`);
  });
  it('stakes range scores', () => {
    const n = R.STAKES_NARROW[11].map(([a, b]) => `${a}-${b}`).join(', ');
    const d = R.STAKES_DOMINANT[11].map(([a, b]) => `${a}-${b}`).join(', ');
    has(`narrow 2-1 (${n})`); has(`dominant 2-0 (${d})`);
  });
  it('dodge penalties and bounties', async () => {
    const p = (defRd) => R.challengePenalty({ kind: 'expired', defRating: 1400, defRd, chalRating: 1400, rankGap: 1 }).penalty;
    has(`up to ${p(R.RD_START)} for silence between equals, ${p(R.RD_MIN)} at ±${R.RD_MIN} confidence`);
    has(`at least ${R.EXPIRE_MIN} for silence, ${R.DECLINE_MIN} for a decline`);
    const f = R.DODGE_RANK_FACTOR;
    has(`×${f[1]} one place apart, ×${f[2]} two, ×${f[3]} three, ×${f[4]} four or five, ×${f[6]} six or more`);
    expect(f[5]).toBe(f[4]);
    expect(R.DOWN_MULT).toBe(0.5); expect(R.DOWN_CLOSE_GAP).toBeUndefined(); has('declining or not answering costs half the usual amount, with no walkover');
    has('there is no weekly limit on ducking penalties');
    has(`×1 at ${R.DUCK_STANDING_FROM} or below, rising to ×${R.DUCK_STANDING_MAX} at ${R.DUCK_STANDING_FROM + R.DUCK_STANDING_SPAN} and up`);
    const share = (gap) => Math.round(100 * R.expectedPointShare(R.expectedScore(1400 - gap, 1400)));
    has(`about ${share(100)}% against someone 100 above, ${share(300)}% at 300, ${share(450)}% at 450`);
    has(`${R.CLOSE_CREDIT_PER} rating for every whole share of points above that mark, at most +${R.CLOSE_CREDIT_MAX}`);
    has(`at least ${R.CLOSE_TIER_GAP} tiers above you`); has(`at least ${R.CLOSE_GAP_MIN} rating apart`); has(`every match you win gains you at least +${R.MATCH_WIN_MIN}`); has(`+${R.XP_SHOT} xp for losing to someone rated ${R.XP_SHOT_GAP}+ above you`);
    const B = await import('../src/bounty.js');
    has(`#1 ${B.BOUNTY_PODIUM_RATING[1]} rating and ${B.BOUNTY_PODIUM_XP[1]} xp, #2 ${B.BOUNTY_PODIUM_RATING[2]} and ${B.BOUNTY_PODIUM_XP[2]}, #3 ${B.BOUNTY_PODIUM_RATING[3]} and ${B.BOUNTY_PODIUM_XP[3]}`);
    has(`plus ${B.BOUNTY_GAP_RATING} rating and ${B.BOUNTY_GAP_XP} xp for every extra place between you, up to +${B.BOUNTY_GAP_RATING_MAX} and +${B.BOUNTY_GAP_XP_MAX}`);
    has(`${B.BOUNTY_STREAK_MIN}+ win streak`); has(`${B.BOUNTY_STREAK_RATING} rating and ${B.BOUNTY_STREAK_XP} xp per win past 2, up to ${B.BOUNTY_STREAK_RATING_MAX} and ${B.BOUNTY_STREAK_XP_MAX}`);
    has(`up ${B.BOUNTY_RISE_MIN}+ rating in the last ${B.BOUNTY_RISE_DAYS} days`); has(`1 rating per ${B.BOUNTY_RISE_RATING_PER} points risen, up to ${B.BOUNTY_RISE_RATING_MAX}; 1 xp per ${B.BOUNTY_RISE_XP_PER}, up to ${B.BOUNTY_RISE_XP_MAX}`);
    has(`At most ${B.BOUNTY_RATING_MAX} rating and ${B.BOUNTY_XP_MAX} xp`);
    has(`send ${R.CHALLENGES_SENT_PER_WEEK} challenges and receive ${R.CHALLENGES_RECEIVED_PER_WEEK} in any ${R.CHALLENGE_CAP_DAYS} days`);
    has(`earns ${R.WALKOVER_XP} xp`); has(`counts ×${R.CHALLENGE_STAKES} like a singles one`);
  });
});

describe('weekly matchmaking copy quotes the shipped constants', () => {
  it('weights, top pull, back-out and miss costs', async () => {
    const M = await import('../src/matchmaking.js');
    const T = MATCHUP_POINTS.join('\n');
    const at = (s) => expect(T).toContain(s);
    at(`Never played them: +${R.MATCHUP_NEVER_PLAYED}`);
    at(`+${R.MATCHUP_PER_DAY} for every day since you last met, counting at most ${R.MATCHUP_DAYS_CAP} days`);
    at(`in the last ${R.MATCHUP_DODGE_DAYS} days, either way round: +${R.MATCHUP_DODGE} (up to ${R.MATCHUP_DODGE_MAX} count)`);
    expect(R.MATCHUP_TOP_SPAN).toBe(5);
    at(`+${M.topBonus(1)} for #1, ${M.topBonus(2)} for #2, ${M.topBonus(3)} for #3, ${M.topBonus(4)} for #4, ${M.topBonus(5)} for #5`);
    expect(M.topBonus(1)).toBe(R.MATCHUP_TOP_BONUS);
    at(`Last week's pick again: −${R.MATCHUP_REPEAT_PENALTY}`);
    at(`losing ${R.MATCHUP_BACKOUT_MULT}x your max loss (at most ${R.MAX_DELTA})`);
    // max win > max loss: the matched game's loss is scaled by min(1, ratio x win / loss)
    at(`at most ${Math.round(R.MATCHUP_LOSS_RATIO * 100)}% of the max win`);
    at(`min(1, ${R.MATCHUP_LOSS_RATIO} × max win ÷ the full loss)`);
    expect(M.cappedStakes({ max_win: 40, max_loss: 60 })).toEqual({ max_win: 40, max_loss: 30, loss_factor: 0.5 });
    at(`always worth at least +${R.MATCHUP_MIN_WIN} to you`);
    expect(M.cappedStakes({ max_win: 1, max_loss: 60 })).toMatchObject({ max_win: R.MATCHUP_MIN_WIN });
    at(`Decline and you lose your max loss (at most ${R.MAX_DELTA}) right away`);
    expect(M.backoutCost(30, 1500)).toBe(Math.min(R.MAX_DELTA, R.MATCHUP_BACKOUT_MULT * 30));
    at(`lose your max loss (at most ${R.MAX_DELTA})`);
    expect(M.missCost(95, 1500)).toBe(R.MAX_DELTA);
    at(`played as a challenge (×${R.CHALLENGE_STAKES})`);
    at(`the ${R.COOLDOWN_DAYS}-day cooldown`);
    // ratings never enter the score
    expect(M.matchupScore.length).toBe(1);
    expect(String(M.matchupScore)).not.toMatch(/rating/i);
  });
});

describe('worked example is computed from the real code', () => {
  const BLOW = [{ a: 11, b: 2 }, { a: 11, b: 3 }, { a: 11, b: 1 }];
  const NARROW = [{ a: 11, b: 9 }, { a: 9, b: 11 }, { a: 12, b: 10 }];
  const SWEEP = [{ a: 11, b: 5 }, { a: 11, b: 6 }, { a: 11, b: 4 }];
  const GRIND = [{ a: 11, b: 9 }, { a: 8, b: 11 }, { a: 11, b: 9 }];
  const CLOSE = [{ a: 11, b: 9 }, { a: 12, b: 10 }];
  const w = (a, b, g) => duel(a, b, g).w;
  it('1400 beats 1600 and the equal-regulars numbers', () => {
    const b = w({}, { rating: 1600 }, BLOW);
    expect(WORKED_EXAMPLE).toContain(`${b.games.map((g) => sg(g.delta)).join(', ')} = ${sg(b.delta)}, and the loser drops ${b.delta}`);
    const n = w({}, { rating: 1600 }, NARROW);
    expect(WORKED_EXAMPLE).toContain(`${n.games.map((g) => sg(g.delta)).join(', ')} = ${sg(n.delta)}`);
    expect(WORKED_EXAMPLE).toContain(`blowout is ${sg(w({ paddle: 'modded' }, { rating: 1600 }, BLOW).delta)} for the winner`);
    expect(WORKED_EXAMPLE).toContain(`3-0 sweep is ${sg(w({}, {}, SWEEP).delta)}, a 2-1 grind ${sg(w({}, {}, GRIND).delta)}, a close 2-0 ${sg(w({}, {}, CLOSE).delta)}`);
    expect(WORKED_EXAMPLE).toContain(`45 days away the same grind is worth ${sg(w({ daysSinceLast: 45 }, {}, GRIND).delta)}, after 90 days ${sg(w({ daysSinceLast: 90 }, {}, GRIND).delta)}`);
    const nb = duel({ rd: 200, daysSinceLast: null }, {}, GRIND);
    expect(WORKED_EXAMPLE).toContain(`gains ${sg(nb.w.delta)} while the regular drops only ${-nb.l.delta}`);
  });
  it('stakes ranges for two equal regulars', () => {
    const t = (r) => `${sg(r[0])} to ${sg(r[1])}`;
    expect(WORKED_EXAMPLE).toContain(`${t(range({ novel: true }))} against a new rival`);
    expect(WORKED_EXAMPLE).toContain(`${t(range({ earlierMeetings: steady(7) }))} if you meet weekly`);
    expect(WORKED_EXAMPLE).toContain(`${t(range({ earlierMeetings: steady(1), daysSinceLast: 1 }))} if you play every day`);
    expect(WORKED_EXAMPLE).toContain(`${t(range({ earlierMeetings: steady(7), daysSinceLast: 42 }, { earlierMeetings: steady(7) }))} for the one coming back`);
  });
});

describe('no leftovers from the old Elo rules', () => {
  it('no K 48 -> 32, rust or opponent certainty', () => {
    for (const bad of [/\bK\b/, /48 (for a )?brand/i, /toward 32/, /32 seasoned/, /rust/i, /settling opponent/i, /certainty/i, /K-factor/i]) expect(ALL).not.toMatch(bad);
  });
});
