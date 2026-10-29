// Scenario simulation: CURRENT (src/rating.js) vs GLICKO2+ candidates (scripts/rating-glicko.js), and CURRENT tunings.
// Every system replays the SAME generated schedule per seed (common random numbers): the world (who plays whom, scores)
// never depends on ratings, so differences are purely the rating rules.
// Run via: node scripts/simulate.js --scenarios [--seeds 100] [--out ../../penged-qa/elo-glicko.md] [--systems a,b]
import { rateMatch, expectedScore, paddleEdge, REPEAT_WINDOW_DAYS } from './rating-elo.js';
import { rateMatchGlicko, predictGlicko, DEFAULTS as G2 } from './rating-glicko.js';
import { rateMatch as rateShipped, predictGame, RD_START, VOL_START } from '../src/rating.js';

// ---------------- helpers ----------------
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
function ranksOf(vals) { const idx = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); const r = []; idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; }
function spearman(a, b) { const ra = ranksOf(a), rb = ranksOf(b); const n = a.length; return 1 - (6 * ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0)) / (n * (n * n - 1)); }
const ll = (p, won) => -Math.log(Math.max(1e-6, Math.min(1 - 1e-6, won ? p : 1 - p)));
const bestOfProb = (g, n) => (n === 1 ? g : n === 3 ? g * g * (3 - 2 * g) : g ** 3 * (10 - 15 * g + 6 * g * g));

// ---------------- world model ----------------
const SKILL_SCALE = 1500; // per-rally win prob = 1 / (1 + 10^(-skillDiff / 1500))
const rallyP = (d) => 1 / (1 + Math.pow(10, -d / SKILL_SCALE));
/** P(win a game to `target`, win by two) from per-rally win prob q (exact DP). */
function gameP(q, target = 11) {
  const memo = new Map();
  const deuce = (q * q) / (q * q + (1 - q) * (1 - q));
  const f = (a, b) => {
    if (a >= target - 1 && b >= target - 1 && a === b) return deuce;
    if (a >= target && a - b >= 2) return 1;
    if (b >= target && b - a >= 2) return 0;
    const k = a * 100 + b;
    if (memo.has(k)) return memo.get(k);
    const v = q * f(a + 1, b) + (1 - q) * f(a, b + 1);
    memo.set(k, v);
    return v;
  };
  return f(0, 0);
}
/** Rating-scale equivalent of a true-skill gap (what a perfectly calibrated rating gap would be). */
const eqCache = new Map();
export function ratingEq(d) {
  const k = Math.round(d);
  if (!eqCache.has(k)) { const p = gameP(rallyP(k), 11); eqCache.set(k, 400 * Math.log10(p / (1 - p))); }
  return eqCache.get(k);
}
function playGame(r, q, target) {
  let a = 0, b = 0;
  while (!((a >= target || b >= target) && Math.abs(a - b) >= 2)) { if (r() < q) a++; else b++; }
  return { a, b };
}
function playMatch(r, q, target, bestOf) {
  const need = Math.ceil(bestOf / 2); const games = []; let wa = 0, wb = 0;
  while (wa < need && wb < need) { const g = playGame(r, q, target); games.push(g); if (g.a > g.b) wa++; else wb++; }
  return { games, winner: wa > wb ? 'a' : 'b' };
}

// ---------------- scenarios ----------------
export const SCENARIOS = {
  static: { title: '1 Static skills', N: 16, days: 300, matches: 600, randomBreaks: true },
  evolving: { title: '2 Evolving skills (learning curve + drift)', N: 16, days: 300, matches: 600, randomBreaks: true, evolving: true },
  jump: { title: '3 Sudden improvement (2 players +200 at day 150)', N: 16, days: 300, matches: 600, events: [{ day: 150, count: 2, change: 200 }] },
  slump: { title: '4 Slump (2 players -150 at day 150)', N: 16, days: 300, matches: 600, events: [{ day: 150, count: 2, change: -150 }] },
  break: { title: '5 Break (4 players away 30-60 days from day 120; 2 return +/-150, 2 unchanged)', N: 16, days: 300, matches: 600, breakStudy: true },
  daily: { title: '6 Small daily group (8 players, ~6 matches/day, heavy repeats)', N: 8, days: 120, matches: 720, repeatBias: 0.5 },
  campers: { title: '7 Rotators vs campers (7 campers in fixed groups, 9 rotators)', N: 16, days: 300, matches: 600, campers: true },
};

