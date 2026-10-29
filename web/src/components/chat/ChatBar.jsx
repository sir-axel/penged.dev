import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, MessageSquare, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { CHAT_UNREAD_KEY, useChatUnread } from "@/hooks/useChat";
import { BackButton } from "@/components/BackButton";
import { Avatar } from "@/components/Avatar";
import { CountBadge } from "@/hooks/useFeedbackCount";
import { nameOf } from "@/lib/chatText";
import { timeAgo } from "@/lib/timeAgo";
import { api } from "@/api/client";

const call = async (name, body) => (await api.functions.invoke(name, body)).data;

/** Where a mention happened, in words. */
function placeOf(m, people) {
  if (m.target?.kind === "dm") {
    const other = people[m.dm_other_player_id];
    return other ? `DM with ${nameOf(other)}` : "Direct message";
  }
  if (m.target?.kind === "general") return "General";
  return m.topic_title || "A topic";
}

/**
 * The "@" button with a red unread count. Opens a floating panel (focus stays inside until Esc / outside click /
 * choosing an item). Choosing a mention marks it read and goes to the exact message, which the page highlights.
 */
export function MentionsMenu() {
  const { isAuthenticated } = useAuth();
  const { mentions } = useChatUnread();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const panel = useRef(null);
  const q = useInfiniteQuery({
    queryKey: ["mentions"],
    enabled: isAuthenticated && open,
    initialPageParam: null,
    queryFn: ({ pageParam }) => call("mentionsList", { cursor: pageParam || undefined }),
    getNextPageParam: (l) => l.next_cursor || undefined,
    refetchOnMount: "always",
  });
  const items = (q.data?.pages || []).flatMap((p) => p.items);
  const people = Object.assign({}, ...(q.data?.pages || []).map((p) => p.people));
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["mentions"] });
    qc.invalidateQueries({ queryKey: [CHAT_UNREAD_KEY] });
  }, [qc]);
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    panel.current?.focus();
    const onDown = (e) => {
      if (!panel.current?.contains(e.target) && !btn.current?.contains(e.target)) close(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll("button:not([disabled]), a[href]")];
        if (!f.length) return e.preventDefault();
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!panel.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  if (!isAuthenticated) return null;
  const go = async (m) => {
    if (m.unread) await call("mentionsMarkRead", { ids: [m.id] }).catch(() => {});
    refresh();
    close(false);
    nav(m.target.path, { state: { jump: Date.now() } });
  };
  const markAll = async () => {
    await call("mentionsMarkRead", { all: true }).catch(() => {});
    refresh();
  };
  return (
    <div className="relative shrink-0">
      <button
        ref={btn}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={mentions > 0 ? `Mentions, ${mentions} unread` : "Mentions"}
        onClick={() => setOpen((v) => !v)}
        data-testid="mentions-button"
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-sm border ${open ? "border-foreground bg-foreground text-background" : "border-border bg-secondary hover:bg-accent"}`}
      >
        <AtSign className="h-4 w-4" aria-hidden="true" />
        <CountBadge n={mentions} className="absolute -right-2 -top-2 rounded-full" />
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label="Mentions"
          tabIndex={-1}
          data-testid="mentions-panel"
          className="absolute right-0 top-full z-50 mt-2 flex max-h-[min(70vh,32rem)] w-[min(26rem,calc(100vw-2rem))] flex-col border-2 border-foreground/80 bg-card shadow-xl outline-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <h2 className="font-display text-[0.55rem] uppercase tracking-[0.16em]">Mentions</h2>
            <button
              type="button"
              onClick={markAll}
              disabled={!mentions}
              className="min-h-9 rounded-sm px-2 font-display text-[0.5rem] uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
          <div className="overflow-y-auto overscroll-contain">
            {q.isLoading ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading...</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No mentions yet. When someone @mentions you it shows up here.</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="mention-list">
                {items.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => go(m)} className="flex min-h-14 w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-secondary/60">
                      <Avatar name={nameOf(people[m.by_player_id])} src={people[m.by_player_id]?.avatar_url} size={32} player={people[m.by_player_id]} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={`truncate text-sm ${m.unread ? "font-bold" : "font-semibold"}`}>{nameOf(people[m.by_player_id]) || "Someone"}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{timeAgo(m.created_date)}</span>
                        </span>
                        <span className="block truncate font-mono text-[10px] uppercase tracking-[0.08em] text-brand">in {placeOf(m, people)}</span>
                        <span className="line-clamp-2 block break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{m.snippet || "[removed]"}</span>
                      </span>
                      {m.unread && <span role="img" aria-label="Unread" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {q.hasNextPage && (
              <button type="button" onClick={() => q.fetchNextPage()} className="min-h-11 w-full border-t border-border text-sm text-muted-foreground hover:bg-secondary">
                Load more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Forum | Messages segmented switch (the second option needs an account and shows an unread dot). */
export function ForumMessagesToggle({ active }) {
  const { dms } = useChatUnread();
  const nav = useNavigate();
  const opts = [
    { key: "forum", label: "Forum", icon: Users },
    { key: "messages", label: "Messages", icon: MessageSquare },
  ];
  return (
    <div role="tablist" aria-label="Chat" className="inline-grid grid-cols-2 border-2 border-foreground/80">
      {opts.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={active === key}
          onClick={() => active !== key && nav(key === "forum" ? "/chat" : "/chat?tab=messages", { replace: true })}
          className={`relative inline-flex h-10 items-center justify-center gap-1.5 px-3 font-display text-[0.55rem] uppercase tracking-[0.12em] ${active === key ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
          {key === "messages" && dms > 0 && <span role="img" aria-label="Unread messages" className="h-2 w-2 rounded-full bg-brand" />}
        </button>
      ))}
    </div>
  );
}

/** Sticky strip under the site header on every chat view: back / the Forum-Messages switch on the left, the mentions button on the right. */
export function ChatBar({ back = null, backTo = null, toggle = null }) {
  return (
    <div className="sticky top-14 z-30 border-b border-border bg-background/95 backdrop-blur" data-testid="chat-bar">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {back && <BackButton inline fallback={back} to={backTo} />}
          {toggle && <ForumMessagesToggle active={toggle} />}
        </div>
        <MentionsMenu />
      </div>
    </div>
  );
}
