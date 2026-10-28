// Stored values stay "default" / "modded"; people see whether the paddle was paid for.
export const PADDLE_LABELS = { default: "Free", modded: "Paid" };
export const paddleLabel = (v) =>
  `${PADDLE_LABELS[v] || PADDLE_LABELS.default} paddle`;

export function PaddleToggle({
  value = "default",
  onChange: onChange,
  label = "Paddle",
}) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
        Paddle type
      </span>
      <div
        className="flex overflow-hidden rounded-sm border border-border"
        role="group"
        aria-label={label}
      >
        {["default", "modded"].map((n) => {
          let r = (value || "default") === n;
          return (
            <button
              type="button"
              aria-pressed={r}
              onClick={() => onChange(n)}
              className={`min-h-10 px-3 font-mono text-[10px] sm:min-h-[30px] sm:px-2 uppercase tracking-[0.08em] transition-colors ${r ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
              key={n}
            >
              {PADDLE_LABELS[n]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
