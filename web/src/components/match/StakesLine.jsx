import { useQuery } from "@tanstack/react-query";
import { tierByKey } from "@/lib/tiers";
import { api } from "@/api/client";

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");
/** [low, high] -> "+6 to +19" (one number when both ends agree). */
export const rangeText = (r) => (!Array.isArray(r) ? signed(r) : r[0] === r[1] ? signed(r[0]) : `${signed(r[0])} to ${signed(r[1])}`);
const tierName = (t) => tierByKey(t?.tier_after)?.name;

/** Fetches the matchStakes preview for `request` (null = not ready yet). Same request, same cache entry. */
export function useStakes(request) {
  return useQuery({
    queryKey: ["stakes", request],
    enabled: !!request,
    staleTime: 30_000,
    queryFn: async () => (await api.functions.invoke("matchStakes", request)).data,
  });
}

/**
 * "On the line: Win +6 to +19 · Lose −6 to −19 · Gold if you win" for the signed-in player: a narrow 2-1 up to a dominant 2-0.
 * `request`: a matchStakes body ({ format, target, side_a, side_b } | { match_id } | { challenge_id }).
 * `showResult`: for a pending match, also say what confirming the entered scores does.
 */
export function StakesLine({ request, showResult = false, className = "" }) {
  const { data, isError } = useStakes(request);
  if (!request || isError || data?.error) return null;
  if (data?.ranked === false)
    return (
      <div className={`rounded-sm border border-dashed border-border bg-secondary/50 px-2.5 py-1.5 text-xs ${className}`} data-testid="stakes-line">
        <span className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">Unranked</span>{" "}
        XP only. Nobody's rating or record moves.
      </div>
    );
  const me = data?.players?.find((p) => p.you);
  const bits = me
    ? [
        `Win ${rangeText(me.win)}`,
        `Lose ${rangeText(me.lose)}`,
        me.bounty_win && `incl. bounty +${me.bounty_win.rating} & +${me.bounty_win.xp} xp`,
        me.bounty_risk && `incl. your bounty −${me.bounty_risk}`,
        me.tier_win && `${tierName(me.tier_win)} if you win`,
        me.tier_lose && `${tierName(me.tier_lose)} if you lose`,
      ].filter(Boolean)
    : [];
  return (
    <div
      className={`rounded-sm border border-border bg-secondary/50 px-2.5 py-1.5 text-xs leading-relaxed ${className}`}
      data-testid="stakes-line"
      aria-live="polite"
      title={data?.assumed ? `From ${data.assumed}` : undefined}
    >
      {!me ? (
        <span className="text-muted-foreground">Working out what's on the line…</span>
      ) : (
        <>
          {showResult && me.result != null && (
            <p className="font-medium">
              {"If confirmed: "}
              <span className={`font-mono tabular-nums ${me.result >= 0 ? "text-success" : "text-destructive"}`}>
                {signed(me.result)}
              </span>
              {" for you"}
              {me.result_tier && ` · to ${tierName(me.result_tier)}`}
            </p>
          )}
          <p className={showResult && me.result != null ? "text-muted-foreground" : ""}>
            <span className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">On the line</span>{" "}
            <span className="font-mono tabular-nums">{bits.join(" · ")}</span>
            {data.challenge && <span className="text-muted-foreground"> · challenge ×1.25</span>}
            {me.placing && <span className="text-muted-foreground"> · placement</span>}
          </p>
          <p className="sr-only">From {data.assumed}.</p>
        </>
      )}
    </div>
  );
}
