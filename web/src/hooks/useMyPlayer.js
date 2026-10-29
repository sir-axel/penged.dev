import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/api/client";
import { browserTimeZone } from "@/lib/ladder";

let tzSynced = false;

/** The Player record that belongs to the signed-in user (null until they claim a username). */
export function useMyPlayer() {
  const { user, isAuthenticated } = useAuth();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-player", user?.id],
    enabled: !!(isAuthenticated && user?.id),
    queryFn: async () => {
      const { items } = await api.entities.Player.filter({ user_id: user.id }, { limit: 1 });
      return items[0] || null;
    },
  });
  // Keep the player's time zone current (challenge clocks pause on their local weekend). Once per page load, only if it changed.
  const tz = browserTimeZone();
  useEffect(() => {
    if (tzSynced || !data || !tz || data.timezone === tz) return;
    tzSynced = true;
    api.functions.invoke("setTimezone", { timezone: tz }).catch(() => {});
  }, [data, tz]);
  return { player: data ?? null, isLoading: !!(isAuthenticated && isLoading), refetch };
}
