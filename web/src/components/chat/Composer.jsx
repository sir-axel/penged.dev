import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LoaderCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/Avatar";
import { api } from "@/api/client";
import { MAX_BODY, nameOf, toWire } from "@/lib/chatText";
import { errMsg } from "@/hooks/useChat";

const QUERY_RE = /(^|\s)@([^\s@]{0,30})$/;

function useDebounced(v, ms) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/**
 * Textarea with @-autocomplete. The text the person edits is plain ("@Alice"); on send every mention they picked
 * is turned into a `@[Name](player:id)` token. `candidates` limits suggestions to a fixed list (DMs); otherwise
 * playerSearch is queried. `onSend(wireBody)` must throw on failure (the text is kept).
 */
export function Composer({
  id, label, placeholder, buttonLabel = "Send", candidates, initialText = "", initialMentions = [], onSend, onCancel,
  sticky = false, autoFocus = false, rows = 3, enterToSend = false,
}) {
  const [text, setText] = useState(initialText);
  const [mentions, setMentions] = useState(initialMentions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [caret, setCaret] = useState(initialText.length);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(null);
  const ta = useRef(null);
  const pendingSel = useRef(null);
  // Place the caret right after a picked mention, synchronously after the DOM updates (before the next keystroke).
  useLayoutEffect(() => {
    if (pendingSel.current != null && ta.current) {
      ta.current.focus();
      ta.current.setSelectionRange(pendingSel.current, pendingSel.current);
      pendingSel.current = null;
    }
  });

  const m = QUERY_RE.exec(text.slice(0, caret));
  const q = m ? m[2] : null;
  const showKey = q === null ? null : caret;
  const open = q !== null && dismissed !== showKey;
  const dq = useDebounced(q ?? "", candidates ? 0 : 150);
  const remote = useQuery({
    queryKey: ["player-search", dq],
    enabled: open && !candidates,
    staleTime: 60000,
    placeholderData: keepPreviousData,
    queryFn: async () => (await api.functions.invoke("playerSearch", { q: dq })).data.items,
  });
  const options = useMemo(() => {
    if (!open) return [];
    // Always filter by what is typed now, so results that arrive late (or stale ones while the next search is in flight) never mislead.
    const needle = (q || "").toLowerCase();
    const src = candidates || remote.data || [];
    return src.filter((p) => !needle || p.username.toLowerCase().includes(needle) || nameOf(p).toLowerCase().includes(needle)).slice(0, 8);
  }, [open, candidates, q, remote.data]);
  useEffect(() => setActive(0), [q]);
  const list = open && options.length > 0;

  const wire = toWire(text, mentions);
  const left = MAX_BODY - wire.length;
  const empty = !text.trim();

  const pick = (p) => {
    const start = caret - (q?.length || 0) - 1;
    const name = nameOf(p);
    const next = `${text.slice(0, start)}@${name} ${text.slice(caret)}`;
    const pos = start + name.length + 2;
    setText(next);
    setMentions((cur) => (cur.some((x) => x.id === p.id) ? cur : [...cur, { id: p.id, name }]));
    setCaret(pos);
    pendingSel.current = pos;
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (busy || empty || left < 0) return;
    setBusy(true);
    setError("");
    try {
      await onSend(wire.trim());
      setText("");
      setMentions([]);
      setCaret(0);
    } catch (err) {
      setError(errMsg(err, "Could not send that. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") return submit(e);
    if (list) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(options[active]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(showKey);
      }
      return;
    }
    if (enterToSend && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
  };
  const sync = (e) => setCaret(e.target.selectionStart ?? e.target.value.length);

  return (
    <form
      onSubmit={submit}
      className={sticky ? "chat-composer sticky bottom-[calc(58px+env(safe-area-inset-bottom))] z-20 border-t-2 border-foreground/80 bg-background/95 px-4 pb-3 pt-3 backdrop-blur md:bottom-0 md:px-0" : "space-y-2"}
    >
      <div className={sticky ? "mx-auto max-w-2xl space-y-2" : "space-y-2"}>
        {label && (
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={id} className="font-display text-[0.5rem] uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </label>
            <span className={`font-mono text-[11px] ${left < 0 ? "text-destructive" : left < 300 ? "text-warning" : "text-muted-foreground"}`} aria-live="polite">
              {wire.length} / {MAX_BODY}
            </span>
          </div>
        )}
        <div className="relative">
          {list && (
            <ul
              role="listbox"
              id={`${id}-mentions`}
              aria-label="Mention suggestions"
              className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-64 overflow-y-auto rounded-sm border-2 border-foreground/80 bg-card shadow-lg"
            >
              {options.map((p, i) => (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 py-1.5 ${i === active ? "bg-secondary" : ""}`}
                >
                  <Avatar name={nameOf(p)} src={p.avatar_url} size={28} />
                  <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">{nameOf(p)}</span>
                  <span className="truncate font-mono text-[11px] text-muted-foreground">@{p.username}</span>
                </li>
              ))}
            </ul>
          )}
          <textarea
            ref={ta}
            id={id}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              sync(e);
              setDismissed(null);
            }}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && sync(e)}
            onClick={sync}
            onSelect={sync}
            rows={rows}
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-label={label ? undefined : placeholder || "Message"}
            role="combobox"
            aria-expanded={list}
            aria-controls={list ? `${id}-mentions` : undefined}
            aria-autocomplete="list"
            className="block max-h-48 min-h-11 w-full resize-y rounded-sm border border-input bg-card px-3 py-2 text-base leading-relaxed shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={busy || empty || left < 0} className="h-11 flex-1 rounded-sm sm:flex-none">
            {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-2 h-4 w-4" aria-hidden="true" />}
            {buttonLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="h-11 rounded-sm">
              Cancel
            </Button>
          )}
          {!label && (
            <span className={`ml-auto font-mono text-[11px] ${left < 0 ? "text-destructive" : left < 300 ? "text-warning" : "text-muted-foreground"}`} aria-live="polite">
              {wire.length} / {MAX_BODY}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
