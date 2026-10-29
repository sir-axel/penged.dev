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

/** Reply to the person who reported: opens (or reuses) a private conversation with them and sends the message there. */
function ReplyToReporter({ report, reporter, author }) {
  const name = reporter?.display_name || reporter?.username || "them";
  const what = { post: "post", topic: "topic", dm: "message" }[report.kind] || "post";
  const by = author ? ` by ${author.display_name || author.username}` : "";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(`Thanks for reporting that ${what}${by}. `);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [err, setErr] = useState("");
  if (!reporter) return null;
  if (sent)
    return (
      <p className="mt-3 text-sm text-success" data-testid="report-replied">
        {`Sent to ${name}. `}
        <Link to={`/chat/dm/${sent}`} className="underline underline-offset-2">Open the conversation</Link>
      </p>
    );
  if (!open)
    return (
      <Button variant="outline" className="mt-3 h-11 rounded-sm" onClick={() => setOpen(true)}>
        {`Reply to ${name}`}
      </Button>
    );
  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      const { thread } = await call("dmStart", { player_id: reporter.id });
      await call("dmSend", { thread_id: thread.id, body: text.trim() });
      setSent(thread.id);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 space-y-2 rounded-sm border border-border bg-secondary/40 p-2.5">
      <label htmlFor={`reply-${report.id}`} className="block font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {`Private message to ${name}`}
      </label>
      <textarea
        id={`reply-${report.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        className="w-full rounded-sm border border-input bg-card px-3 py-2 text-base outline-none focus:border-foreground/40 lg:text-sm"
      />
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Button className="h-11 rounded-sm" disabled={busy || !text.trim()} onClick={send}>{busy ? "Sending…" : "Send"}</Button>
        <Button variant="outline" className="h-11 rounded-sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

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
                <ReplyToReporter report={r} reporter={people[r.reporter_player_id]} author={r.target ? people[r.target.author_player_id] : null} />
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && <Button variant="outline" className="h-11 w-full rounded-sm" onClick={() => q.fetchNextPage()}>Load more</Button>}
      </div>
    </>
  );
}
