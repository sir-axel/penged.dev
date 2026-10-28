export function BallStrip({ className = "" }) {
  return (
    <div
      className={`relative h-11 overflow-hidden border-y border-border bg-card ${className}`}
      aria-hidden="true"
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <div className="absolute left-1/2 top-2 bottom-2 w-px bg-border/80" />
      <div className="ball-track absolute top-1.5 h-2.5 w-2.5 bg-brand">
        <div className="ball-bounce h-full w-full bg-brand" />
      </div>
      <svg
        className="paddle-swing absolute right-5 bottom-1 h-8 w-8 text-foreground/25"
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
      >
        <rect x="2" y="1" width="6" height="8" fill="currentColor" />
        <rect x="4" y="9" width="2" height="6" fill="currentColor" />
      </svg>
    </div>
  );
}
