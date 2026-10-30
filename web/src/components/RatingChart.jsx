import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { TIERS } from "@/lib/tiers";
import { EloButton } from "@/components/EloButton";
import { ratingFor, isProvisional, placementCount } from "@/lib/ladder";

const START = 1400;
const WIDE = { W: 640, H: 220 };
const NARROW = { W: 340, H: 200 }; // phones: a narrower canvas keeps axis text readable
const narrowQuery = "(max-width: 639px)";
function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia?.(narrowQuery).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(narrowQuery);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}
const PAD = { l: 40, r: 12, t: 12, b: 22 };

const shortDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

/** Every rating move in one format, oldest first: verified matches (exact after values) plus challenge penalties / walkover gains. */
function buildSeries(player, format, matches, dodged, walkovers) {
  const ev = [];
  for (const m of matches) {
    if (m.format !== format || m.ranked === false) continue;
    const rc = (m.rating_changes || []).find((x) => x.player_id === player.id);
    if (!rc || rc.after == null) continue;
    const mine = (m.side_a || []).some((s) => s.player_id === player.id) ? "a" : "b";
    const won = m.winner_side === mine;
    const opp = (mine === "a" ? m.side_b : m.side_a) || [];
    const oppName = opp.map((s) => s.display_name || s.username || "?").join(" & ");
    const score = mine === "a" ? `${m.games_a}-${m.games_b}` : `${m.games_b}-${m.games_a}`;
    ev.push({ at: m.verified_at || m.created_date, before: rc.before, after: rc.after, label: `${won ? "Beat" : "Lost to"} ${oppName} ${score}`, href: `/matches/${m.id}` });
  }
  if (format === "singles") {
    for (const c of dodged) ev.push({ at: c.penalized_at, delta: -(c.penalty_rating || 0), label: `${c.penalty_reason?.startsWith("expired") ? "Ignored" : "Declined"} ${c.challenger_name}'s challenge` });
    for (const c of walkovers) ev.push({ at: c.penalized_at, delta: c.challenger_rating_gain || 0, label: `Walkover: ${c.defender_name} ignored your challenge` });
  }
  ev.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const first = ev.find((e) => e.before != null);
  let r = first && ev.indexOf(first) === 0 ? first.before : START;
  const pts = [{ at: null, rating: r, label: "Start" }];
  for (const e of ev) {
    const next = e.after != null ? e.after : r + e.delta;
    pts.push({ at: e.at, rating: next, delta: next - r, label: e.label, href: e.href });
    r = next;
  }
  // The stored rating is the truth; if anything older than the fetched window moved it, end on it anyway.
  const now = ratingFor(player, format);
  if (pts.length > 1 && pts[pts.length - 1].rating !== now) pts[pts.length - 1].rating = now;
  return pts;
}

