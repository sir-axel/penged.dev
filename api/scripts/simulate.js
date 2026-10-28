// Offline simulation: compares the LEGACY rating rules (pre-paddle-edge, step K) with the current rules in src/rating.js.
// No DB. Usage: node scripts/simulate.js [--seeds 200] [--matches 600] [--paddle-effect 0|50] [--out path.md]
// --rating <path> swaps in an alternative copy of rating.js (used to ablate/tune constants without touching src).
const ratingPath = (() => { const i = process.argv.indexOf('--rating'); return i > 0 ? process.argv[i + 1] : '../src/rating.js'; })();
const { rateMatch: rateNew, expectedScore, paddleEdge, meetingWeight, REPEAT_WINDOW_DAYS } = await import(ratingPath);
import { writeFileSync } from 'node:fs';

// ---------------- legacy (verbatim behaviour of the committed rating.js before this work) ----------------
const legacy = (() => {
  const kFactor = (n) => (n < 10 ? 48 : n < 30 ? 32 : 24);
  const repeatFactor = (m) => 1 / (1 + 0.75 * Math.max(0, m));
  const mov = (d) => 0.75 + 1.25 * Math.sqrt(Math.max(0, Math.min(1, d)));
  const ac = (w, l) => { const den = 2.2 + 0.001 * (w - l); return den <= 0 ? 1.6 : Math.max(0.6, Math.min(1.6, 2.2 / den)); };
  function computeDelta({ rating, oppRating, matchesPlayed, won, earlierMeetings, dominance }) {
    if (earlierMeetings >= 6) return { delta: 0 };
    const expected = expectedScore(rating, oppRating);
    const raw = kFactor(matchesPlayed) * ((won ? 1 : 0) - expected) * repeatFactor(earlierMeetings) * mov(dominance)
      * (won ? ac(rating, oppRating) : ac(oppRating, rating));
    let d = Math.sign(raw) * Math.round(Math.abs(raw));
    d = Math.max(-80, Math.min(80, d));
    return { delta: Math.max(700, rating + d) - rating };
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  function rateMatch(parts, winnerSide, dominance) {
    const A = {};
    for (const s of ['a', 'b']) A[s] = avg(parts.filter((p) => p.side === s).map((p) => p.rating));
    return parts.map((p) => ({ id: p.id, delta: computeDelta({
      rating: A[p.side], oppRating: A[p.side === 'a' ? 'b' : 'a'], matchesPlayed: p.matchesPlayed, won: p.side === winnerSide,
      earlierMeetings: p.earlierMeetings, dominance }).delta }));
  }
  return { rateMatch };
})();

// ---------------- helpers ----------------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
function ranksOf(vals) { const idx = vals.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]); const r = []; idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; }
function spearman(a, b) { const ra = ranksOf(a), rb = ranksOf(b); const n = a.length; return 1 - (6 * ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0)) / (n * (n * n - 1)); }

/** Play a game to `target` (win by 2) with per-rally prob q for A. */
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

