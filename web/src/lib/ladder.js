export function formatShortDate(e) {
  if (!e) return "";
  let t = new Date(e);
  return Number.isNaN(t.getTime())
    ? ""
    : t.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      });
}
export function formatRecord(e = 0, t = 0) {
  return `${e || 0}–${t || 0}`;
}
export function levelFor(e) {
  let t = Math.max(0, Number(e) || 0);
  return Math.max(1, Math.floor(Math.sqrt(t / 40)) + 1);
}
export function levelProgress(e) {
  let t = Math.max(0, Number(e) || 0),
    n = levelFor(t),
    r = (n - 1) ** 2 * 40,
    i = n ** 2 * 40,
    a = i === r ? 1 : (t - r) / (i - r);
  return {
    level: n,
    ratio: Math.max(0, Math.min(1, a)),
    toNext: Math.max(0, i - t),
  };
}
export function timeLeft(e) {
  if (!e) return "";
  let t = new Date(e).getTime() - Date.now();
  if (Number.isNaN(t) || t <= 0) return "Window closed";
  let n = Math.floor(t / 36e5),
    r = Math.floor(n / 24);
  return r >= 1 ? `${r}d ${n % 24}h left` : `${n}h ${Math.floor((t % 36e5) / 6e4)}m left`;
}
export function matchesPlayed(e, t) {
  let n = t === "doubles" ? "doubles" : "singles";
  return (Number(e?.[`${n}_wins`]) || 0) + (Number(e?.[`${n}_losses`]) || 0);
}
/** DISPLAY ONLY: blend of the two independent ratings for the Overall board. Never an input to any rating, rank or stored field. */
export function overallRating(e) {
  let t = matchesPlayed(e, "singles"),
    n = matchesPlayed(e, "doubles"),
    r = t + n;
  if (!r) return 1400;
  let i = (Number(e.singles_rating) || 1400) * t + (Number(e.doubles_rating) || 1400) * n;
  return Math.round(i / r);
}
export function playerName(e) {
  return e?.display_name || e?.username || "Player";
}

export const PROVISIONAL_MATCHES = 5;
export const ACTIVE_DAYS = 30;
export const isProvisional = (player, format) => matchesPlayed(player, format) < PROVISIONAL_MATCHES;
/** Singles only: played at least once but off the ranked ladder (no verified match for 30 days). */
/** Played that format at least once but is off its ranked ladder (no verified match of that format for 30 days). */
export const isInactive = (player, format = "singles") =>
  !(Number(player?.[`${format === "doubles" ? "doubles" : "singles"}_rank`]) > 0) && matchesPlayed(player, format) > 0;
/** Per-format rank / streaks: singles and doubles share nothing. */
export const rankFor = (player, format) => Number(player?.[format === "doubles" ? "doubles_rank" : "singles_rank"]) || 0;
export const ratingFor = (player, format) => Number(player?.[format === "doubles" ? "doubles_rating" : "singles_rating"]) || 1400;
export const streakFor = (player, format) => Number(player?.[format === "doubles" ? "doubles_win_streak" : "singles_win_streak"]) || 0;
export const bestStreakFor = (player, format) => Number(player?.[format === "doubles" ? "doubles_best_streak" : "singles_best_streak"]) || 0;
