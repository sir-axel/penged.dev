import { Link } from "react-router-dom";
import { Avatar } from "@/components/Avatar";

export function SideCard({ side, gamesWon: gamesWon, winner: winner, label: label }) {
  return (
    <div
      className={`rounded-sm border p-3 ${winner ? "border-success/40 bg-success/5" : "border-border bg-card"}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p
          className={`font-mono text-2xl leading-none tabular-nums ${winner ? "text-success" : ""}`}
        >
          {gamesWon || 0}
        </p>
      </div>
      <ul className="mt-2.5 space-y-2">
        {(side || []).map((e) => (
          <li className="flex items-center gap-2" key={e.player_id}>
            <Avatar name={e.display_name || e.username} src={e.avatar_url} size={26} />
            <Link
              to={`/players/${e.username}`}
              className="min-w-0 flex-1 truncate font-heading text-sm font-medium hover:underline"
            >
              {e.display_name || e.username}
            </Link>
            <span className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
              {e.paddle || "default"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