/** Builds one seeded world: the full schedule with scores and every player's true skill at each match. */
export function makeWorld(name, seed, { paddleEffect = 50 } = {}) {
  const sc = SCENARIOS[name];
  const r = rng(seed);
  const { N, days, matches } = sc;
  const base = Array.from({ length: N }, () => 1500 + 200 * gauss(r));
  const visible = base.map((s) => s + 150 * gauss(r));
  const drift = Array(N).fill(0);
  const played = Array(N).fill(0);
  const shift = Array(N).fill(0);
  const breaks = Array.from({ length: N }, () => []);
  const events = []; // { player, day, change }
  if (sc.randomBreaks) for (let i = 0; i < N; i++) for (let k = Math.floor(r() * 3); k > 0; k--) { const s = r() * days; breaks[i].push([s, s + 25 + r() * 70]); }
  if (sc.events) for (const ev of sc.events) {
    const pool = [...Array(N).keys()];
    for (let c = 0; c < ev.count; c++) { const p = pool.splice(Math.floor(r() * pool.length), 1)[0]; events.push({ player: p, day: ev.day, change: ev.change }); }
  }
  const breakInfo = [];
  if (sc.breakStudy) {
    const pool = [...Array(N).keys()];
    const changes = [150, -150, 0, 0];
    for (const change of changes) {
      const p = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const len = 30 + r() * 30;
      breaks[p].push([120, 120 + len]);
      breakInfo.push({ player: p, from: 120, to: 120 + len, change });
      if (change) events.push({ player: p, day: 120 + len - 0.01, change });
    }
  }
  // campers: groups of mismatched players (a strong player stuck with weaker ones, the farming worry)
  const camperGroup = Array(N).fill(-1);
  const groups = [];
  if (sc.campers) {
    const order = [...Array(N).keys()].sort((a, b) => base[b] - base[a]);
    const defs = [[1, 9], [4, 12], [2, 7, 14]]; // ranks: 2 one-partner pairs, 1 triangle (2 partners each)
    defs.forEach((ranks, gi) => { const g = ranks.map((k) => order[k]); groups.push(g); for (const p of g) camperGroup[p] = gi; });
  }
  const away = (i, t) => breaks[i].some(([a, b]) => t >= a && t <= b);
  const skillOf = (i) => base[i] + shift[i] + (sc.evolving ? 80 * (1 - Math.exp(-played[i] / 15)) + drift[i] : 0);
  const lastOpp = Array(N).fill(-1);
  const dt = days / matches;
  const out = [];
  const pending = [...events].sort((a, b) => a.day - b.day);
  for (let k = 0; k < matches; k++) {
    const t = k * dt;
    while (pending.length && pending[0].day <= t) { const ev = pending.shift(); shift[ev.player] += ev.change; ev.k = k; }
    if (sc.evolving) for (let i = 0; i < N; i++) drift[i] += 1.5 * Math.sqrt(dt) * gauss(r);
    const avail = [...Array(N).keys()].filter((i) => !away(i, t));
    if (avail.length < 2) continue;
    const i = avail[Math.floor(r() * avail.length)];
    let j = -1;
    if (sc.campers && camperGroup[i] >= 0 && r() < 0.9) {
      const mates = groups[camperGroup[i]].filter((x) => x !== i && avail.includes(x));
      if (mates.length) j = mates[Math.floor(r() * mates.length)];
    } else if (sc.campers && camperGroup[i] < 0 && r() < 0.9) {
      const rot = avail.filter((x) => x !== i && camperGroup[x] < 0);
      if (rot.length) j = rot[Math.floor(r() * rot.length)];
    }
    if (j < 0 && sc.repeatBias && lastOpp[i] >= 0 && avail.includes(lastOpp[i]) && r() < sc.repeatBias) j = lastOpp[i];
    if (j < 0) {
      const wts = avail.filter((x) => x !== i).map((x) => ({ x, w: Math.exp(-Math.abs(visible[i] - visible[x]) / 120) }));
      let z = r() * wts.reduce((s, o) => s + o.w, 0); j = wts[0].x;
      for (const o of wts) { z -= o.w; if (z <= 0) { j = o.x; break; } }
    }
    const pi = r() < 0.3 ? 'modded' : 'default', pj = r() < 0.3 ? 'modded' : 'default';
    const skills = base.map((_, x) => skillOf(x));
    const trueDiff = skills[i] - skills[j] + (pi === 'modded' ? paddleEffect : 0) - (pj === 'modded' ? paddleEffect : 0);
    const target = r() < 0.12 ? 21 : 11;
    const bestOf = r() < 0.2 ? 5 : r() < 0.15 ? 1 : 3;
    const m = playMatch(r, rallyP(trueDiff), target, bestOf);
    out.push({ k: out.length, t, i, j, pi, pj, target, bestOf, games: m.games, winner: m.winner, skills });
    lastOpp[i] = j; lastOpp[j] = i;
    played[i]++; played[j]++;
  }
  const finalSkills = base.map((_, x) => skillOf(x));
  return { name, sc, N, schedule: out, finalSkills, events: events.filter((e) => e.k != null), breakInfo, groups, camperGroup };
}

