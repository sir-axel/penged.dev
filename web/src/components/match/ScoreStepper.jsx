export function ScoreStepper({ value, onChange: onChange, label: label }) {
  let current = Number(value) || 0,
    setValue = (e) => onChange(String(Math.max(0, Math.min(40, e))));
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => setValue(current - 1)}
        disabled={current <= 0}
        className="h-10 w-10 rounded-sm border border-border bg-card text-lg leading-none transition-colors hover:border-foreground/40 disabled:opacity-30"
      >
        −
      </button>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        className="h-10 w-12 rounded-sm border border-input bg-card text-center font-mono text-base tabular-nums outline-none focus:border-foreground/40"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => setValue(current + 1)}
        className="h-10 w-10 rounded-sm border border-border bg-card text-lg leading-none transition-colors hover:border-foreground/40"
      >
        +
      </button>
    </div>
  );
}
