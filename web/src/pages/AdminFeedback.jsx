import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

const TABS = [
  { key: "new", label: "New" },
  { key: "read", label: "Read" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];
const KIND_STYLE = {
  bug: "bg-destructive text-white",
  idea: "bg-brand text-white",
  other: "bg-foreground text-background",
};
const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

function Item({ item, onChange, busy }) {
  const [note, setNote] = useState(item.admin_note || "");
  const dirty = note.trim() !== (item.admin_note || "");
  const act = (status) => onChange(item.id, { status, ...(dirty ? { admin_note: note } : {}) });
  const btn = "h-11 flex-1 rounded-sm sm:flex-none";
  return (
    <li className="rounded-sm border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] ${KIND_STYLE[item.kind]}`}>
          {item.kind}
        </span>
        {item.status !== "new" && (
          <span className="border border-border px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] text-muted-foreground">
            {item.status}
          </span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{when(item.created_date)}</span>
      </div>
      <p className="mt-2 text-sm font-semibold">
        {item.username ? (
          <Link to={`/players/${encodeURIComponent(item.username)}`} className="underline underline-offset-4 hover:text-brand">
            {item.username}
          </Link>
        ) : (
          <>
            Visitor
            {item.contact && <span className="ml-1 break-all font-normal text-muted-foreground">· {item.contact}</span>}
          </>
        )}
      </p>
      {item.page && <p className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">from {item.page}</p>}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{item.message}</p>
      <label className="mt-3 block">
        <span className="font-display text-[0.5rem] uppercase tracking-[0.16em] text-muted-foreground">Admin note (private)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          className="mt-1 block w-full rounded-sm border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {item.status === "new" && (
          <Button variant="outline" className={btn} disabled={busy} onClick={() => act("read")}>
            Mark read
          </Button>
        )}
        {item.status !== "done" && (
          <Button className={btn} disabled={busy} onClick={() => act("done")}>
            Mark done
          </Button>
        )}
        {item.status !== "new" && (
          <Button variant="outline" className={btn} disabled={busy} onClick={() => act("new")}>
            Reopen
          </Button>
        )}
        {dirty && (
          <Button variant="ghost" className={btn} disabled={busy} onClick={() => onChange(item.id, { admin_note: note })}>
            Save note
          </Button>
        )}
      </div>
    </li>
  );
}

export function AdminFeedback() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("new");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const isAdmin = user?.role === "admin";
  const q = useInfiniteQuery({
    queryKey: ["feedback", tab],
    enabled: isAdmin,
    initialPageParam: null,
    queryFn: async ({ pageParam }) =>
      (
        await api.functions.invoke("listFeedback", {
          status: tab === "all" ? undefined : tab,
          limit: 25,
          cursor: pageParam || undefined,
        })
      ).data,
    getNextPageParam: (last) => last.next_cursor || undefined,
  });
  const pages = q.data?.pages || [];
  const items = pages.flatMap((p) => p.items);
  const counts = pages[0]?.counts || {};

  const change = async (id, patch) => {
    setBusy(id);
    setError("");
    try {
      await api.functions.invoke("updateFeedback", { id, ...patch });
      await queryClient.invalidateQueries({ queryKey: ["feedback"] });
      queryClient.invalidateQueries({ queryKey: ["feedback-new-count"] });
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Could not update that.");
    } finally {
      setBusy("");
    }
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState title="Admins only" body="The feedback inbox is limited to ladder admins." />
      </div>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Feedback"
        description="Bugs, ideas and notes from players and visitors, newest first."
        action={
          <Link
            to="/admin/reviews"
            className="inline-flex min-h-10 items-center border border-foreground bg-card px-3 py-1.5 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary"
          >
            Challenge penalties
          </Link>
        }
      />
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6">
        <div role="tablist" aria-label="Status" className="grid grid-cols-4 border-2 border-foreground/80">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex min-h-11 items-center justify-center gap-1.5 border-r border-foreground/40 px-1 font-display text-[0.55rem] uppercase tracking-[0.1em] last:border-r-0 sm:text-[0.6rem] ${tab === t.key ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}
            >
              {t.label}
              <span className="font-mono text-[10px] opacity-70">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {q.isLoading ? (
          <div className="flex justify-center py-10">
            <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : q.isError ? (
          <p role="alert" className="text-sm text-destructive">Could not load feedback.</p>
        ) : items.length === 0 ? (
          <EmptyState title="Nothing here" body={tab === "new" ? "No unread feedback. Nice." : "No feedback in this tab."} />
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <Item key={`${it.id}:${it.updated_date}`} item={it} busy={busy === it.id} onChange={change} />
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <Button variant="outline" className="h-11 w-full rounded-sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {q.isFetchingNextPage && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Load more
          </Button>
        )}
      </div>
    </>
  );
}
