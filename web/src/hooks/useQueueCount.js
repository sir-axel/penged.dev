import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/api/client";

export const QUEUE_COUNT_KEY = "queue-count";

/** Items waiting on me: results to sign off + challenges to answer. One cheap function call, cached ~30s. */
export function useQueueCount() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: [QUEUE_COUNT_KEY, user?.id],
    enabled: !!user?.id,
    staleTime: 30000,
    queryFn: async () => (await api.functions.invoke("myQueueCount", {})).data,
  });
  return user?.id ? data?.total || 0 : 0;
}
