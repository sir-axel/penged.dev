import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { CHAT_UNREAD_KEY, errMsg, useChatUnread } from "@/hooks/useChat";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { BackButton } from "@/components/BackButton";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { CountBadge } from "@/hooks/useFeedbackCount";
import { Composer } from "@/components/chat/Composer";
import { CATEGORY_LABEL, CategoryChip, PersonLink, Spinner } from "@/components/chat/bits";
import { nameOf } from "@/lib/chatText";
import { timeAgo } from "@/lib/timeAgo";
import { api } from "@/api/client";

const CATS = [{ key: "", label: "All" }, ...Object.entries(CATEGORY_LABEL).map(([key, label]) => ({ key, label }))];
const call = async (name, body) => (await api.functions.invoke(name, body)).data;

function SignInNote({ what }) {
  const to = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  return (
    <EmptyState
      title="Sign in to continue"
      body={`You need an account to ${what}.`}
      action={<Link to={to} className="inline-flex min-h-11 items-center border border-foreground bg-card px-4 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary">Sign in</Link>}
    />
  );
}

function NewTopic({ category, onDone }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [cat, setCat] = useState(category || "general");
  const [title, setTitle] = useState("");
  const send = async (body) => {
    if (title.trim().length < 3) throw new Error("Give the topic a title (at least 3 characters).");
    const { topic } = await call("createTopic", { category: cat, title, body });
    qc.invalidateQueries({ queryKey: ["topics"] });
    nav(`/chat/t/${topic.id}`);
  };
  return (
    <section aria-label="New topic" className="mb-5 space-y-3 border-2 border-foreground/80 bg-card p-3 sm:p-4">
      <h2 className="font-heading text-lg font-bold">New topic</h2>
      <div role="radiogroup" aria-label="Category" className="grid grid-cols-3 border-2 border-foreground/80">
        {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={cat === k}
            onClick={() => setCat(k)}
            className={`min-h-11 border-r border-foreground/40 px-1 py-2 font-display text-[0.5rem] uppercase leading-tight tracking-[0.1em] last:border-r-0 sm:text-[0.58rem] ${cat === k ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="topic-title" className="mb-1 block font-display text-[0.5rem] uppercase tracking-[0.16em] text-muted-foreground">Title</label>
        <input
          id="topic-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="block h-11 w-full rounded-sm border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <Composer id="topic-body" label="First post" placeholder="What do you want to say? Type @ to mention someone." buttonLabel="Post topic" onSend={send} onCancel={onDone} rows={4} />
    </section>
  );
}

function Forum() {
  const [params, setParams] = useSearchParams();
  const cat = params.get("cat") || "";
  const { isAuthenticated } = useAuth();
  const { player } = useMyPlayer();
  const [composing, setComposing] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ["topics", cat],
    initialPageParam: null,
    queryFn: ({ pageParam }) => call("listTopics", { category: cat || undefined, cursor: pageParam || undefined }),
    getNextPageParam: (l) => l.next_cursor || undefined,
  });
  const items = (q.data?.pages || []).flatMap((p) => p.items);
  const people = Object.assign({}, ...(q.data?.pages || []).map((p) => p.people));
  const setCat = (k) => {
    const n = new URLSearchParams(params);
    if (k) n.set("cat", k);
    else n.delete("cat");
    setParams(n, { replace: true });
  };
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5">
          {CATS.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={cat === c.key}
              onClick={() => setCat(c.key)}
              className={`min-h-10 border px-3 font-display text-[0.5rem] uppercase tracking-[0.12em] ${cat === c.key ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-secondary"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {isAuthenticated && player && !composing && (
          <Button onClick={() => setComposing(true)} className="h-10 shrink-0 rounded-sm">
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            New topic
          </Button>
        )}
      </div>
      {composing && <NewTopic category={cat} onDone={() => setComposing(false)} />}
      {!isAuthenticated && <p className="mb-3 text-sm text-muted-foreground"><Link className="underline underline-offset-4" to="/login?returnTo=%2Fchat">Sign in</Link> to post or reply.</p>}
      {isAuthenticated && !player && <p className="mb-3 text-sm text-muted-foreground"><Link className="underline underline-offset-4" to="/welcome">Claim a username</Link> to post.</p>}
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <p role="alert" className="text-sm text-destructive">Could not load topics.</p>
      ) : items.length === 0 ? (
        <EmptyState title="No topics yet" body="Start the first conversation: a dispute, a question, or a call for a game." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden border border-border bg-card" data-testid="topic-list">
          {items.map((t) => (
            <li key={t.id}>
              <Link to={`/chat/t/${t.id}`} className="flex min-h-14 items-start gap-3 px-3 py-3 hover:bg-secondary/60">
                <Avatar name={nameOf(people[t.author_player_id])} src={people[t.author_player_id]?.avatar_url} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <CategoryChip category={t.category} />
                    {t.match_id && <span className="border border-border px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] text-muted-foreground">Match</span>}
                    {t.locked && <span className="font-mono text-[10px] uppercase text-muted-foreground">locked</span>}
                    {t.hidden && <span className="font-mono text-[10px] uppercase text-destructive">hidden</span>}
                  </span>
                  <span className="mt-1 block break-words font-heading text-base font-semibold leading-snug [overflow-wrap:anywhere]">{t.title}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                    {nameOf(people[t.author_player_id]) || "Former player"} · {Math.max(0, t.post_count - 1)} {t.post_count === 2 ? "reply" : "replies"} · {timeAgo(t.last_post_at)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && (
        <Button variant="outline" className="mt-3 h-11 w-full rounded-sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>Load more</Button>
      )}
    </div>
  );
}

function NewMessage() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const res = useQuery({
    queryKey: ["player-search", q.trim()],
    enabled: q.trim().length > 0,
    staleTime: 60000,
    queryFn: async () => (await call("playerSearch", { q: q.trim() })).items,
  });
  const { player } = useMyPlayer();
  const start = async (p) => {
    setErr("");
    try {
      const { thread } = await call("dmStart", { player_id: p.id });
      nav(`/chat/dm/${thread.id}`);
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const list = (res.data || []).filter((p) => p.id !== player?.id);
  return (
    <div className="mb-4">
      <label htmlFor="dm-find" className="mb-1 block font-display text-[0.5rem] uppercase tracking-[0.16em] text-muted-foreground">New message</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          id="dm-find"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a player by name"
          autoComplete="off"
          className="block h-11 w-full rounded-sm border border-input bg-card pl-9 pr-3 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      {err && <p role="alert" className="mt-1 text-sm text-destructive">{err}</p>}
      {q.trim() && (
        <ul className="mt-1 divide-y divide-border border border-border bg-card">
          {list.length === 0 && !res.isLoading && <li className="px-3 py-3 text-sm text-muted-foreground">No players found.</li>}
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => start(p)} className="flex min-h-11 w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary">
                <Avatar name={nameOf(p)} src={p.avatar_url} size={28} />
                <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">{nameOf(p)}</span>
                <span className="font-mono text-[11px] text-muted-foreground">@{p.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Messages() {
  const { isAuthenticated } = useAuth();
  const q = useInfiniteQuery({
    queryKey: ["dm-list"],
    enabled: isAuthenticated,
    initialPageParam: null,
    queryFn: ({ pageParam }) => call("dmList", { cursor: pageParam || undefined }),
    getNextPageParam: (l) => l.next_cursor || undefined,
    refetchInterval: 30000,
  });
  if (!isAuthenticated) return <SignInNote what="send private messages" />;
  const items = (q.data?.pages || []).flatMap((p) => p.items);
  return (
    <div>
      <NewMessage />
      {q.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No private messages yet" body="Message a player from their profile, or find them above." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden border border-border bg-card" data-testid="dm-list">
          {items.map((t) => (
            <li key={t.id}>
              <Link to={`/chat/dm/${t.id}`} className="flex min-h-14 items-center gap-3 px-3 py-3 hover:bg-secondary/60">
                <Avatar name={nameOf(t.other)} src={t.other?.avatar_url} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate font-heading text-base ${t.unread ? "font-bold" : "font-semibold"}`}>{nameOf(t.other) || "Former player"}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{timeAgo(t.last_message_at)}</span>
                  </span>
                  <span className={`block truncate text-sm ${t.unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {t.last_from_me ? "You: " : ""}{t.preview}
                  </span>
                </span>
                {t.unread && <span role="img" aria-label="Unread" className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && <Button variant="outline" className="mt-3 h-11 w-full rounded-sm" onClick={() => q.fetchNextPage()}>Load more</Button>}
    </div>
  );
}

function Mentions() {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const q = useInfiniteQuery({
    queryKey: ["mentions"],
    enabled: isAuthenticated,
    initialPageParam: null,
    queryFn: ({ pageParam }) => call("mentionsList", { cursor: pageParam || undefined }),
    getNextPageParam: (l) => l.next_cursor || undefined,
  });
  if (!isAuthenticated) return <SignInNote what="see your mentions" />;
  const items = (q.data?.pages || []).flatMap((p) => p.items);
  const people = Object.assign({}, ...(q.data?.pages || []).map((p) => p.people));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mentions"] });
    qc.invalidateQueries({ queryKey: [CHAT_UNREAD_KEY] });
  };
  const open = async (m) => {
    if (m.unread) await call("mentionsMarkRead", { ids: [m.id] }).catch(() => {});
    refresh();
    nav(m.source_kind === "dm" ? `/chat/dm/${m.thread_id}` : `/chat/t/${m.topic_id}`);
  };
  const markAll = async () => {
    await call("mentionsMarkRead", { all: true }).catch(() => {});
    refresh();
  };
  return (
    <div>
      {items.some((m) => m.unread) && (
        <div className="mb-3 flex justify-end">
          <Button variant="outline" onClick={markAll} className="h-10 rounded-sm">Mark all read</Button>
        </div>
      )}
      {q.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No mentions yet" body="When someone @mentions you in the forum or a private message, it shows up here." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden border border-border bg-card" data-testid="mention-list">
          {items.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => open(m)} className="flex min-h-14 w-full items-start gap-3 px-3 py-3 text-left hover:bg-secondary/60">
                <Avatar name={nameOf(people[m.by_player_id])} src={people[m.by_player_id]?.avatar_url} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{nameOf(people[m.by_player_id]) || "Someone"}</span>
                    {m.source_kind === "dm" ? " mentioned you in a message" : ` mentioned you in ${m.topic_title ? `"${m.topic_title}"` : "a topic"}`} · {timeAgo(m.created_date)}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block break-words text-sm [overflow-wrap:anywhere]">{m.snippet || "[removed]"}</span>
                </span>
                {m.unread && <span role="img" aria-label="Unread" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && <Button variant="outline" className="mt-3 h-11 w-full rounded-sm" onClick={() => q.fetchNextPage()}>Load more</Button>}
    </div>
  );
}

export function Chat() {
  const [params, setParams] = useSearchParams();
  const tab = ["messages", "mentions"].includes(params.get("tab")) ? params.get("tab") : "forum";
  const unread = useChatUnread();
  const tabs = [
    { key: "forum", label: "Forum", n: 0 },
    { key: "messages", label: "Messages", n: unread.dms },
    { key: "mentions", label: "Mentions", n: unread.mentions },
  ];
  return (
    <>
      <BackButton fallback="/" />
      <PageHeader eyebrow="Talk it out" title="Chat" description="Settle disputes, find a game, and talk to other players. The forum is open for everyone to read; messages are private." />
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        <div role="tablist" aria-label="Chat" className="mb-5 grid grid-cols-3 border-2 border-foreground/80">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setParams(t.key === "forum" ? {} : { tab: t.key }, { replace: true })}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 border-r border-foreground/40 px-2 py-2 font-display text-[0.55rem] uppercase tracking-[0.12em] last:border-r-0 sm:text-[0.6rem] ${tab === t.key ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}
            >
              {t.key === "messages" && <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
              {t.label}
              <CountBadge n={t.n} />
            </button>
          ))}
        </div>
        {tab === "forum" ? <Forum /> : tab === "messages" ? <Messages /> : <Mentions />}
      </div>
    </>
  );
}