// ---------------- systems ----------------
/** CURRENT = src/rating.js; opts: { scale, decay, halfLife } override the tunables the sim can reach. */
export const PICK = { volMode: 'momentum', scale: 0.5, formAlpha: 0.06, formFree: 0.12, volGain: 4 };
// BASELINE = src/rating.js as committed before this study (3-day half-life; K decay 30 games; rust x1.5 max, 120-day ramp, game 1 only).
export const BASELINE = { kind: 'cur', decay: 30, rustFirstGameOnly: true, rustMax: 0.5, rustRamp2: 120 };
export const SYSTEMS = {
  CURRENT: BASELINE,
  'TUNED Elo': { kind: 'cur', novel: true },
  'G2 s.6': { kind: 'g2', cfg: { scale: 0.6 } },
  'G2 s.6 + momentum': { kind: 'g2', cfg: { ...PICK, scale: 0.6 } },
  'SHIPPED': { kind: 'ship' },
  'SHIPPED no close-loss credit': { kind: 'ship', closeCredit: false },
};

function runSystem(sys, world) {
  const { N, schedule } = world;
  const hl = sys.halfLife ?? 3;
  const meetW = (d) => Math.pow(0.5, Math.max(0, d) / hl);
  const cfg = { ...G2, ...(sys.cfg || {}) };
  const st = {
    form: Array(N).fill(0), r: Array(N).fill(1400), rd: Array(N).fill(cfg.rd0), vol: Array(N).fill(cfg.vol0), last: Array(N).fill(null),
    gp: Array(N).fill(0), mp: Array(N).fill(0),
  };
  const pairs = new Map();
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const BURN = Math.round(schedule.length / 6);
  const EARLY = Math.round((world.N * 19) / 2);
  const gamePred = [], matchPred = [];
  let sig = 0, noi = 0, early = null, moves = 0;
  // catch-up tracking
  const evByPlayer = new Map(world.events.map((e) => [e.player, { ...e, series: [], gamesSeries: [], D0: null, games: 0 }]));
  const retStable = new Map(world.breakInfo.filter((b) => !b.change).map((b) => [b.player, { ...b, pre: [], post: [] }]));
  const absErr = [];
  for (const m of schedule) {
    if (m.k === EARLY) early = spearman(st.r, m.skills);
    const { i, j, t } = m;
    const pk = key(i, j);
    const hist = (pairs.get(pk) || []).filter((x) => t - x <= REPEAT_WINDOW_DAYS);
    const wgt = hist.reduce((s, x) => s + meetW(t - x), 0);
    const daysSinceMet = hist.length ? t - hist[hist.length - 1] : null;
    const meanR = mean(st.r), meanS = mean(m.skills);
    const fair = (x) => meanR + ratingEq(m.skills[x] - meanS);
    const eA = paddleEdge([m.pi]), eB = paddleEdge([m.pj]);
    const dsl = (x) => (st.last[x] == null ? null : t - st.last[x]);
    const parts = [
      { id: i, side: 'a', rating: st.r[i], rd: st.rd[i], vol: st.vol[i], form: st.form[i], paddle: m.pi, gamesPlayed: st.gp[i], earlierMeetings: wgt, daysSinceLast: dsl(i), daysSinceMet },
      { id: j, side: 'b', rating: st.r[j], rd: st.rd[j], vol: st.vol[j], form: st.form[j], paddle: m.pj, gamesPlayed: st.gp[j], earlierMeetings: wgt, daysSinceLast: dsl(j), daysSinceMet },
    ];
    let res;
    if (sys.kind === 'cur') {
      // sys.rustRamp emulates a faster rust ramp (src: RUST_RAMP_DAYS 120) by stretching days-away past the free period
      const novel = !!sys.novel && (daysSinceMet == null || daysSinceMet >= 30);
      const cparts = (sys.rustRamp ? parts.map((p) => ({ ...p, daysSinceLast: p.daysSinceLast == null ? null : (p.daysSinceLast <= 21 ? p.daysSinceLast : 21 + ((p.daysSinceLast - 21) * 120) / sys.rustRamp) })) : parts).map((p) => ({ ...p, novel }));
      res = rateMatch(cparts, m.winner, m.games, { target: m.target, gameKScale: sys.scale ?? 0.5, kDecayGames: sys.decay, rustFirstGameOnly: sys.rustFirstGameOnly, rustMax: sys.rustMax, rustRamp: sys.rustRamp2 });
      const p0 = expectedScore(st.r[i] + eA, st.r[j] + eB);
      matchPred.push({ p: bestOfProb(p0, m.bestOf), won: m.winner === 'a', k: m.k });
      res[0].games.forEach((g, gi) => gamePred.push({ p: expectedScore(g.before + eA, res[1].games[gi].before + eB), won: m.games[gi].a > m.games[gi].b, k: m.k }));
    } else if (sys.kind === 'ship') {
      // the production code (src/rating.js): RD/vol per player, new rival x1.1 when not met in 30+ days
      const novel = daysSinceMet == null || daysSinceMet >= 30;
      res = rateShipped(parts.map((p) => ({ ...p, novel })), m.winner, m.games, { target: m.target, closeCredit: sys.closeCredit });
      const p0 = predictGame(st.r[i], res[0].rd_before, st.r[j], res[1].rd_before, eA, eB);
      matchPred.push({ p: bestOfProb(p0, m.bestOf), won: m.winner === 'a', k: m.k });
      res[0].games.forEach((g, gi) => {
        const o = res[1].games[gi];
        gamePred.push({ p: predictGame(g.before, g.rd_before, o.before, o.rd_before, eA, eB), won: m.games[gi].a > m.games[gi].b, k: m.k });
      });
    } else {
      res = rateMatchGlicko(parts, m.winner, m.games, { target: m.target }, cfg);
      // predictive RD includes the idle growth the match itself applies
      const p0 = predictGlicko(st.r[i], res[0].rd_before, st.r[j], res[1].rd_before, eA, eB);
      matchPred.push({ p: bestOfProb(p0, m.bestOf), won: m.winner === 'a', k: m.k });
      res[0].games.forEach((g, gi) => {
        const o = res[1].games[gi];
        gamePred.push({ p: predictGlicko(g.before, g.rd_before, o.before, o.rd_before, eA, eB), won: m.games[gi].a > m.games[gi].b, k: m.k });
      });
    }
    for (const [x, rr] of [[i, res[0]], [j, res[1]]]) {
      const f = fair(x);
      const before = st.r[x], after = rr.after;
      if (m.k >= BURN) {
        const mv = Math.abs(after - before);
        if (Math.abs(after - f) < Math.abs(before - f)) sig += mv; else noi += mv;
        moves++;
      }
      const ev = evByPlayer.get(x);
      if (ev && m.k >= ev.k) {
        const s = Math.sign(ev.change);
        if (ev.D0 == null) ev.D0 = s * (f - before);
        // fair after the match (pool mean moves too)
        const meanAfter = meanR + (after - before + (x === i ? res[1].after - st.r[j] : res[0].after - st.r[i])) / N;
        const fAfter = meanAfter + ratingEq(m.skills[x] - meanS);
        ev.games += m.games.length;
        ev.series.push(s * (fAfter - after));
        ev.gamesSeries.push(ev.games);
      }
      const rs = retStable.get(x);
      if (rs) {
        if (t < rs.from) rs.pre.push(Math.abs(before - f));
        else if (t > rs.to && rs.post.length < 10) rs.post.push(Math.abs(after - f));
      }
      st.r[x] = after;
      if (rr.rd_after != null) { st.rd[x] = rr.rd_after; st.vol[x] = rr.vol_after; st.form[x] = rr.form_after ?? 0; }
      st.last[x] = t; st.gp[x] += m.games.length; st.mp[x]++;
    }
    hist.push(t);
    pairs.set(pk, hist);
    if (m.k >= BURN) absErr.push(Math.abs(st.r[i] - fair(i)), Math.abs(st.r[j] - fair(j)));
  }
  // final
  const fs = world.finalSkills;
  const meanS = mean(fs), meanR = mean(st.r);
  const fairF = fs.map((s) => meanR + ratingEq(s - meanS));
  const rk = ranksOf(fs);
  const gp = gamePred.filter((x) => x.k >= BURN), mp = matchPred.filter((x) => x.k >= BURN);
  const catchUp = [];
  for (const ev of evByPlayer.values()) {
    if (!(ev.D0 > 40)) continue; // pre-existing noise already covered the gap: nothing to catch up
    let hit = null;
    for (let n = 4; n < ev.series.length; n++) {
      const w = ev.series.slice(n - 4, n + 1);
      if (mean(w) <= 0.2 * ev.D0) { hit = { matches: n + 1, games: ev.gamesSeries[n] }; break; }
    }
    catchUp.push(hit || { matches: Infinity, games: Infinity, censored: true });
  }
  const out = {
    gameLL: mean(gp.map((x) => ll(x.p, x.won))),
    matchLL: mean(mp.map((x) => ll(x.p, x.won))),
    spearman: spearman(st.r, fs),
    early,
    rankErr: mean(ranksOf(st.r).map((v, n) => Math.abs(v - rk[n]))),
    absErr: mean(absErr),
    noise: noi / (sig + noi),
    noisePts: noi / moves,
    movePts: (sig + noi) / moves,
    spreadRatio: Math.sqrt(mean(st.r.map((v) => (v - meanR) ** 2))) / Math.sqrt(mean(fairF.map((v) => (v - meanR) ** 2))),
    inflation: meanR - 1400,
    catchUp,
    returnStable: [...retStable.values()].filter((x) => x.pre.length && x.post.length).map((x) => mean(x.post) - mean(x.pre.slice(-10))),
  };
  if (world.groups.length) {
    const bias = st.r.map((v, x) => v - fairF[x]);
    const strong = world.groups.map((g) => g.reduce((a, b) => (fs[a] > fs[b] ? a : b)));
    out.farmStrong = mean(strong.map((x) => bias[x]));
    out.camperAbs = mean(world.groups.flat().map((x) => Math.abs(bias[x])));
    const rot = [...Array(N).keys()].filter((x) => world.camperGroup[x] < 0);
    out.rotatorBias = mean(rot.map((x) => bias[x]));
    out.rotatorAbs = mean(rot.map((x) => Math.abs(bias[x])));
  }
  return out;
}

