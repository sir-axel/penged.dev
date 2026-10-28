import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/api/client";

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
  return { player: data ?? null, isLoading: !!(isAuthenticated && isLoading), refetch };
}
