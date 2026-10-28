import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { Hero } from "@/components/home/Hero";
import { BallStrip } from "@/components/home/BallStrip";
import { YourSpot } from "@/components/home/YourSpot";
import { TopLadder } from "@/components/home/TopLadder";
import { RecentMatches } from "@/components/home/RecentMatches";
import { HouseRules } from "@/components/home/HouseRules";
import { RatingExplainer } from "@/components/home/RatingExplainer";
import { api } from "@/api/client";

export const safe = (e, t) => e.catch(() => t);
export function Home() {
  let { user } = useAuth(),
    { player } = useMyPlayer(),
    { data: home = {} } = useQuery({
      queryKey: ["home"],
      refetchOnMount: "always",
      queryFn: async () => {
        let [e, t, n, r, i] = await Promise.all([
          safe(api.entities.Player.count(), 0),
          safe(
            api.entities.Match.count({
              status: "verified",
            }),
            0,
          ),
          safe(
            api.entities.Match.count({
              status: "pending",
            }),
            0,
          ),
          safe(
            api.entities.Player.list({
              sort: "singles_rank",
              limit: 5,
            }),
            {
              items: [],
            },
          ),
          safe(
            api.entities.Match.filter(
              {
                status: "verified",
              },
              {
                sort: "-created_date",
                limit: 4,
              },
            ),
            {
              items: [],
            },
          ),
        ]);
        return {
          players: e,
          verified: t,
          pending: n,
          top: r.items || [],
          recent: i.items || [],
        };
      },
    }),
    { data: toConfirm = 0 } = useQuery({
      queryKey: ["my-pending", user?.id],
      enabled: !!user?.id,
      queryFn: async () =>
        (
          (
            await api.entities.Match.filter(
              {
                all_user_ids: user.id,
                status: "pending",
              },
              {
                limit: 20,
              },
            )
          ).items || []
        ).filter((t) => !(t.accepted_user_ids || []).includes(user.id)).length,
    });
  return (
    <>
      <Hero
        players={home.players}
        verified={home.verified}
        pending={home.pending}
        match={home.recent?.[0] || null}
      />
      <BallStrip />
      {player && <YourSpot player={player} toConfirm={toConfirm} />}
      <TopLadder players={home.top} />
      <BallStrip className="hidden sm:block" />
      <RecentMatches matches={home.recent} />
      <HouseRules />
      <RatingExplainer />
    </>
  );
}
