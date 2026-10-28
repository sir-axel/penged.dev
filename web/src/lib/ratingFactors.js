// Turns one rating_changes entry into display lines. Old matches only stored margin / upset; newer ones store every factor.
const r2 = (x) => Math.round(x * 100) / 100;
const off = (x) => x == null || r2(x) === 1;
const times = (x) => `×${x.toFixed(2)}`;

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
  if (e.k != null) detail.push({ label: "K", value: e.k.toFixed(1), note: "how far one result can move you; shrinks as you play" });
  const rows = [
    ["mov", "margin", "bigger wins move more", e.mov],
    ["ac", e.ac >= 1 ? "upset" : "favourite", e.ac >= 1 ? "beat or lost to someone who was ahead on paper" : "favourites are damped", e.ac],
    ["rust", "rust", "back after a long break: K is higher", e.rust],
    ["opp_certainty", "new opponent", "opponent has few matches, so their rating is less certain", e.opp_certainty],
    ["evidence", "match length", "more games (or a 21 target) is a more reliable result", e.evidence],
    ["repeat", "rematch", "earlier meetings with this opponent shrink the swing", e.repeat],
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
