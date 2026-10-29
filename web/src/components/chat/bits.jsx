import { useState } from "react";
import { Link } from "react-router-dom";
import { Flag, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";
import { nameOf } from "@/lib/chatText";
import { errMsg } from "@/hooks/useChat";

export const CATEGORY_LABEL = { general: "General", disputes: "Disputes", lfg: "Looking for a game" };
export const CATEGORY_STYLE = {
  general: "bg-foreground text-background",
  disputes: "bg-destructive text-destructive-foreground",
  lfg: "bg-brand text-brand-foreground",
};

export function CategoryChip({ category }) {
  return (
    <span className={`px-1.5 py-0.5 font-display text-[0.5rem] uppercase tracking-[0.14em] ${CATEGORY_STYLE[category] || "bg-secondary"}`}>
      {CATEGORY_LABEL[category] || category}
    </span>
  );
}

/** Display name linking to the profile; "Former player" when the account is gone. */
export function PersonLink({ person, className = "" }) {
  if (!person) return <span className={`text-muted-foreground ${className}`}>Former player</span>;
  return (
    <Link to={`/players/${encodeURIComponent(person.username)}`} className={`-my-1.5 inline-block py-1.5 font-heading font-semibold hover:text-brand hover:underline ${className}`}>
      {nameOf(person)}
    </Link>
  );
}

export const iconBtn =
  "inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2.5 font-display text-[0.5rem] uppercase tracking-[0.14em] text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50";

export function ReportDialog({ kind, targetId, open, onOpenChange }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const close = (v) => {
    onOpenChange(v);
    if (!v) {
      setReason("");
      setError("");
      setDone(false);
    }
  };
  const send = async (e) => {
    e.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.functions.invoke("report", { kind, target_id: targetId, reason: reason.trim() });
      setDone(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md rounded-none border-2 border-foreground/80">
        <DialogHeader>
          <DialogTitle className="font-heading">Report this {kind === "dm" ? "message" : kind}</DialogTitle>
          <DialogDescription>An admin will take a look. Tell us what is wrong.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-3" role="status">
            <p className="text-sm">Thanks, we got your report.</p>
            <Button className="h-11 w-full rounded-sm" onClick={() => close(false)}>Close</Button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-3">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={4}
              aria-label="Reason"
              placeholder="Spam, harassment, wrong info..."
              className="block w-full rounded-sm border border-input bg-card px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !reason.trim()} className="h-11 flex-1 rounded-sm">
                {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Flag className="mr-2 h-4 w-4" aria-hidden="true" />}
                Send report
              </Button>
              <Button type="button" variant="outline" className="h-11 rounded-sm" onClick={() => close(false)}>Cancel</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <LoaderCircle className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}
