import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Swords, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/chat/bits";
import { ChatBar } from "@/components/chat/ChatBar";
import { nameOf } from "@/lib/chatText";
import { timeAgo } from "@/lib/timeAgo";
import { api } from "@/api/client";

const call = async (name, body) => (await api.functions.invoke(name, body)).data;
const STATUS = { pending: "Waiting", disputed: "Disputed", verified: "Verified", declined: "Declined", expired: "Expired", cancelled: "Cancelled" };

export function ChatDisputes() {
  const { isAuthenticated } = useAuth();
  const q = useInfiniteQuery({
    queryKey: ["disputes"],
    initialPageParam: null,
    queryFn: ({ pageParam }) => call("listDisputes", { cursor: pageParam || undefined }),
    getNextPageParam: (l) => l.next_cursor || undefined,
    refetchInterval: 30000,
  });
  const items = (q.data?.pages || []).flatMap((p) => p.items);
  const people = Object.assign({}, ...(q.data?.pages || []).map((p) => p.people));
  return (
    <>
      <ChatBar back="/chat" backTo="/chat" />
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center bg-brand text-white"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h1 className="font-heading text-xl font-bold leading-none">Disputes</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              One thread per match. A dispute starts from a match: open it from <Link className="underline underline-offset-4" to="/confirm">To confirm</Link> or
              the <Link className="underline underline-offset-4" to="/feed">Feed</Link> and tap <strong className="font-semibold text-foreground">Discuss</strong>.
            </p>
          </div>
        </div>
        {q.isLoading ? (
          <Spinner />
        ) : q.isError ? (
          <p role="alert" className="text-sm text-destructive">Could not load disputes.</p>
        ) : items.length === 0 ? (
          <EmptyState title="No disputes" body="Nothing to settle right now. When a result is contested, its thread shows up here." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden border border-border bg-card" data-testid="dispute-list">
            {items.map((t) => (
              <li key={t.id} className="px-3 py-3 hover:bg-secondary/40">
                <Link to={`/chat/t/${t.id}`} className="block min-h-11">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {t.match && (
                      <span className={`px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] ${t.match.open ? "bg-brand text-white" : "bg-secondary text-muted-foreground"}`}>
                        {t.match.open ? "Open" : STATUS[t.match.status] || "Closed"}
                      </span>
                    )}
                    {t.mine && <span className="border border-foreground px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em]">You</span>}
                    {t.locked && <span className="font-mono text-[10px] uppercase text-muted-foreground">locked</span>}
                    {t.hidden && <span className="font-mono text-[10px] uppercase text-destructive">hidden</span>}
                  </span>
                  <span className="mt-1 block break-words font-heading text-base font-semibold leading-snug [overflow-wrap:anywhere]">{t.title}</span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="flex -space-x-1.5">
                      {t.participant_ids.slice(0, 4).map((id) => (
                        <Avatar key={id} name={nameOf(people[id])} src={people[id]?.avatar_url} size={22} className="ring-2 ring-card" />
                      ))}
                    </span>
                    <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                      {t.participant_ids.map((id) => nameOf(people[id]) || "Former player").join(", ")}
                    </span>
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                    {t.replies} {t.replies === 1 ? "reply" : "replies"} · active {timeAgo(t.last_post_at)}
                  </span>
                </Link>
                {t.match && (
                  <Link to={`/matches/${t.match.id}`} className="mt-1 inline-flex min-h-10 items-center gap-1.5 border border-border bg-background px-2.5 font-mono text-[11px] hover:bg-secondary">
                    <Swords className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.match.side_a.join(" & ")} vs {t.match.side_b.join(" & ")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && <Button variant="outline" className="mt-3 h-11 w-full rounded-sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button>}
        {!isAuthenticated && <p className="mt-4 text-sm text-muted-foreground"><Link className="underline underline-offset-4" to="/login?returnTo=%2Fchat%2Fdisputes">Sign in</Link> to see the disputes you are part of.</p>}
      </div>
    </>
  );
}
