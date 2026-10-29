import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, Lock, LockOpen, EyeOff, Eye, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { errMsg } from "@/hooks/useChat";
import { ChatBar } from "@/components/chat/ChatBar";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { Composer } from "@/components/chat/Composer";
import { CategoryChip, PersonLink, ReportDialog, Spinner, iconBtn } from "@/components/chat/bits";
import { RenderBody, nameOf, tokensToPlain } from "@/lib/chatText";
import { whenShort } from "@/components/FeedbackThread";
import { hasKeyboard } from "@/lib/chatTime";
import { api } from "@/api/client";

const call = async (name, body) => (await api.functions.invoke(name, body)).data;
const EDIT_MS = 24 * 3600e3;

function Post({ post, people, admin, topic, onChanged, setReport, highlighted }) {
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState("");
  const author = people[post.author_player_id];
  const canEdit = post.mine && !post.removed && Date.now() - new Date(post.created_date).getTime() < EDIT_MS;
  const act = async (fn) => {
    setErr("");
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr(errMsg(e));
    }
  };
  const del = () => {
    if (post.mine && !window.confirm("Delete this post?")) return;
    act(() => call("deletePost", { id: post.id }));
  };
  return (
    <li id={`p-${post.id}`} className={`flex gap-3 px-3 py-3 transition-colors duration-700 ${highlighted ? "bg-brand/20 outline outline-2 -outline-offset-2 outline-brand" : ""}`} data-testid="post" data-highlighted={highlighted ? "true" : undefined}>
      {post.removed && !admin ? (
        <span className="mt-0.5 h-9 w-9 shrink-0 rounded-sm border border-dashed border-border" aria-hidden="true" />
      ) : (
        <Avatar name={nameOf(author)} src={author?.avatar_url} size={36} />
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {post.removed && !admin ? <span className="text-muted-foreground">Removed</span> : <PersonLink person={author} />}
          <span className="font-mono text-[11px] text-muted-foreground">{whenShort(post.created_date)}</span>
          {post.edited_at && <span className="font-mono text-[11px] italic text-muted-foreground" title={whenShort(post.edited_at)}>(edited)</span>}
          {admin && post.hidden && <span className="font-mono text-[10px] uppercase text-destructive">hidden</span>}
          {admin && post.deleted && <span className="font-mono text-[10px] uppercase text-muted-foreground">deleted by author</span>}
        </p>
        {editing ? (
          <div className="mt-2">
            <Composer
              id={`edit-${post.id}`}
              label="Edit post"
              buttonLabel="Save"
              {...(() => {
                const t = tokensToPlain(post.body, people);
                return { initialText: t.text, initialMentions: t.mentions };
              })()}
              autoFocus
              onCancel={() => setEditing(false)}
              onSend={async (body) => {
                await call("editPost", { id: post.id, body });
                setEditing(false);
                onChanged();
              }}
            />
          </div>
        ) : post.removed && !admin ? (
          <p className="mt-1 text-sm italic text-muted-foreground">[removed]</p>
        ) : (
          <p className={`mt-1 text-sm leading-relaxed ${post.removed ? "opacity-60" : ""}`}>
            <RenderBody body={post.body} people={people} />
          </p>
        )}
        {err && <p role="alert" className="mt-1 text-sm text-destructive">{err}</p>}
        {!editing && !(post.removed && !admin) && (
          <div className="-ml-2.5 mt-1 flex flex-wrap items-center">
            {canEdit && (
              <button type="button" className={iconBtn} onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit
              </button>
            )}
            {post.mine && !post.removed && (
              <button type="button" className={iconBtn} onClick={del}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Delete
              </button>
            )}
            {!post.mine && !post.removed && (
              <button type="button" className={iconBtn} onClick={() => setReport(post.id)}>
                <Flag className="h-3.5 w-3.5" aria-hidden="true" />Report
              </button>
            )}
            {admin && !post.mine && !post.hidden && (
              <button type="button" className={`${iconBtn} text-destructive`} onClick={() => act(() => call("deletePost", { id: post.id }))}>
                <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />Hide
              </button>
            )}
            {admin && post.hidden && (
              <button type="button" className={iconBtn} onClick={() => act(() => call("deletePost", { id: post.id, restore: true }))}>
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />Unhide
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function ChatTopic() {
  const { id } = useParams();
  const loc = useLocation();
  const [params] = useSearchParams();
  const postParam = params.get("post");
  const [highlight, setHighlight] = useState(null);
  const doneJump = useRef(null);
  const anchor = useRef(null);
  const { user, isAuthenticated } = useAuth();
  const { player } = useMyPlayer();
  const qc = useQueryClient();
  const admin = user?.role === "admin";
  const [report, setReport] = useState(null);
  const [reportTopic, setReportTopic] = useState(false);
  const q = useInfiniteQuery({
    queryKey: ["topic", id, user?.id || null, postParam, loc.key],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => {
      if (pageParam?.before) return call("getTopic", { id, before: pageParam.before });
      if (pageParam?.after) return call("getTopic", { id, cursor: pageParam.after });
      if (postParam) return call("getTopic", { id, around: postParam }).catch(() => call("getTopic", { id }));
      return call("getTopic", { id });
    },
    getNextPageParam: (l) => (l.next_cursor ? { after: l.next_cursor } : undefined),
    getPreviousPageParam: (f) => (f.older_cursor ? { before: f.older_cursor } : undefined),
    retry: (n, e) => e?.status !== 404 && n < 1,
  });
  const pages = q.data?.pages || [];
  const topic = pages[0]?.topic;
  const posts = useMemo(() => pages.flatMap((p) => p.posts), [pages]);
  const people = useMemo(() => Object.assign({}, ...pages.map((p) => p.people)), [pages]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["topic", id] });

  // Arrived from a mention: scroll to that post and highlight it for 2 s.
  useEffect(() => {
    if (!postParam || !posts.length) return;
    const key = `${loc.key}:${postParam}`;
    if (doneJump.current === key) return;
    const el = document.getElementById(`p-${postParam}`);
    if (!el) return;
    doneJump.current = key;
    el.scrollIntoView({ block: "center" });
    setHighlight(postParam);
    const t = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(t);
  }, [postParam, loc.key, posts.length]);
  useLayoutEffect(() => {
    if (!anchor.current) return;
    const { h, y } = anchor.current;
    anchor.current = null;
    window.scrollTo(0, y + (document.documentElement.scrollHeight - h));
  }, [posts.length]);

  if (q.isLoading) return <><ChatBar back="/chat/disputes" /><Spinner /></>;
  if (q.isError || !topic)
    return (
      <>
        <ChatBar back="/chat/disputes" />
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6"><EmptyState title="Topic not found" body="It may have been removed." /></div>
      </>
    );
  const adminTopic = async (patch) => {
    await call("adminTopic", { id, ...patch });
    refresh();
  };
  const canPost = isAuthenticated && player && (!topic.locked || admin);
  return (
    <div className="flex min-h-[calc(100svh-3.5rem-70px)] flex-col md:min-h-[calc(100svh-3.5rem)]">
      <ChatBar back="/chat/disputes" />
      <div className="mx-auto w-full max-w-2xl px-4 pb-2 pt-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip category={topic.category} />
          {topic.locked && <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase text-muted-foreground"><Lock className="h-3 w-3" aria-hidden="true" />Locked</span>}
          {topic.hidden && <span className="font-mono text-[11px] uppercase text-destructive">Hidden</span>}
        </div>
        <h1 className="mt-2 break-words font-heading text-2xl font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{topic.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3">
          {topic.match_id && (
            <Link to={`/matches/${topic.match_id}`} className="inline-flex min-h-10 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-brand underline underline-offset-4">View the match</Link>
          )}
          {isAuthenticated && (
            <button type="button" className={iconBtn} onClick={() => setReportTopic(true)}>
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />Report topic
            </button>
          )}
          {admin && (
            <>
              <button type="button" className={iconBtn} onClick={() => adminTopic({ locked: !topic.locked })}>
                {topic.locked ? <LockOpen className="h-3.5 w-3.5" aria-hidden="true" /> : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                {topic.locked ? "Unlock" : "Lock"}
              </button>
              <button type="button" className={iconBtn} onClick={() => adminTopic({ hidden: !topic.hidden })}>
                {topic.hidden ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                {topic.hidden ? "Unhide topic" : "Hide topic"}
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6">
        {q.hasPreviousPage && (
          <Button
            variant="outline"
            className="mb-3 h-11 w-full rounded-sm"
            disabled={q.isFetchingPreviousPage}
            onClick={() => {
              anchor.current = { h: document.documentElement.scrollHeight, y: window.scrollY };
              q.fetchPreviousPage();
            }}
          >
            Load earlier
          </Button>
        )}
        <ul className="divide-y divide-border overflow-hidden border border-border bg-card" data-testid="posts">
          {posts.map((p) => (
            <Post key={p.id} post={p} people={people} admin={admin} topic={topic} onChanged={refresh} setReport={setReport} highlighted={highlight === p.id} />
          ))}
        </ul>
        {q.hasNextPage && (
          <Button variant="outline" className="mt-3 h-11 w-full rounded-sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            Load more
          </Button>
        )}
      </div>
      <div className="mt-4 contents">
        {canPost && !q.hasNextPage ? (
          <Composer
            id="reply"
            sticky
            label="Reply"
            placeholder={`Write a reply. Type @ to mention someone.${hasKeyboard() ? " Ctrl/Cmd+Enter sends." : ""}`}
            buttonLabel="Post reply"
            onSend={async (body) => {
              await call("createPost", { topic_id: id, body });
              await qc.invalidateQueries({ queryKey: ["topic", id] });
              qc.invalidateQueries({ queryKey: ["disputes"] });
              setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 100);
            }}
          />
        ) : (
          <p className="mx-auto max-w-2xl px-4 py-3 text-sm text-muted-foreground sm:px-6">
            {topic.locked && !admin ? "This topic is locked." : !isAuthenticated ? <><Link className="underline underline-offset-4" to={`/login?returnTo=${encodeURIComponent(`/chat/t/${id}`)}`}>Sign in</Link> to reply.</> : !player ? <Link className="underline underline-offset-4" to="/welcome">Claim a username to reply.</Link> : "Load the remaining posts to reply."}
          </p>
        )}
      </div>
      <ReportDialog kind="post" targetId={report} open={!!report} onOpenChange={(v) => !v && setReport(null)} />
      <ReportDialog kind="topic" targetId={id} open={reportTopic} onOpenChange={setReportTopic} />
    </div>
  );
}
