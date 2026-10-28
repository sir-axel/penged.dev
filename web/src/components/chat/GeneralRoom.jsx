import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowDown, ShieldAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { useQueryClient } from "@tanstack/react-query";
import { CHAT_UNREAD_KEY, useDisputeCounts } from "@/hooks/useChat";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/chat/Composer";
import { ReportDialog, Spinner } from "@/components/chat/bits";
import { RoomMessage } from "@/components/chat/RoomMessage";
import { clock, cursorOfItem, dayKey, dayLabel, hasKeyboard } from "@/lib/chatTime";
import { api } from "@/api/client";

const call = async (name, body) => (await api.functions.invoke(name, body)).data;
const GROUP_MS = 5 * 60e3;
const byTime = (a, b) => (a.created_date < b.created_date ? -1 : a.created_date > b.created_date ? 1 : a.id < b.id ? -1 : 1);

/** The red button top-right of the Forum view. */
function DisputesButton() {
  const { n, signedIn } = useDisputeCounts();
  return (
    <Link
      to="/chat/disputes"
      data-testid="disputes-button"
      aria-label={n > 0 ? `Disputes, ${n} ${signedIn ? "open" : "recent"}` : "Disputes"}
      className="inline-flex h-11 shrink-0 items-center gap-2 border-2 border-brand bg-brand px-4 font-display text-[0.6rem] uppercase tracking-[0.14em] text-white shadow-[3px_3px_0_0_hsl(var(--foreground)/0.8)] hover:brightness-110 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_hsl(var(--foreground)/0.8)]"
    >
      <ShieldAlert className="h-4 w-4" aria-hidden="true" />
      Disputes
      {n > 0 && <span className="min-w-5 bg-white px-1.5 py-0.5 text-center font-mono text-[10px] font-bold leading-none text-brand">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}

/** General: one permanent live room shown as a chat stream (newest at the bottom). */
export function GeneralRoom() {
  const [params] = useSearchParams();
  const location = useLocation();
  const postParam = params.get("post");
  const { user, isAuthenticated } = useAuth();
  const { player } = useMyPlayer();
  const qc = useQueryClient();
  const admin = user?.role === "admin";

  const [status, setStatus] = useState("loading");
  const [posts, setPosts] = useState([]);
  const [people, setPeople] = useState({});
  const [older, setOlder] = useState(null);
  const [live, setLive] = useState(true);
  const [locked, setLocked] = useState(false);
  const [unseen, setUnseen] = useState(0);
  const [highlight, setHighlight] = useState(null);
  const [note, setNote] = useState("");
  const [report, setReport] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const postsRef = useRef([]);
  postsRef.current = posts;
  const endRef = useRef(null);
  const stick = useRef(false);
  const jump = useRef(null);
  const anchor = useRef(null);

  const nearBottom = () => {
    const el = endRef.current;
    return !el || el.getBoundingClientRect().top - window.innerHeight < 80;
  };
  const apply = (r) => {
    setPosts(r.posts);
    setPeople(r.people);
    setOlder(r.older_cursor);
    setLive(!r.next_cursor);
    setLocked(!!r.topic?.locked);
    setUnseen(0);
    setStatus("ready");
  };
  const loadLatest = useCallback(async () => {
    const r = await call("roomPosts", {});
    stick.current = true;
    apply(r);
  }, []);

  // Open the room (latest messages), or the window around a mentioned message.
  useEffect(() => {
    let dead = false;
    setStatus("loading");
    setNote("");
    (async () => {
      try {
        if (postParam) {
          try {
            const r = await call("roomAround", { post_id: postParam });
            if (dead) return;
            jump.current = postParam;
            return apply(r);
          } catch (e) {
            if (e?.status !== 404) throw e;
            setNote("That message is no longer in the room.");
          }
        }
        const r = await call("roomPosts", {});
        if (dead) return;
        stick.current = true;
        apply(r);
      } catch {
        if (!dead) setStatus("error");
      }
    })();
    return () => {
      dead = true;
    };
  }, [postParam, location.key]);

  // After the list changes: finish a jump, keep the place when older messages were added on top, or follow the end.
  useLayoutEffect(() => {
    if (anchor.current) {
      const { h, y } = anchor.current;
      anchor.current = null;
      window.scrollTo(0, y + (document.documentElement.scrollHeight - h));
    } else if (jump.current) {
      const id = jump.current;
      const el = document.getElementById(`p-${id}`);
      if (el) {
        jump.current = null;
        el.scrollIntoView({ block: "center" });
        setHighlight(id);
      }
    } else if (stick.current) {
      stick.current = false;
      endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [posts, status]);
  useEffect(() => {
    if (!highlight) return undefined;
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(t);
  }, [highlight]);

  const merge = useCallback((incoming, extraPeople, force) => {
    if (extraPeople) setPeople((p) => ({ ...p, ...extraPeople }));
    const have = new Set(postsRef.current.map((p) => p.id));
    const fresh = incoming.filter((p) => !have.has(p.id));
    if (!fresh.length) return;
    if (fresh.some((p) => !p.mine)) qc.invalidateQueries({ queryKey: [CHAT_UNREAD_KEY] }); // a new line may mention me
    const follow = force || nearBottom() || fresh.every((p) => p.mine);
    if (follow) stick.current = true;
    else setUnseen((u) => u + fresh.filter((p) => !p.mine).length);
    setPosts((cur) => {
      const ids = new Set(cur.map((p) => p.id));
      return [...cur, ...fresh.filter((p) => !ids.has(p.id))].sort(byTime);
    });
  }, [qc]);

  // Live: every 5 s while the tab is visible ask only for posts after the newest one we have (and catch up when it becomes visible).
  useEffect(() => {
    if (status !== "ready" || !live) return undefined;
    let stopped = false;
    let busy = false;
    const poll = async () => {
      if (stopped || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        let cursor = cursorOfItem(postsRef.current.at(-1));
        for (let i = 0; i < 5; i++) {
          const r = await call("roomPosts", { after: cursor || undefined });
          if (stopped) return;
          merge(r.posts, r.people);
          if (!r.next_cursor || !r.posts.length) break;
          cursor = cursorOfItem(r.posts.at(-1));
        }
      } catch {
        /* try again on the next tick */
      } finally {
        busy = false;
      }
    };
    const t = setInterval(poll, 5000);
    const vis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", vis);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [status, live, merge]);

  useEffect(() => {
    const onScroll = () => nearBottom() && setUnseen(0);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Edits/deletes/hides: re-read the newest page and swap those posts in place.
  const refreshTail = async () => {
    try {
      const r = await call("roomPosts", {});
      const fresh = new Map(r.posts.map((p) => [p.id, p]));
      setPeople((p) => ({ ...p, ...r.people }));
      setPosts((cur) => cur.map((p) => fresh.get(p.id) || p));
    } catch {
      /* the next poll or reload fixes it */
    }
  };
  const loadOlder = async () => {
    if (!older || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await call("roomPosts", { before: older });
      anchor.current = { h: document.documentElement.scrollHeight, y: window.scrollY };
      setPeople((p) => ({ ...p, ...r.people }));
      setPosts((cur) => {
        const ids = new Set(cur.map((p) => p.id));
        return [...r.posts.filter((p) => !ids.has(p.id)), ...cur];
      });
      setOlder(r.older_cursor);
    } finally {
      setLoadingOlder(false);
    }
  };
  const toEnd = () => {
    setUnseen(0);
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  };

  const canPost = isAuthenticated && player && (!locked || admin);
  let prev = null;
  const rows = posts.map((p) => {
    const newDay = !prev || dayKey(prev.created_date) !== dayKey(p.created_date);
    const grouped =
      !newDay && !p.removed && !prev.removed && p.author_player_id && p.author_player_id === prev.author_player_id &&
      new Date(p.created_date) - new Date(prev.created_date) < GROUP_MS;
    const out = { p, newDay, grouped };
    prev = p;
    return out;
  });

  return (
    <div className="flex min-h-[calc(100svh-3.5rem-3.5rem-70px)] flex-col md:min-h-[calc(100svh-3.5rem-3.5rem)]">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-bold leading-none">General</h1>
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
            <span className="h-2 w-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />
            Live room · everyone can read
          </p>
        </div>
        <DisputesButton />
      </div>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6" aria-live="polite" aria-relevant="additions">
        {status === "loading" ? (
          <Spinner />
        ) : status === "error" ? (
          <p role="alert" className="py-8 text-center text-sm text-destructive">Could not load the room. <button type="button" className="underline" onClick={() => loadLatest().catch(() => setStatus("error"))}>Try again</button></p>
        ) : (
          <div className="overflow-hidden border border-border bg-card pb-2">
            {note && <p role="status" className="border-b border-border px-3 py-2 text-sm text-muted-foreground">{note}</p>}
            {older && (
              <div className="p-2">
                <Button variant="outline" className="h-10 w-full rounded-sm" disabled={loadingOlder} onClick={loadOlder}>Load earlier</Button>
              </div>
            )}
            {rows.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>}
            <ul data-testid="room-stream">
              {rows.map(({ p, newDay, grouped }) => (
                <Fragment key={p.id}>
                  {newDay && <li aria-hidden="true" className="px-3 pb-1 pt-4 text-center font-display text-[0.5rem] uppercase tracking-[0.18em] text-muted-foreground">{dayLabel(p.created_date)}</li>}
                  <RoomMessage post={p} people={people} admin={admin} grouped={grouped} highlighted={highlight === p.id} onChanged={refreshTail} onReport={setReport} />
                </Fragment>
              ))}
            </ul>
          </div>
        )}
        <div ref={endRef} style={{ scrollMarginBottom: "190px" }} aria-hidden="true" />
        {status === "ready" && !live && (
          <Button variant="outline" className="mt-3 h-11 w-full rounded-sm" onClick={() => loadLatest().catch(() => {})}>
            <ArrowDown className="mr-2 h-4 w-4" aria-hidden="true" />Jump to the latest messages
          </Button>
        )}
      </div>
      <div className="chat-composer sticky bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 mt-4 border-t-2 border-foreground/80 bg-background/95 px-4 pb-3 pt-3 backdrop-blur md:bottom-0 md:px-0">
        {unseen > 0 && live && (
          <button
            type="button"
            onClick={toEnd}
            data-testid="new-messages-pill"
            className="absolute bottom-full left-1/2 z-10 mb-3 inline-flex h-9 -translate-x-1/2 items-center gap-1.5 rounded-full border-2 border-foreground/80 bg-brand px-4 font-display text-[0.55rem] uppercase tracking-[0.12em] text-white shadow-lg"
          >
            New messages <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <div className="mx-auto max-w-2xl sm:px-6">
          {canPost ? (
            <Composer
              id="room-body"
              placeholder={hasKeyboard() ? "Message General. @ to mention. Enter sends, Shift+Enter for a new line." : "Message General. Type @ to mention."}
              buttonLabel="Send"
              enterToSend={hasKeyboard()}
              rows={2}
              onSend={async (body) => {
                const r = await call("createPost", { topic_id: "general", body });
                merge([r.post], r.people, true);
              }}
            />
          ) : (
            <p className="py-2 text-center text-sm text-muted-foreground">
              {locked && !admin ? "The room is locked." : !isAuthenticated ? (
                <Link className="font-semibold text-foreground underline underline-offset-4" to={`/login?returnTo=${encodeURIComponent("/chat")}`}>Sign in to chat</Link>
              ) : (
                <Link className="font-semibold text-foreground underline underline-offset-4" to="/welcome">Claim a username to chat</Link>
              )}
            </p>
          )}
        </div>
      </div>
      <ReportDialog kind="post" targetId={report} open={!!report} onOpenChange={(v) => !v && setReport(null)} />
    </div>
  );
}
