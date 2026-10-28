import { BackButton } from "@/components/BackButton";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";
import { ReplyBox, ReplyList, whenShort } from "@/components/FeedbackThread";

export const MAX_FEEDBACK = 2000;
const KINDS = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
];

/** Same-site path only ("/x?y"), never an external URL. */
const safePath = (v) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v.slice(0, 200) : "");
function referrerPath() {
  try {
    const u = new URL(document.referrer);
    return u.origin === window.location.origin ? safePath(u.pathname + u.search) : "";
  } catch {
    return "";
  }
}
/** Link to the feedback form that remembers where the person was. */
export const feedbackHref = (from) => (from && from !== "/feedback" ? `/feedback?from=${encodeURIComponent(from)}` : "/feedback");

const KIND_STYLE = {
  bug: "bg-destructive text-destructive-foreground",
  idea: "bg-brand text-brand-foreground",
  other: "bg-foreground text-background",
};
const STATUS_LABEL = { new: "Sent", read: "Seen", done: "Resolved" };

function MyItem({ item, onSeen, onReply }) {
  const [open, setOpen] = useState(false);
  const unread = item.user_unread;
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unread) onSeen(item.id);
  };
  return (
    <li className="rounded-sm border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-start gap-3 p-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] ${KIND_STYLE[item.kind]}`}>{item.kind}</span>
            <span className="border border-border px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] text-muted-foreground">
              {STATUS_LABEL[item.status] || item.status}
            </span>
            {unread && (
              <span className="bg-destructive px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] text-destructive-foreground">New reply</span>
            )}
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{whenShort(item.created_date)}</span>
            {item.reply_count > 0 && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {item.reply_count} {item.reply_count === 1 ? "reply" : "replies"}
              </span>
            )}
          </span>
          {!open && <span className="mt-2 line-clamp-2 block break-words text-sm [overflow-wrap:anywhere]">{item.message}</span>}
        </span>
        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3 pt-2">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{item.message}</p>
          <ReplyList replies={item.replies} viewer="user" />
          <ReplyBox
            id={`fb-reply-${item.id}`}
            label="Reply"
            buttonLabel="Send reply"
            placeholder="Add a follow-up"
            onSend={(message) => onReply(item.id, message)}
          />
        </div>
      )}
    </li>
  );
}

function MyFeedback() {
  const queryClient = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["my-feedback"],
    initialPageParam: null,
    queryFn: async ({ pageParam }) => (await api.functions.invoke("myFeedback", { limit: 20, cursor: pageParam || undefined })).data,
    getNextPageParam: (last) => last.next_cursor || undefined,
  });
  const items = (q.data?.pages || []).flatMap((p) => p.items);
  const refreshCounts = () => queryClient.invalidateQueries({ queryKey: ["feedback-unread-replies"] });
  const seen = async (id) => {
    try {
      await api.functions.invoke("markFeedbackSeen", { id });
      await queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
      refreshCounts();
    } catch {
      /* the red chip simply stays until the next try */
    }
  };
  const reply = async (id, message) => {
    await api.functions.invoke("replyFeedback", { id, message });
    await queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
  };
  return (
    <section aria-labelledby="my-fb" className="mt-10">
      <h2 id="my-fb" className="font-heading text-xl font-bold">
        Your feedback
      </h2>
      <div className="mt-3 space-y-2">
        {q.isLoading ? (
          <div className="flex justify-center py-6">
            <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
          </div>
        ) : q.isError ? (
          <p role="alert" className="text-sm text-destructive">Could not load your feedback.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => (
              <MyItem key={it.id} item={it} onSeen={seen} onReply={reply} />
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <Button variant="outline" className="h-11 w-full rounded-sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            Load more
          </Button>
        )}
      </div>
    </section>
  );
}

export function Feedback() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const from = useMemo(() => safePath(params.get("from")) || referrerPath(), [params]);
  const [kind, setKind] = useState("bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const left = MAX_FEEDBACK - message.length;
  const empty = !message.trim();

  const submit = async (e) => {
    e.preventDefault();
    if (busy || empty || left < 0) return;
    setBusy(true);
    setError("");
    try {
      await api.functions.invoke("submitFeedback", {
        kind,
        message,
        page: from || null,
        contact: isAuthenticated ? undefined : contact,
        website,
      });
      setDone(true);
      queryClient.invalidateQueries({ queryKey: ["my-feedback"] });
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Could not send that. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  const again = () => {
    setMessage("");
    setContact("");
    setError("");
    setDone(false);
  };

  return (
    <>
      <BackButton fallback="/" />
      <PageHeader
        eyebrow="Tell us"
        title="Feedback"
        description="Found a bug, want a feature, or think a rule is unfair? Tell us — the admins read every note."
      />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        {done ? (
          <div role="status" className="space-y-4 border-2 border-foreground/80 bg-card p-5">
            <p className="font-heading text-xl font-bold">Thanks — got it.</p>
            <div className="flex flex-wrap gap-2">
              <Link
                to={from || "/"}
                className="inline-flex min-h-11 items-center border border-foreground bg-card px-4 py-2 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary"
              >
                {from ? "Back to where you were" : "Back to the ladder"}
              </Link>
              <button
                type="button"
                onClick={again}
                className="inline-flex min-h-11 items-center px-3 py-2 text-sm font-medium underline underline-offset-4 hover:text-brand"
              >
                Send another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            <fieldset>
              <legend className="mb-2 font-display text-[0.58rem] uppercase tracking-[0.18em] text-muted-foreground">
                What is it?
              </legend>
              <div role="radiogroup" aria-label="Kind of feedback" className="grid grid-cols-3 border-2 border-foreground/80">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    role="radio"
                    aria-checked={kind === k.value}
                    onClick={() => setKind(k.value)}
                    className={`min-h-11 border-r border-foreground/40 px-3 py-2 font-display text-[0.6rem] uppercase tracking-[0.14em] last:border-r-0 ${kind === k.value ? "bg-foreground text-background" : "bg-card hover:bg-secondary"}`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="fb-message">Your message</Label>
                <span
                  className={`font-mono text-[11px] ${left < 0 ? "text-destructive" : left < 200 ? "text-warning" : "text-muted-foreground"}`}
                  aria-live="polite"
                >
                  {message.length} / {MAX_FEEDBACK}
                </span>
              </div>
              <textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                placeholder={
                  kind === "bug"
                    ? "What happened, and what did you expect?"
                    : kind === "idea"
                      ? "What would make the ladder better?"
                      : "Anything on your mind."
                }
                className="block min-h-40 w-full rounded-sm border border-input bg-transparent px-3 py-2 text-base leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {!isAuthenticated && (
              <div className="space-y-2">
                <Label htmlFor="fb-contact">Email (optional)</Label>
                <Input
                  id="fb-contact"
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={200}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="if you want a reply"
                  className="h-11 rounded-sm text-base md:text-base"
                />
              </div>
            )}

            {/* Honeypot: invisible to people and screen readers; bots fill it in. */}
            <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
              <label>
                Website
                <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            {from && (
              <p className="break-all font-mono text-[11px] text-muted-foreground">Sent from {from}</p>
            )}
            {error && (
              <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || empty || left < 0} className="h-12 w-full rounded-sm">
              {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Send feedback
            </Button>
          </form>
        )}
        {isAuthenticated ? (
          <MyFeedback />
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">
            <Link to="/login" className="underline underline-offset-4 hover:text-brand">Sign in</Link> to see replies to your feedback.
          </p>
        )}
      </div>
    </>
  );
}