// ---------------- one world ----------------
const SYSTEMS = ['L', 'W', 'N']; // legacy / new / new with the paddle edge switched off (isolates the paddle term)
function runSeed(seed, { matches, players: N = 16, paddleEffect, days = 300, evolving, cfg }) {
  const r = rng(seed);
  const base = Array.from({ length: N }, () => 1500 + 200 * gauss(r));
  const drift = Array(N).fill(0);
  const played = Array(N).fill(0);
  // evolving world: people improve with play (learning curve, up to +80) and wander (random walk ~ +-25 over the season)
  const skillOf = (i) => base[i] + (evolving ? 80 * (1 - Math.exp(-played[i] / 15)) + drift[i] : 0);
  const visible = base.map((s) => s + 150 * gauss(r)); // pairing order proxy (what people think of each other)
  const breaks = base.map(() => Array.from({ length: Math.floor(r() * 3) }, () => { const s = r() * days; return [s, s + 25 + r() * 70]; }));
  const away = (i, t) => breaks[i].some(([a, b]) => t >= a && t <= b);
  const paddleOf = () => (r() < 0.3 ? 'modded' : 'default');
  const mkState = () => ({ rating: Array(N).fill(1400), gp: Array(N).fill(0), last: Array(N).fill(null), hist: [], pred: [], ad: [] });
  const S = { L: mkState(), W: mkState(), N: mkState() };
  const dt = days / matches;

  for (let k = 0; k < matches; k++) {
    const t = k * dt;
    if (evolving) for (let i = 0; i < N; i++) drift[i] += 1.5 * Math.sqrt(dt) * gauss(r);
    const avail = [...Array(N).keys()].filter((i) => !away(i, t));
    if (avail.length < 2) continue;
    const i = avail[Math.floor(r() * avail.length)];
    const wts = avail.filter((j) => j !== i).map((j) => ({ j, w: Math.exp(-Math.abs(visible[i] - visible[j]) / 120) }));
    let x = r() * wts.reduce((s, o) => s + o.w, 0); let j = wts[0].j;
    for (const o of wts) { x -= o.w; if (x <= 0) { j = o.j; break; } }
    const pi = paddleOf(), pj = paddleOf();
    const trueDiff = skillOf(i) - skillOf(j) + (pi === 'modded' ? paddleEffect : 0) - (pj === 'modded' ? paddleEffect : 0);
    const q = 1 / (1 + Math.pow(10, -trueDiff / 1500));
    const target = r() < 0.12 ? 21 : 11;
    const bestOf = r() < 0.2 ? 5 : r() < 0.15 ? 1 : 3;
    const m = playMatch(r, q, target, bestOf);
    const dom = (() => { let w = 0, l = 0; for (const g of m.games) { if (m.winner === 'a') { w += g.a; l += g.b; } else { w += g.b; l += g.a; } } return (w - l) / (w + l); })();
    const aWon = m.winner === 'a';

    for (const sys of SYSTEMS) {
      const st = S[sys];
      const ms = st.hist.filter((h) => ((h.i === i && h.j === j) || (h.i === j && h.j === i)) && t - h.t <= REPEAT_WINDOW_DAYS);
      if (sys === 'L') {
        const p = expectedScore(st.rating[i], st.rating[j]);
        st.pred.push({ p, aWon, k });
        const res = legacy.rateMatch([
          { id: i, side: 'a', rating: st.rating[i], matchesPlayed: st.gp[i], earlierMeetings: ms.length },
          { id: j, side: 'b', rating: st.rating[j], matchesPlayed: st.gp[j], earlierMeetings: ms.length }], m.winner, dom);
        st.rating[i] += res[0].delta; st.rating[j] += res[1].delta;
        st.ad.push({ d: Math.abs(res[0].delta), k });
      } else {
        const wgt = ms.reduce((s, h) => s + meetingWeight(t - h.t), 0);
        const dsl = (y) => (st.last[y] == null ? null : t - st.last[y]);
        const usePad = sys === 'W';
        const parts = [
          { id: i, side: 'a', rating: st.rating[i], matchesPlayed: st.gp[i], earlierMeetings: wgt, paddle: usePad ? pi : 'default', daysSinceLast: dsl(i) },
          { id: j, side: 'b', rating: st.rating[j], matchesPlayed: st.gp[j], earlierMeetings: wgt, paddle: usePad ? pj : 'default', daysSinceLast: dsl(j) }];
        const p = expectedScore(st.rating[i] + paddleEdge([parts[0].paddle]), st.rating[j] + paddleEdge([parts[1].paddle]));
        st.pred.push({ p, aWon, k });
        const res = rateNew(parts, m.winner, m.games, { target, ...cfg });
        st.rating[i] = res[0].after; st.rating[j] = res[1].after; st.last[i] = t; st.last[j] = t;
        st.ad.push({ d: Math.abs(res[0].delta), k });
      }
      st.gp[i]++; st.gp[j]++; st.hist.push({ i, j, t });
    }
    played[i]++; played[j]++;
  }
  const BURN = 100; // ignore the first matches when scoring predictions (everyone is still 1400)
  const finalSkill = base.map((_, i) => skillOf(i));
  const score = (st) => {
    const ev = st.pred.filter((x) => x.k >= BURN);
    const rk = ranksOf(finalSkill);
    return {
      logloss: mean(ev.map((x) => -Math.log(Math.max(1e-6, x.aWon ? x.p : 1 - x.p)))),
      brier: mean(ev.map((x) => (x.p - (x.aWon ? 1 : 0)) ** 2)),
      spearman: spearman(st.rating, finalSkill),
      rankErr: mean(ranksOf(st.rating).map((v, n) => Math.abs(v - rk[n]))),
      volatility: mean(st.ad.filter((x) => x.k >= matches / 2).map((x) => x.d)),
      ratingSpread: std(st.rating),
    };
  };
  return { L: score(S.L), W: score(S.W), N: score(S.N) };
}

