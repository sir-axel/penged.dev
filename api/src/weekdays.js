// Challenge clocks only run on weekdays: Saturday and Sunday (local time) are paused.
// With several time zones (players in different cities) the clock runs only while it is a weekday in ALL of them.

export const DEFAULT_TZ = 'America/Chicago';
const DAY = 86400000;
const fmts = new Map();
const fmt = (tz) => {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    fmts.set(tz, f);
  }
  return f;
};
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** A real IANA zone name (e.g. "America/Chicago"), else null. */
export function cleanTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return null;
  try {
    fmt(tz);
    return tz;
  } catch {
    return null;
  }
}

/** { weekend, msToFlip }: whether `t` is Sat/Sun in `tz`, and ms until that changes (next local Sat 00:00 or Mon 00:00). */
function state(t, tz) {
  const p = Object.fromEntries(fmt(tz).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const dow = DOW[p.weekday];
  const sinceMidnight = ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000;
  const weekend = dow === 0 || dow === 6;
  const daysAhead = weekend ? (dow === 6 ? 2 : 1) : 6 - dow; // to Monday / to Saturday
  return { weekend, msToFlip: Math.max(60000, daysAhead * DAY - sinceMidnight) };
}

/** ISO time `ms` of weekday-only clock after `startMs`, counting only time that is a weekday in every zone in `tzs`. */
export function weekdayDeadline(startMs, ms, tzs = [DEFAULT_TZ]) {
  const zones = [...new Set(tzs.map((z) => cleanTimeZone(z) || DEFAULT_TZ))];
  let t = startMs;
  let left = ms;
  for (let i = 0; i < 64 && left > 0; i++) {
    const s = zones.map((z) => state(t, z));
    const paused = s.filter((x) => x.weekend);
    if (paused.length) {
      t += Math.min(...paused.map((x) => x.msToFlip)); // next moment one of the paused zones reaches Monday; re-check
      continue;
    }
    const run = Math.min(left, ...s.map((x) => x.msToFlip));
    t += run;
    left -= run;
  }
  return new Date(t).toISOString();
}
