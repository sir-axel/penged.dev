import { useQuery } from "@tanstack/react-query";
import { tierByKey } from "@/lib/tiers";
import { api } from "@/api/client";

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0");
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
 * "On the line: Win +18 · Lose −14 · Gold if you win" for the signed-in player.
 * `request`: a matchStakes body ({ format, target, side_a, side_b } | { match_id } | { challenge_id }).
 * `showResult`: for a pending match, also say what confirming the entered scores does.
 */
export function StakesLine({ request, showResult = false, className = "" }) {
  const { data, isError } = useStakes(request);
  if (!request || isError || data?.error) return null;
  const me = data?.players?.find((p) => p.you);
  const bits = me
    ? [
        `Win ${signed(me.win)}`,
        `Lose ${signed(me.lose)}`,
        me.tier_win && `${tierName(me.tier_win)} if you win`,
        me.tier_lose && `${tierName(me.tier_lose)} if you lose`,
      ].filter(Boolean)
    : [];
  return (
    <div
      className={`rounded-sm border border-border bg-secondary/50 px-2.5 py-1.5 text-xs leading-relaxed ${className}`}
      data-testid="stakes-line"
      aria-live="polite"
      title={data?.assumed ? `Win / Lose assume ${data.assumed}` : undefined}
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
          <p className="sr-only">Assumes {data.assumed}.</p>
        </>
      )}
    </div>
  );
}
