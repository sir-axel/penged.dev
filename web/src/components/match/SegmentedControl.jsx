export function SegmentedControl({
  options: options,
  value: value,
  onChange: onChange,
  label: label,
}) {
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {options.map((e) => (
        <button
          type="button"
          aria-pressed={value === e.value}
          onClick={() => onChange(e.value)}
          className={`min-h-[42px] flex-1 rounded-sm border font-heading text-sm font-medium transition-colors ${value === e.value ? "border-foreground bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
          key={e.value}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}
