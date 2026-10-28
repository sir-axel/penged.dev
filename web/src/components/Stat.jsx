export function Stat({ label, value: value }) {
  return (
    <div className="rounded-sm border border-border bg-card px-3 py-2.5">
      <p className="font-mono text-lg leading-none tabular-nums">{value}</p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