export function runScenarios({ seeds = 100, systems = SYSTEMS, scenarios = Object.keys(SCENARIOS) } = {}) {
  const res = {};
  for (const sc of scenarios) {
    res[sc] = {};
    const acc = Object.fromEntries(Object.keys(systems).map((n) => [n, []]));
    for (let s = 1; s <= seeds; s++) {
      const world = makeWorld(sc, s * 7919 + sc.length * 31);
      for (const [n, sys] of Object.entries(systems)) acc[n].push(runSystem(sys, world));
    }
    for (const [n, list] of Object.entries(acc)) {
      const agg = {};
      for (const k of ['gameLL', 'matchLL', 'spearman', 'early', 'rankErr', 'absErr', 'noise', 'noisePts', 'movePts', 'spreadRatio', 'inflation', 'farmStrong', 'camperAbs', 'rotatorBias', 'rotatorAbs']) {
        const v = list.map((x) => x[k]).filter((x) => x != null && Number.isFinite(x));
        if (v.length) agg[k] = mean(v);
      }
      const cu = list.flatMap((x) => x.catchUp);
      if (cu.length) {
        agg.catchMatches = median(cu.map((x) => x.matches));
        agg.catchGames = median(cu.map((x) => x.games));
        agg.catchReached = cu.filter((x) => !x.censored).length / cu.length;
      }
      const rs = list.flatMap((x) => x.returnStable);
      if (rs.length) agg.returnStable = mean(rs);
      res[sc][n] = agg;
    }
  }
  return res;
}

