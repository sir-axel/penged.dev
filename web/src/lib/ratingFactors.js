// Turns one rating_changes entry into display lines. Old matches only stored margin / upset; newer ones store every factor.
// Matches verified since per-game rating carry entry.games = [{ game, score: [mine, theirs], before, after, delta, ...factors }]
// (every game is its own rating event); older entries have no games array and render as one flat change.
const r2 = (x) => Math.round(x * 100) / 100;
const off = (x) => x == null || r2(x) === 1;
const times = (x) => `×${x.toFixed(2)}`;

export const RD_SETTLING = 90; // mirrors api/src/rating.js
const signed = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
/** Per-game summary for one rating_changes entry: [] for matches rated before per-game rating. */
export function describeGames(e) {
  return (e?.games || []).map((g) => ({
    key: g.game,
    label: `G${g.game}`,
    score: Array.isArray(g.score) ? `${g.score[0]}-${g.score[1]}` : "",
    won: g.won,
    delta: g.delta,
    text: `G${g.game} ${Array.isArray(g.score) ? `${g.score[0]}-${g.score[1]}` : ""} ${signed(g.delta)}`.replace("  ", " "),
    change: g,
  }));
}
export const gamesLine = (e) => describeGames(e).map((g) => g.text).join(" · ");

export function describeChange(e) {
  const compact = [];
  const detail = [];
  if (e.expected != null) {
    detail.push({ label: "Expected to win", value: `${Math.round(e.expected * 100)}%`, note: "from both ratings, plus any paid-paddle edge" });
  }
  if (e.paddle_edge) {
    const n = Math.abs(e.paddle_edge);
    compact.push(e.paddle_edge > 0 ? "vs paid paddle" : "with paid paddle");
    detail.push({
      label: e.paddle_edge > 0 ? "vs paid paddle" : "with paid paddle",
      value: `${e.paddle_edge > 0 ? "+" : "−"}${n}`,
      note: e.paddle_edge > 0
        ? `their paddle counted +${n} rating in their favour when working out who was expected to win`
        : `your paddle counted +${n} rating in your favour when working out who was expected to win`,
    });
  }
  if (e.score && e.expected != null) compact.push(`expected ${Math.round(e.expected * 100)}%`);
  if (e.rd_before != null) {
    const a = Math.round(e.rd_before), b = Math.round(e.rd_after ?? e.rd_before);
    const settling = e.rd_before >= RD_SETTLING;
    compact.push(`confidence ±${a}→±${b}${settling ? " (still settling)" : ""}`);
    detail.push({
      label: "confidence",
      value: `±${a} → ±${b}`,
      note: settling
        ? "your rating was still settling (new, or back after time away), so this result counted for more; every game firms it up"
        : "your rating is well established, so one result moves it steadily; time away loosens it again",
    });
  }
  if (e.k != null) {
    detail.push(e.rd_before != null
      ? { label: "step size", value: e.k.toFixed(1), note: "points per unit of surprise, from your confidence (wider = bigger) and how established your opponent is" }
      : { label: "K", value: e.k.toFixed(1), note: "how far one result can move you (rated before confidence was introduced)" });
  }
  const rows = [
    ["mov", "margin", "bigger wins move more", e.mov],
    ["ac", e.ac >= 1 ? "upset" : "favourite", e.ac >= 1 ? "beat or lost to someone who was ahead on paper" : "favourites are damped", e.ac],
    // the next two only exist on matches rated before Glicko-2 (confidence now covers both)
    ["rust", "back from a break", "older rules: 3+ weeks away made K higher for this match", e.rust],
    ["opp_certainty", "opponent's games", "older rules: an opponent with few games moved you a little less", e.opp_certainty],
    e.games
      ? ["evidence", "to 21", "a game to 21 is a more reliable result than one to 11", e.evidence]
      : ["evidence", "match length", "more games (or a 21 target) is a more reliable result", e.evidence],
    ["repeat", "rematch", "recent meetings with this opponent shrink the swing; each one fades by half every 3 days", e.repeat],
    ["novelty", "new rival", "first meeting in 30+ days: fresh evidence counts 10% more", e.novelty],
    ["teammate", "partner", "doubles: a stronger partner gains less and loses more", e.teammate],
    ["challenge", "challenge", "playing an accepted challenge counts extra", e.challenge],
  ];
  for (const [key, label, note, v] of rows) {
    if (v == null) continue;
    if (key === "mov") {
      // margin and upset are always shown, even if 1.00, for continuity with older matches
      compact.unshift(`${label} ${times(v)}`);
    } else if (key === "ac") {
      compact.splice(1, 0, `${label} ${times(v)}`);
    } else if (!off(v)) {
      compact.push(`${label} ${times(v)}`);
    }
    if (key === "mov" || key === "ac" || !off(v)) detail.push({ label, value: v === 0 ? "none" : times(v), note });
  }
  return { compact, detail };
}
