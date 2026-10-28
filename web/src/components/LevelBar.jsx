import { levelProgress } from "@/lib/ladder";

export function LevelBar({ xp = 0, showNext = true }) {
  let { level, ratio: ratio, toNext: toNext } = levelProgress(xp);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {"Level "}
          {level}
        </span>
        {showNext && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {toNext}
            {" xp to next"}
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-secondary">
        <div
          className="h-full bg-brand transition-all"
          style={{
            width: `${Math.round(ratio * 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
