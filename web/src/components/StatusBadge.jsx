export const STATUS_STYLES = {
  verified: "bg-success/10 text-success border-success/30",
  pending: "bg-warning/10 text-warning border-warning/30",
  open: "bg-brand-soft text-brand border-brand/30",
  accepted: "bg-success/10 text-success border-success/30",
  declined: "bg-destructive/10 text-destructive border-destructive/30",
  disputed: "bg-destructive/10 text-destructive border-destructive/30",
  expired: "bg-secondary text-muted-foreground border-border",
  forfeited: "bg-destructive/10 text-destructive border-destructive/30",
  completed: "bg-success/10 text-success border-success/30",
  cancelled: "bg-secondary text-muted-foreground border-border",
};
export const STATUS_LABELS = {
  verified: "Verified",
  pending: "Awaiting sign-off",
  open: "Open",
  accepted: "Accepted",
  declined: "Declined",
  disputed: "Disputed",
  expired: "Expired",
  forfeited: "Forfeit",
  completed: "Played",
  cancelled: "Cancelled",
};
export function StatusBadge({ status, label: label, className = "" }) {
  let style = STATUS_STYLES[status] || STATUS_STYLES.expired;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${style} ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label || STATUS_LABELS[status] || status}
    </span>
  );
}
