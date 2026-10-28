// Offline simulation: per-game rating (current src/rating.js) vs the match-level rules it replaced
// (scripts/rating-match-level.js) vs the original legacy rules (step K, no paddle). No DB.
// Usage: node scripts/simulate.js [--seeds 200] [--matches 600] [--out path.md]            full comparison tables
//        node scripts/simulate.js --sweep [--seeds 60]                                      GAME_K_SCALE x K_DECAY_GAMES grid
import { writeFileSync } from 'node:fs';
import { rateMatch as rateGame, expectedScore, paddleEdge, meetingWeight, REPEAT_WINDOW_DAYS, GAME_K_SCALE, K_DECAY_GAMES } from '../src/rating.js';
import { rateMatch as rateOld } from './rating-match-level.js';

// ---------------- original legacy rules (verbatim behaviour before the paddle-edge / smooth-K work) ----------------
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
const ll = (p, won) => -Math.log(Math.max(1e-6, won ? p : 1 - p));
/** P(win a best-of-n) from a per-game win probability. */
const bestOfProb = (g, n) => (n === 1 ? g : n === 3 ? g * g * (3 - 2 * g) : g ** 3 * (10 - 15 * g + 6 * g * g));

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
// Systems: L = original legacy (match), O = match-level rules shipped before this work, G = per-game (src/rating.js with cfg)
const SYSTEMS = ['L', 'O', 'G'];
function runSeed(seed, { matches, players: N = 16, evolving, cfg, paddleEffect = 0, days = 300 }) {
  const r = rng(seed);
  const base = Array.from({ length: N }, () => 1500 + 200 * gauss(r));
  const drift = Array(N).fill(0);
  const played = Array(N).fill(0);
  const skillOf = (i) => base[i] + (evolving ? 80 * (1 - Math.exp(-played[i] / 15)) + drift[i] : 0);
  const visible = base.map((s) => s + 150 * gauss(r));
  const breaks = base.map(() => Array.from({ length: Math.floor(r() * 3) }, () => { const s = r() * days; return [s, s + 25 + r() * 70]; }));
  const away = (i, t) => breaks[i].some(([a, b]) => t >= a && t <= b);
  const paddleOf = () => (r() < 0.3 ? 'modded' : 'default');
  const mkState = () => ({ rating: Array(N).fill(1400), mp: Array(N).fill(0), gp: Array(N).fill(0), last: Array(N).fill(null), hist: [], gamePred: [], matchPred: [], ad: [], early: null });
  const S = { L: mkState(), O: mkState(), G: mkState() };
  const dt = days / matches;
  const EARLY = 150; // matches in (~19 per player): how fast does the ladder find the order?
  const skillAtEarly = { v: null };

  for (let k = 0; k < matches; k++) {
    const t = k * dt;
    if (evolving) for (let i = 0; i < N; i++) drift[i] += 1.5 * Math.sqrt(dt) * gauss(r);
    if (k === EARLY) { skillAtEarly.v = base.map((_, i) => skillOf(i)); for (const sys of SYSTEMS) S[sys].early = spearman(S[sys].rating, skillAtEarly.v); }
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
      const dsl = (y) => (st.last[y] == null ? null : t - st.last[y]);
      if (sys === 'L') {
        const p = expectedScore(st.rating[i], st.rating[j]);
        st.matchPred.push({ p, aWon, k });
        for (const g of m.games) st.gamePred.push({ p, aWon: g.a > g.b, k });
        const res = legacy.rateMatch([
          { id: i, side: 'a', rating: st.rating[i], matchesPlayed: st.mp[i], earlierMeetings: ms.length },
          { id: j, side: 'b', rating: st.rating[j], matchesPlayed: st.mp[j], earlierMeetings: ms.length }], m.winner, dom);
        st.rating[i] += res[0].delta; st.rating[j] += res[1].delta;
        st.ad.push({ d: Math.abs(res[0].delta), k });
      } else {
        const wgt = ms.reduce((s, h) => s + meetingWeight(t - h.t), 0);
        const mk = (id, side, pd) => ({ id, side, rating: st.rating[id], matchesPlayed: st.mp[id], gamesPlayed: st.gp[id], earlierMeetings: wgt, paddle: pd, daysSinceLast: dsl(id) });
        const parts = [mk(i, 'a', pi), mk(j, 'b', pj)];
        const edgeA = paddleEdge([pi]), edgeB = paddleEdge([pj]);
        const p0 = expectedScore(st.rating[i] + edgeA, st.rating[j] + edgeB);
        if (sys === 'O') {
          st.matchPred.push({ p: p0, aWon, k });
          for (const g of m.games) st.gamePred.push({ p: p0, aWon: g.a > g.b, k });
          const res = rateOld(parts, m.winner, m.games, { target });
          st.rating[i] = res[0].after; st.rating[j] = res[1].after;
          st.ad.push({ d: Math.abs(res[0].delta), k });
        } else {
          st.matchPred.push({ p: bestOfProb(p0, bestOf), aWon, k });
          const res = rateGame(parts, m.winner, m.games, { target, gameKScale: cfg.scale, kDecayGames: cfg.decay });
          // per-game predictions use the rating going INTO each game (the sequential state)
          res[0].games.forEach((gm, gi) => {
            const bi = res[1].games[gi].before;
            st.gamePred.push({ p: expectedScore(gm.before + edgeA, bi + edgeB), aWon: m.games[gi].a > m.games[gi].b, k });
          });
          st.rating[i] = res[0].after; st.rating[j] = res[1].after;
          st.ad.push({ d: Math.abs(res[0].delta), k });
        }
        st.last[i] = t; st.last[j] = t;
      }
      st.mp[i]++; st.mp[j]++; st.gp[i] += m.games.length; st.gp[j] += m.games.length;
      st.hist.push({ i, j, t });
    }
    played[i]++; played[j]++;
  }
  const BURN = 100;
  const finalSkill = base.map((_, i) => skillOf(i));
  const score = (st) => {
    const rk = ranksOf(finalSkill);
    const gp = st.gamePred.filter((x) => x.k >= BURN), mp = st.matchPred.filter((x) => x.k >= BURN);
    return {
      gameLL: mean(gp.map((x) => ll(x.p, x.aWon))),
      matchLL: mean(mp.map((x) => ll(x.p, x.aWon))),
      spearman: spearman(st.rating, finalSkill),
      early: st.early,
      rankErr: mean(ranksOf(st.rating).map((v, n) => Math.abs(v - rk[n]))),
      volatility: mean(st.ad.filter((x) => x.k >= matches / 2).map((x) => x.d)),
      spread: std(st.rating),
    };
  };
  return { L: score(S.L), O: score(S.O), G: score(S.G) };
}

