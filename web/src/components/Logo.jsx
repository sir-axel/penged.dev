export function Logo({ className = "", showWordmark = true }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="shrink-0"
        shapeRendering="crispEdges"
      >
        <rect x="1" y="1" width="5" height="6" fill="currentColor" />
        <rect x="2" y="7" width="3" height="6" fill="currentColor" />
        <rect x="10" y="2" width="4" height="4" fill="hsl(var(--brand))" />
        <rect x="9" y="3" width="1" height="2" fill="hsl(var(--brand))" opacity="0.45" />
        <rect x="14" y="3" width="1" height="2" fill="hsl(var(--brand))" opacity="0.45" />
      </svg>
      {showWordmark && (
        <span className="font-display text-[0.72rem] leading-none tracking-tight">
          PENGED<span className="text-brand">.DEV</span>
        </span>
      )}
    </span>
  );
}
