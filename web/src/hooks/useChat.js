import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/api/client";

export const CHAT_UNREAD_KEY = "chat-unread";

/** {dms, mentions, reports}: one cheap call, polled every 60s (and on focus) while signed in. */
export function useChatUnread() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: [CHAT_UNREAD_KEY, user?.id],
    enabled: !!user?.id,
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => (await api.functions.invoke("chatUnread", {})).data,
  });
  return user?.id ? { dms: data?.dms || 0, mentions: data?.mentions || 0, reports: data?.reports || 0 } : { dms: 0, mentions: 0, reports: 0 };
}

export const errMsg = (err, fallback = "Something went wrong. Please try again.") => err?.response?.data?.error || err?.message || fallback;

export const DISPUTE_COUNTS_KEY = "dispute-counts";
/** Numbers for the red Disputes button: open threads I am in (signed in) or recently active ones (signed out). */
export function useDisputeCounts() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: [DISPUTE_COUNTS_KEY, user?.id || null],
    staleTime: 30000,
    refetchInterval: 60000,
    queryFn: async () => (await api.functions.invoke("disputeCounts", {})).data,
  });
  return { n: user?.id ? data?.open_mine || 0 : data?.recent || 0, signedIn: !!user?.id };
}
