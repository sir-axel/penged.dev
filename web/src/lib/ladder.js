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
/** Weekday-only ms between two instants in the viewer's local time (Sat/Sun don't count; local midnights handle DST). */
export function weekdayMsBetween(fromMs, toMs) {
  let t = fromMs;
  let total = 0;
  for (let i = 0; t < toMs && i < 400; i++) {
    const d = new Date(t);
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const stop = Math.min(nextMidnight, toMs);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) total += stop - t;
    t = stop;
  }
  return total;
}
/**
 * Challenge clock: weekday time left (weekends don't count, same as the deadline), plus the local due time.
 * e.g. "1d 4h left · due Mon 1:44pm · weekends off", with "Weekend pause · " in front on Sat/Sun.
 */
export function challengeClock(iso, nowMs = Date.now()) {
  if (!iso) return "";
  const end = new Date(iso).getTime();
  if (Number.isNaN(end) || end <= nowMs) return "Window closed";
  const ms = weekdayMsBetween(nowMs, end);
  const h = Math.floor(ms / 36e5);
  const left = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${h}h ${Math.floor((ms % 36e5) / 6e4)}m left`;
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" AM", "am").replace(" PM", "pm");
  const dow = new Date(nowMs).getDay();
  return `${dow === 0 || dow === 6 ? "Weekend pause · " : ""}${left} · due ${day} ${time} · weekends off`;
}
/** The browser's IANA time zone (e.g. "America/Chicago"), or null. */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
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

// ---- Confidence (Glicko-2 RD; mirrors currentRd in api/src/rating.js) ----
const GLICKO_Q = 400 / Math.LN10;
/** Current RD in a format: the stored RD grown by the days since it was last updated (max 200). */
export function confidenceFor(player, fmt, nowMs = Date.now()) {
  const rd = Number(player?.[`${fmt}_rd`]) || 200;
  const vol = Number(player?.[`${fmt}_vol`]) || 0.06;
  const at = player?.[`${fmt}_rd_at`];
  const days = at ? Math.max(0, (nowMs - Date.parse(at)) / 86400000) : 0;
  return Math.min(200, Math.sqrt(rd * rd + (vol * GLICKO_Q) ** 2 * days));
}
/** "settling ±120" while the rating is still settling (RD 90+), else null. Plain words, shown small. */
export function settlingHint(player, fmt, nowMs = Date.now()) {
  const rd = confidenceFor(player, fmt, nowMs);
  return rd >= 90 ? `settling ±${Math.round(rd / 5) * 5}` : null;
}
