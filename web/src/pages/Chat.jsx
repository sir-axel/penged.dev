import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { errMsg } from "@/hooks/useChat";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/chat/bits";
import { ChatBar } from "@/components/chat/ChatBar";
import { GeneralRoom } from "@/components/chat/GeneralRoom";
import { nameOf } from "@/lib/chatText";
import { timeAgo } from "@/lib/timeAgo";
import { api } from "@/api/client";

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

export function Chat() {
  const [params] = useSearchParams();
  const tab = params.get("tab") === "messages" ? "messages" : "forum";
  return (
    <>
      <ChatBar toggle={tab} />
      {tab === "forum" ? (
        <GeneralRoom />
      ) : (
        <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
          <Messages />
        </div>
      )}
    </>
  );
}