export function simulate({ seeds = 200, matches = 600, evolving = false, paddleEffect = 0, cfg = {} } = {}) {
  const acc = {};
  for (let s = 1; s <= seeds; s++) {
    const out = runSeed(s * 7919, { matches, evolving, paddleEffect, cfg });
    for (const sys of SYSTEMS) for (const [k, v] of Object.entries(out[sys])) ((acc[sys] ||= {})[k] ||= []).push(v);
  }
  const m = {};
  for (const sys of SYSTEMS) { m[sys] = {}; for (const k of Object.keys(acc[sys])) m[sys][k] = mean(acc[sys][k]); }
  return m;
}

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);
if (process.argv[1] && process.argv[1].endsWith('simulate.js')) {
  const f = (x, d = 4) => x.toFixed(d);
  if (flag('sweep')) {
    const seeds = +arg('seeds', 60), matches = +arg('matches', 600);
    const scales = (arg('scales', '0.3,0.4,0.5,0.6,0.75,1')).split(',').map(Number);
    const decays = (arg('decays', '12,20,30,45')).split(',').map(Number);
    for (const evolving of [false, true]) {
      console.log(`\n## sweep ${evolving ? 'evolving' : 'static'} skills, ${seeds} seeds (G = per-game)`);
      const ref = simulate({ seeds, matches, evolving, cfg: { scale: 0.5, decay: 30 } });
      console.log(`reference O(match-level): gameLL ${f(ref.O.gameLL)} matchLL ${f(ref.O.matchLL)} spearman ${f(ref.O.spearman)} early ${f(ref.O.early)} vol ${f(ref.O.volatility, 2)}`);
      console.log('scale decay | gameLL matchLL spearman early rankErr vol spread');
      for (const scale of scales) for (const decay of decays) {
        const g = simulate({ seeds, matches, evolving, cfg: { scale, decay } }).G;
        console.log(`${scale} ${decay} | ${f(g.gameLL)} ${f(g.matchLL)} ${f(g.spearman)} ${f(g.early)} ${f(g.rankErr, 3)} ${f(g.volatility, 2)} ${f(g.spread, 1)}`);
      }
    }
  } else {
    const seeds = +arg('seeds', 200), matches = +arg('matches', 600), out = arg('out', null);
    let md = `# Elo simulation: legacy vs match-level vs per-game rating\n\n${seeds} seeds x ${matches} matches over 300 days, 16 players, base skill ~ N(1500, 200), singles, rally-by-rally scoring\n(per-rally win prob from the skill gap), ~12% target-21, best-of-1/3/5 mix, 30% of games played with a paid paddle (random, independent of skill),\n0-2 long breaks (25-95 days) per player, opponents chosen mostly from nearby visible rank.\nColumns: legacy = original rules (step K, no paddle); match-level = rules shipped before per-game rating (scripts/rating-match-level.js);\nper-game = current src/rating.js (GAME_K_SCALE ${GAME_K_SCALE}, K_DECAY_GAMES ${K_DECAY_GAMES}).\nPrediction metrics skip the first 100 matches. "game log-loss" scores every game's winner using the ratings going into that game\n(match-level systems use the match-start ratings for all its games); "match log-loss" scores the match winner (per-game: best-of-n from the per-game probability).\nEarly Spearman = ordering quality after 150 matches (~19 per player). Lower is better for log-loss, rank error, volatility; higher for Spearman.\nRegenerate: node api/scripts/simulate.js --seeds 200 --out ../penged-qa/elo-sim.md\n\n`;
    for (const evolving of [false, true]) for (const pe of [0, 50]) {
      const m = simulate({ seeds, matches, evolving, paddleEffect: pe });
      md += `## ${evolving ? 'Evolving skills (learning curve +80 over first ~45 games, drift)' : 'Static skills'}; paid paddle truly worth ${pe}\n\n| metric | legacy | match-level | per-game |\n|---|---|---|---|\n`;
      const rows = [['game log-loss', 'gameLL', 4], ['match log-loss', 'matchLL', 4], ['Spearman (final rating vs true skill)', 'spearman', 4], ['Spearman after 150 matches', 'early', 4], ['mean abs rank error (of 16)', 'rankErr', 3], ['volatility: mean abs match delta, 2nd half', 'volatility', 2], ['rating spread (std)', 'spread', 1]];
      for (const [label, k, d] of rows) md += `| ${label} | ${f(m.L[k], d)} | ${f(m.O[k], d)} | ${f(m.G[k], d)} |\n`;
      md += '\n';
    }
    if (out) writeFileSync(out, md);
    console.log(md);
  }
}
