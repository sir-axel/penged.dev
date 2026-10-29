/** Games in one match (mirrors MAX_GAMES in api/src/rating.js). */
export const MAX_GAMES = 10;
export function validateGames(e, t) {
  let n = Number(t);
  if (n !== 11 && n !== 21)
    return {
      ok: false,
      error: "Choose a game target of 11 or 21.",
    };
  if (!Array.isArray(e) || e.length === 0)
    return {
      ok: false,
      error: "Add at least one game.",
    };
  if (e.length > MAX_GAMES)
    return {
      ok: false,
      error: `A match is at most ${MAX_GAMES} games.`,
    };
  let r = 0,
    i = 0;
  for (let t of e) {
    let e = Number(t?.a),
      a = Number(t?.b);
    if (!Number.isInteger(e) || !Number.isInteger(a) || e < 0 || a < 0)
      return {
        ok: false,
        error: "Scores must be whole numbers.",
      };
    let o = Math.max(e, a),
      s = Math.min(e, a);
    if (o < n)
      return {
        ok: false,
        error: `Every game must reach ${n} for the winner.`,
      };
    if (o === n && o - s < 2)
      return {
        ok: false,
        error: `A game at ${n} needs a two-point lead.`,
      };
    if (o > n && o - s !== 2)
      return {
        ok: false,
        error: `Past ${n}-${n}, a game is won by two.`,
      };
    e > a ? (r += 1) : (i += 1);
  }
  return r === i
    ? {
        ok: false,
        error: "The games are level — the match needs a winner.",
      }
    : {
        ok: true,
        gamesA: r,
        gamesB: i,
        winnerSide: r > i ? "a" : "b",
      };
}
