import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, EllipsisVertical, Flag } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { CHAT_UNREAD_KEY, errMsg } from "@/hooks/useChat";
import { ChatBar } from "@/components/chat/ChatBar";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/chat/Composer";
import { ReportDialog, Spinner, iconBtn } from "@/components/chat/bits";
import { RenderBody, nameOf } from "@/lib/chatText";
import { api } from "@/api/client";
import { clock, dayKey, dayLabel, hasKeyboard } from "@/lib/chatTime";

const call = async (name, body) => (await api.functions.invoke(name, body)).data;
export function ChatDm() {
  const { threadId } = useParams();
  const loc = useLocation();
  const [params] = useSearchParams();
  const msgParam = params.get("msg");
  const [highlight, setHighlight] = useState(null);
  const jump = useRef(null);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [msgs, setMsgs] = useState([]);
  const [people, setPeople] = useState({});
  const [older, setOlder] = useState(null);
  const [menu, setMenu] = useState(false);
  const [reportId, setReportId] = useState(null);
  const [actionErr, setActionErr] = useState("");
  const bottom = useRef(null);
  const stick = useRef(true);
  const newest = useRef(null);

  const head = useQuery({
    queryKey: ["dm-thread", threadId, msgParam, loc.key],
    queryFn: () =>
      msgParam
        ? call("dmMessages", { thread_id: threadId, around: msgParam }).catch((e) => (e?.status === 404 ? call("dmMessages", { thread_id: threadId }) : Promise.reject(e)))
        : call("dmMessages", { thread_id: threadId }),
    retry: (n, e) => e?.status !== 404 && n < 1,
    staleTime: 0,
    gcTime: 0,
  });
  const meta = head.data;
  useEffect(() => {
    if (!head.data) return;
    setMsgs(head.data.items);
    setPeople(head.data.people);
    setOlder(head.data.older_cursor);
    newest.current = head.data.items.at(-1)?.created_date || null;
    if (msgParam && head.data.items.some((m) => m.id === msgParam)) {
      jump.current = msgParam;
      stick.current = false;
    } else stick.current = true;
  }, [head.data, msgParam]);

  const markRead = useCallback(async () => {
    try {
      await call("dmMarkRead", { thread_id: threadId });
      qc.invalidateQueries({ queryKey: [CHAT_UNREAD_KEY] });
      qc.invalidateQueries({ queryKey: ["dm-list"] });
    } catch {
      /* the unread dot just stays until the next try */
    }
  }, [threadId, qc]);
  useEffect(() => {
    if (head.data) markRead();
  }, [head.data, markRead]);

  const merge = useCallback((incoming, extraPeople) => {
    if (extraPeople) setPeople((p) => ({ ...p, ...extraPeople }));
    setMsgs((cur) => {
      const have = new Set(cur.map((m) => m.id));
      const add = incoming.filter((m) => !have.has(m.id));
      if (!add.length) return cur;
      return [...cur, ...add].sort((a, b) => (a.created_date < b.created_date ? -1 : a.created_date > b.created_date ? 1 : a.id < b.id ? -1 : 1));
    });
    const last = incoming.at(-1);
    if (last && (!newest.current || last.created_date > newest.current)) newest.current = last.created_date;
  }, []);

  // Poll every 5 s while the tab is visible; also catch up the moment it becomes visible again.
  useEffect(() => {
    if (!head.data) return undefined;
    let stopped = false;
    let busy = false;
    const poll = async () => {
      if (stopped || busy || document.visibilityState !== "visible" || !newest.current) return;
      busy = true;
      try {
        const r = await call("dmMessages", { thread_id: threadId, after: newest.current });
        if (stopped) return;
        const known = new Set(msgsRef.current.map((m) => m.id));
        const fresh = r.items.filter((m) => !known.has(m.id));
        merge(r.items, r.people);
        setMeta((m) => ({ ...m, can_send: r.can_send, i_blocked: r.i_blocked }));
        if (fresh.some((m) => !m.mine)) markRead();
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
  }, [head.data, threadId, merge, markRead]);

  const [flags, setFlags] = useState(null);
  const msgsRef = useRef([]);
  msgsRef.current = msgs;
  const setMeta = (fn) => setFlags((f) => fn(f || {}));
  const canSend = flags?.can_send ?? meta?.can_send;
  const iBlocked = flags?.i_blocked ?? meta?.i_blocked;

  useLayoutEffect(() => {
    if (jump.current) {
      const id = jump.current;
      const el = document.getElementById(`m-${id}`);
      if (el) {
        jump.current = null;
        el.scrollIntoView({ block: "center" });
        setHighlight(id);
      }
    } else if (stick.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, head.data]);
  useEffect(() => {
    if (!highlight) return undefined;
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(t);
  }, [highlight]);

  if (head.isLoading) return <><ChatBar back="/chat?tab=messages" /><Spinner /></>;
  if (head.isError || !meta)
    return (
      <>
        <ChatBar back="/chat?tab=messages" />
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6"><EmptyState title="Conversation not found" body="It may not exist, or it is not yours." /></div>
      </>
    );
  const other = meta.thread.other;
  const myId = meta.thread.my_player_id;
  const candidates = [other, people[myId]].filter(Boolean);

  const loadOlder = async () => {
    const r = await call("dmMessages", { thread_id: threadId, cursor: older });
    stick.current = false;
    merge(r.items, r.people);
    setOlder(r.older_cursor);
  };
  const toggleBlock = async () => {
    setMenu(false);
    setActionErr("");
    try {
      if (iBlocked) await call("unblock", { player_id: other.id });
      else {
        if (!window.confirm(`Block ${nameOf(other)}? You will not be able to message each other.`)) return;
        await call("block", { player_id: other.id });
      }
      const r = await call("dmMessages", { thread_id: threadId, after: newest.current || new Date().toISOString() });
      setFlags((f) => ({ ...(f || {}), can_send: r.can_send, i_blocked: r.i_blocked }));
    } catch (e) {
      setActionErr(errMsg(e));
    }
  };

  let lastDay = null;
  return (
    <div className="flex min-h-[calc(100svh-3.5rem-70px)] flex-col md:min-h-[calc(100svh-3.5rem)]">
      <ChatBar back="/chat?tab=messages" />
      <div className="sticky top-[7rem] z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2 sm:px-6">
          {other ? (
            <Link to={`/players/${encodeURIComponent(other.username)}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={nameOf(other)} src={other.avatar_url} size={36} />
              <span className="min-w-0">
                <span className="block truncate font-heading text-base font-bold">{nameOf(other)}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">@{other.username}</span>
              </span>
            </Link>
          ) : (
            <span className="flex-1 text-muted-foreground">Former player</span>
          )}
          <div className="relative">
            <button type="button" className={`${iconBtn} min-w-10 justify-center`} aria-label="Conversation options" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-48 border-2 border-foreground/80 bg-card shadow-lg">
                <button role="menuitem" type="button" onClick={toggleBlock} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary">
                  <Ban className="h-4 w-4" aria-hidden="true" />{iBlocked ? "Unblock" : "Block"}
                </button>
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    const lastTheirs = [...msgs].reverse().find((m) => !m.mine && !m.removed);
                    if (!lastTheirs) setActionErr("There is no message from them to report yet.");
                    else setReportId(lastTheirs.id);
                  }}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-secondary"
                >
                  <Flag className="h-4 w-4" aria-hidden="true" />Report latest message
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-4 sm:px-6" aria-live="polite" onClick={() => setMenu(false)}>
        {older && <Button variant="outline" className="mb-3 h-11 w-full rounded-sm" onClick={loadOlder}>Load earlier messages</Button>}
        {actionErr && <p role="alert" className="mb-2 text-sm text-destructive">{actionErr}</p>}
        {msgs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Say hello to {nameOf(other) || "them"}. Messages are private.</p>}
        <ul className="space-y-1.5" data-testid="dm-messages">
          {msgs.map((m) => {
            const dk = dayKey(m.created_date);
            const sep = dk !== lastDay;
            lastDay = dk;
            return (
              <li key={m.id} id={`m-${m.id}`}>
                {sep && (
                  <p className="my-3 text-center font-display text-[0.5rem] uppercase tracking-[0.18em] text-muted-foreground">{dayLabel(m.created_date)}</p>
                )}
                <div className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div
                    data-highlighted={highlight === m.id ? "true" : undefined}
                    className={`max-w-[85%] rounded-sm border px-3 py-2 text-sm leading-relaxed transition-shadow duration-700 ${highlight === m.id ? "ring-4 ring-brand" : ""} ${m.mine ? "border-foreground bg-foreground text-background" : "border-border bg-card"}`}
                  >
                    {m.removed ? <em className="opacity-70">[removed]</em> : <RenderBody body={m.body} people={people} className={m.mine ? "[&_a]:text-inherit [&_a]:underline" : ""} />}
                    <span className={`mt-0.5 block text-right font-mono text-[10px] ${m.mine ? "text-background/70" : "text-muted-foreground"}`}>{clock(m.created_date)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottom} style={{ scrollMarginBottom: "190px" }} />
      </div>
      {canSend ? (
        <Composer
          id="dm-body"
          sticky
          placeholder={`Message ${nameOf(other)}. Type @ to mention.${hasKeyboard() ? " Ctrl/Cmd+Enter sends." : ""}`}
          buttonLabel="Send"
          candidates={candidates}
          rows={2}
          onSend={async (body) => {
            const { message } = await call("dmSend", { thread_id: threadId, body });
            stick.current = true;
            merge([message]);
            qc.invalidateQueries({ queryKey: ["dm-list"] });
          }}
        />
      ) : (
        <p className="mx-auto max-w-2xl px-4 py-4 text-center text-sm text-muted-foreground sm:px-6">
          {iBlocked ? "You blocked this player. Unblock them from the menu to chat again." : "You can't send messages in this conversation."}
        </p>
      )}
      <ReportDialog kind="dm" targetId={reportId} open={!!reportId} onOpenChange={(v) => !v && setReportId(null)} />
    </div>
  );
}