// ---------------- driver ----------------
export function simulate({ seeds = 200, matches = 600, paddleEffect = 0, evolving = false, cfg = {} } = {}) {
  const acc = { L: {}, W: {}, N: {} };
  for (let s = 1; s <= seeds; s++) {
    const out = runSeed(s * 7919, { matches, paddleEffect, evolving, cfg });
    for (const sys of SYSTEMS) for (const [k, v] of Object.entries(out[sys])) (acc[sys][k] ||= []).push(v);
  }
  const m = {};
  for (const sys of SYSTEMS) { m[sys] = {}; for (const k of Object.keys(acc[sys])) m[sys][k] = mean(acc[sys][k]); }
  const better = { logloss: -1, brier: -1, spearman: 1, rankErr: -1 };
  m.winRate = {};
  for (const k of Object.keys(better)) m.winRate[k] = mean(acc.L[k].map((l, i) => ((acc.W[k][i] - l) * better[k] > 0 ? 1 : 0)));
  return m;
}

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
if (process.argv[1] && process.argv[1].endsWith('simulate.js')) {
  const seeds = +arg('seeds', 200), matches = +arg('matches', 600), out = arg('out', null);
  const f = (x, d = 4) => x.toFixed(d);
  let md = `# Elo simulation: legacy vs new rules\n\n${seeds} seeds x ${matches} matches over 300 days, 16 players, base skill ~ N(1500, 200), singles, rally-by-rally scoring\n(per-rally win prob from the skill gap), ~12% target-21, best-of-1/3/5 mix, 30% of games played with a paid paddle (random, independent of skill),\n0-2 long breaks (25-95 days) per player, opponents chosen mostly from nearby visible rank.\nColumns: legacy = rules before this work; new = current src/rating.js; new, no paddle = same but paddle edge switched off (isolates every other change).\nPrediction metrics skip the first 100 matches. Lower is better for log-loss, Brier, rank error, volatility; higher for Spearman.\nRegenerate: node api/scripts/simulate.js --seeds 200 --out ../penged-qa/elo-sim.md\n\n`;
  for (const evolving of [false, true]) for (const pe of [0, 50]) {
    const m = simulate({ seeds, matches, paddleEffect: pe, evolving });
    md += `## ${evolving ? 'Evolving skills (learning curve +80 over first ~45 games, drift)' : 'Static skills'}; paid paddle truly worth ${pe}\n\n| metric | legacy | new | new, no paddle | new beats legacy (% seeds) |\n|---|---|---|---|---|\n`;
    const rows = [['log-loss', 'logloss', 4], ['Brier', 'brier', 4], ['Spearman (final rating vs true skill)', 'spearman', 4], ['mean abs rank error (of 16)', 'rankErr', 3], ['volatility: mean abs delta, 2nd half', 'volatility', 2], ['rating spread (std)', 'ratingSpread', 1]];
    for (const [label, k, d] of rows) md += `| ${label} | ${f(m.L[k], d)} | ${f(m.W[k], d)} | ${f(m.N[k], d)} | ${m.winRate[k] != null ? f(m.winRate[k] * 100, 0) + '%' : '-'} |\n`;
    md += '\n';
  }
  if (out) writeFileSync(out, md);
  console.log(md);
}
