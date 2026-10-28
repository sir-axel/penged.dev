import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/api/client";

/** Number of unread ('new') feedback notes; admins only (0 for everyone else, no request is made). */
export function useNewFeedbackCount() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["feedback-new-count"],
    enabled: user?.role === "admin",
    staleTime: 60000,
    queryFn: async () => (await api.functions.invoke("listFeedback", { limit: 1 })).data.new_count || 0,
  });
  return user?.role === "admin" ? data || 0 : 0;
}

/** Number of my feedback notes with an unseen admin reply (signed-in users; one cheap COUNT, cached ~60s). */
export function useUnreadReplyCount() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["feedback-unread-replies"],
    enabled: !!user,
    staleTime: 60000,
    queryFn: async () => (await api.functions.invoke("myFeedbackUnread", {})).data.unread || 0,
  });
  return user ? data || 0 : 0;
}

/** Small red dot for unseen replies. */
export function UnreadDot({ n, className = "" }) {
  return n > 0 ? (
    <span
      role="img"
      aria-label={`${n} unread ${n === 1 ? "reply" : "replies"}`}
      className={`inline-block h-2 w-2 rounded-full bg-destructive ${className}`}
    />
  ) : null;
}

export function CountBadge({ n, className = "" }) {
  return n > 0 ? (
    <span
      aria-label={`${n} new`}
      className={`inline-flex min-w-5 items-center justify-center bg-brand px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none text-brand-foreground ${className}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  ) : null;
}
