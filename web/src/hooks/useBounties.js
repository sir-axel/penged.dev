import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { bountyFor } from "@/lib/bounty";
import { rankFor, streakFor } from "@/lib/ladder";

/**
 * (target) => the bounty YOU would collect for beating `target` in `format` (null if none, or already claimed this week).
 * Signed out (or no player yet), or looking at yourself: a neutral view, as if the hunter had no ladder spot.
 */
export function useBounties(format = "singles") {
  const fmt = format === "doubles" ? "doubles" : "singles";
  const { player: me } = useMyPlayer();
  const { data } = useQuery({
    queryKey: ["bounty-board", me?.id],
    staleTime: 30_000,
    queryFn: async () => (await api.functions.invoke("bountyBoard", {})).data,
  });
  const rise = data?.rise?.[fmt] || {};
  const claimed = new Set(data?.claimed?.[fmt] || []);
  const state = (p) => ({ id: p.id, rank: rankFor(p, fmt) || null, streak: streakFor(p, fmt), rise: rise[p.id] || 0 });
  return (target) => {
    if (!target || !data) return null;
    // Your own bounty (what it is worth to others) is shown from a neutral viewer.
    if (me?.id === target.id) return bountyFor(null, state(target));
    if (claimed.has(target.id)) return null;
    return bountyFor(me ? state(me) : null, state(target));
  };
}