export function RatingChart({ player }) {
  const [format, setFormat] = useState(() =>
    (player.singles_wins || 0) + (player.singles_losses || 0) === 0 && (player.doubles_wins || 0) + (player.doubles_losses || 0) > 0 ? "doubles" : "singles",
  );
  const [sel, setSel] = useState(null);
  const { W, H } = useNarrow() ? NARROW : WIDE;
  const { data, isLoading } = useQuery({
    queryKey: ["rating-history", player.id],
    queryFn: async () => {
      const [m, d, w] = await Promise.all([
        api.entities.Match.filter({ all_player_ids: player.id, status: "verified" }, { sort: "-created_date", limit: 500 }),
        api.entities.Challenge.filter({ defender_player_id: player.id, penalty_rating: { $gt: 0 }, reversed: false }, { sort: "-created_date", limit: 200 }),
        api.entities.Challenge.filter({ challenger_player_id: player.id, challenger_rating_gain: { $gt: 0 }, reversed: false }, { sort: "-created_date", limit: 200 }),
      ]);
      return { matches: m.items || [], dodged: d.items || [], walkovers: w.items || [] };
    },
  });
  const pts = useMemo(
    () => (data ? buildSeries(player, format, data.matches, data.dodged, data.walkovers) : []),
    [data, player, format],
  );

  const ratings = pts.map((p) => p.rating);
  const lo = Math.floor((Math.min(...ratings, START) - 25) / 50) * 50;
  const hi = Math.ceil((Math.max(...ratings, START) + 25) / 50) * 50;
  const x = (i) => PAD.l + (pts.length < 2 ? 0 : (i / (pts.length - 1)) * (W - PAD.l - PAD.r));
  const y = (r) => PAD.t + (1 - (r - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ");
  const area = pts.length > 1 ? `${line} L${x(pts.length - 1).toFixed(1)},${H - PAD.b} L${x(0).toFixed(1)},${H - PAD.b} Z` : "";
  const bands = TIERS.filter((t) => t.min > lo && t.min < hi);
  const step = hi - lo > 300 ? 100 : 50;
  const ticks = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const picked = sel != null && pts[sel] ? pts[sel] : pts[pts.length - 1];
  const high = Math.max(...ratings);

  return (
    <section className="mt-8" aria-label="Rating history" data-testid="rating-chart">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">Rating history</h2>
          <EloButton format={format} />
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Rating chart format">
          {["singles", "doubles"].map((f) => (
            <button
              role="tab"
              aria-selected={format === f}
              key={f}
              onClick={() => (setFormat(f), setSel(null))}
              className={`min-h-[36px] rounded-sm px-3 font-heading text-xs font-medium capitalize ${format === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:bg-secondary/70"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-sm border border-border bg-card p-3">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : isProvisional(player, format) && pts.length >= 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground" data-testid="chart-placement">{`Rating hidden during placement (${placementCount(player, format)} ${format}). The chart appears once placement is done.`}</p>
        ) : pts.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{`No verified ${format} matches yet. The chart starts with the first one.`}</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-manipulation select-none" role="img" aria-label={`${format} rating over ${pts.length - 1} results, now ${pts[pts.length - 1].rating}`}>
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth="1" />
                  <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">{v}</text>
                </g>
              ))}
              {bands.map((t) => (
                <g key={t.key}>
                  <line x1={PAD.l} x2={W - PAD.r} y1={y(t.min)} y2={y(t.min)} className="stroke-muted-foreground" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
                  <text x={W - PAD.r - 2} y={y(t.min) - 3} textAnchor="end" className="fill-muted-foreground font-mono text-[9px] uppercase">{t.name}</text>
                </g>
              ))}
              {area && <path d={area} className="fill-brand" opacity="0.08" />}
              <path d={line} fill="none" className="stroke-brand" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {pts.map((p, i) => (
                <g key={i} onClick={() => setSel(i)} onMouseEnter={() => setSel(i)} className="cursor-pointer">
                  <circle cx={x(i)} cy={y(p.rating)} r="12" fill="transparent" />
                  <circle
                    cx={x(i)}
                    cy={y(p.rating)}
                    r={picked === p ? 4.5 : pts.length > 40 ? 0 : 2.5}
                    className={picked === p ? "fill-brand stroke-card" : "fill-brand"}
                    strokeWidth="2"
                  />
                </g>
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-border pt-2 text-xs">
              <p className="min-w-0">
                <span className="font-mono tabular-nums font-semibold">{picked.rating}</span>
                {picked.delta != null && (
                  <span className={`ml-1.5 font-mono tabular-nums ${picked.delta >= 0 ? "text-brand" : "text-muted-foreground"}`}>{signed(picked.delta)}</span>
                )}
                <span className="ml-2 text-muted-foreground">
                  {picked.at ? `${shortDate(picked.at)} · ` : ""}
                  {picked.href ? <Link to={picked.href} className="underline underline-offset-2">{picked.label}</Link> : picked.label}
                </span>
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {`Peak ${high} · ${pts.length - 1} results`}
              </p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
