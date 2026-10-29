export function ResultRow({ players, games: games, won: won, pov = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className={`min-w-0 truncate font-heading text-sm ${won ? "font-semibold text-foreground" : "text-muted-foreground"} ${pov ? "underline decoration-2 underline-offset-4" : ""}`}
      >
        {players.map((e) => e.display_name || e.username).join(" / ")}
        {won && <span className="ml-1.5 font-mono text-[10px] uppercase text-success">win</span>}
      </span>
      <span className="shrink-0 font-mono text-sm tabular-nums">{games}</span>
    </div>
  );
}