const ROWS = [
  ['match log-loss', 'matchLL', 4], ['game log-loss', 'gameLL', 4], ['Spearman final', 'spearman', 3], ['Spearman early (~19 matches each)', 'early', 3],
  ['rank error', 'rankErr', 2], ['mean |rating - fair|', 'absErr', 1], ['noise share of movement', 'noise', 3], ['noise pts per player-match (moves away from fair)', 'noisePts', 2], ['movement pts per player-match', 'movePts', 2], ['rating spread / fair spread', 'spreadRatio', 2], ['pool inflation (mean - 1400)', 'inflation', 1],
  ['catch-up: matches to close 80% (median)', 'catchMatches', 0], ['catch-up: games (median)', 'catchGames', 0], ['catch-up reached', 'catchReached', 2],
  ['unchanged returnee: extra error after return', 'returnStable', 1],
  ['camper farming: strongest camper rating - fair', 'farmStrong', 1], ['campers mean |bias|', 'camperAbs', 1], ['rotators mean bias', 'rotatorBias', 1], ['rotators mean |bias|', 'rotatorAbs', 1],
];
export function tableFor(scRes, names) {
  const fmt = (x, d) => (x == null ? '' : !Number.isFinite(x) ? 'never' : x.toFixed(d));
  let md = `| metric | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|\n`;
  for (const [label, k, d] of ROWS) {
    if (names.every((n) => scRes[n][k] == null)) continue;
    md += `| ${label} | ${names.map((n) => fmt(scRes[n][k], d)).join(' | ')} |\n`;
  }
  return md;
}
