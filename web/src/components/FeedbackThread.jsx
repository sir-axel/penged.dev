import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const whenShort = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

/** Chronological replies. `viewer` is "user" (the author) or "admin"; decides the labels. */
export function ReplyList({ replies, viewer }) {
  if (!replies?.length) return null;
  return (
    <ul className="mt-3 space-y-2" aria-label="Replies">
      {replies.map((r) => {
        const admin = r.author_role === "admin";
        const label = admin
          ? viewer === "admin"
            ? `Penged admin · ${r.author_name || "admin"}`
            : "Penged admin"
          : viewer === "user"
            ? "You"
            : r.author_name || "User";
        return (
          <li
            key={r.id}
            className={`rounded-sm border px-3 py-2 ${admin ? "border-brand/50 border-l-4 border-l-brand bg-brand/5" : "border-border bg-secondary/40"}`}
          >
            <p className="flex flex-wrap items-baseline gap-x-2 font-display text-[0.5rem] uppercase tracking-[0.14em]">
              <span className={admin ? "text-brand" : "text-muted-foreground"}>{label}</span>
              <span className="font-mono normal-case tracking-normal text-muted-foreground">{whenShort(r.created_date)}</span>
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{r.message}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** Textarea + send. `onSend(message)` must throw on failure (the text is kept so nothing is lost). */
export function ReplyBox({ id, label, buttonLabel = "Send reply", placeholder, onSend }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const empty = !text.trim();
  const submit = async (e) => {
    e.preventDefault();
    if (busy || empty) return;
    setBusy(true);
    setError("");
    try {
      await onSend(text.trim());
      setText("");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Could not send that. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <label htmlFor={id} className="block font-display text-[0.5rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={placeholder}
        className="block w-full rounded-sm border border-input bg-transparent px-3 py-2 text-base leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {error && (
        <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || empty} className="h-11 w-full rounded-sm sm:w-auto">
        {busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {buttonLabel}
      </Button>
    </form>
  );
}
