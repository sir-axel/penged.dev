export function PaddleToggle({ value = "default", onChange: onChange, label = "Paddle" }) {
  return (
    <div
      className="flex shrink-0 overflow-hidden rounded-sm border border-border"
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
            {n}
          </button>
        );
      })}
    </div>
  );
}
