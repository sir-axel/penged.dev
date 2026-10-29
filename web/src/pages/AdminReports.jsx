import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { BackButton } from "@/components/BackButton";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { CHAT_UNREAD_KEY, errMsg } from "@/hooks/useChat";
import { PersonLink, Spinner } from "@/components/chat/bits";
import { plainText } from "@/lib/chatText";
import { whenShort } from "@/components/FeedbackThread";
import { api } from "@/api/client";

const call = async (name, body) => (await api.functions.invoke(name, body)).data;
const TABS = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
];
const KIND = { post: "Post", topic: "Topic", dm: "Private message" };

export function AdminReports() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [error, setError] = useState("");
  const q = useInfiniteQuery({
    queryKey: ["admin-reports", status],
    enabled: user?.role === "admin",
    initialPageParam: null,
    queryFn: ({ pageParam }) => call("adminReports", { status, cursor: pageParam || undefined }),
    getNextPageParam: (l) => l.next_cursor || undefined,
  });
  if (user?.role !== "admin") return <EmptyState title="Admins only" body="Chat reports are limited to ladder admins." />;
  const items = (q.data?.pages || []).flatMap((p) => p.items);
  const people = Object.assign({}, ...(q.data?.pages || []).map((p) => p.people));
  const resolve = async (id, st) => {
    setError("");
    try {
      await call("adminResolveReport", { id, status: st });
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      qc.invalidateQueries({ queryKey: [CHAT_UNREAD_KEY] });
    } catch (e) {
      setError(errMsg(e));
    }
  };
  return (
    <>
      <BackButton fallback="/profile" />
      <PageHeader eyebrow="Admin" title="Chat reports" description="Posts, topics and messages players have flagged. Hide a post from its topic page, then resolve the report here." />
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6">
        <div role="tablist" aria-label="Status" className="grid grid-cols-3 border-2 border-foreground/80">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={status === t.key} onClick={() => setStatus(t.key)}
              className={`min-h-11 border-r border-foreground/40 px-2 font-display text-[0.55rem] uppercase tracking-[0.12em] last:border-r-0 ${status === t.key ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {q.isLoading ? <Spinner /> : items.length === 0 ? (
          <EmptyState title="Nothing here" body={status === "open" ? "No open reports. Nice." : "No reports with this status."} />
        ) : (
          <ul className="space-y-2" data-testid="reports">
            {items.map((r) => (
              <li key={r.id} className="rounded-sm border border-border bg-card p-3">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
                  <span className="bg-foreground px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] text-background">{KIND[r.kind]}</span>
                  {whenShort(r.created_date)} · reported by <PersonLink person={people[r.reporter_player_id]} className="text-foreground" />
                </p>
                <p className="mt-2 break-words text-sm font-semibold [overflow-wrap:anywhere]">Reason: {r.reason}</p>
                {r.target ? (
                  <blockquote className="mt-2 border-l-4 border-border pl-3 text-sm">
                    <p className="font-mono text-[11px] text-muted-foreground">
                      by <PersonLink person={people[r.target.author_player_id]} className="text-foreground" />
                      {r.target.hidden && " · hidden"}{r.target.deleted && " · deleted by author"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{plainText(r.target.text)}</p>
                  </blockquote>
                ) : (
                  <p className="mt-2 text-sm italic text-muted-foreground">The reported item no longer exists.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.target?.topic_id && (
                    <Link to={`/chat/t/${r.target.topic_id}${r.kind === "post" ? `#p-${r.target_id}` : ""}`} className="inline-flex min-h-11 items-center rounded-sm border border-border px-3 text-sm font-medium hover:bg-secondary">
                      Open topic
                    </Link>
                  )}
                  {r.status === "open" ? (
                    <>
                      <Button className="h-11 rounded-sm" onClick={() => resolve(r.id, "resolved")}>Resolve</Button>
                      <Button variant="outline" className="h-11 rounded-sm" onClick={() => resolve(r.id, "dismissed")}>Dismiss</Button>
                    </>
                  ) : (
                    <Button variant="outline" className="h-11 rounded-sm" onClick={() => resolve(r.id, "open")}>Reopen</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && <Button variant="outline" className="h-11 w-full rounded-sm" onClick={() => q.fetchNextPage()}>Load more</Button>}
      </div>
    </>
  );
}
