export const PADDLE_GLYPH = (
  <>
    <rect x="3" y="1" width="7" height="9" fill="currentColor" />
    <rect x="5" y="10" width="3" height="6" fill="currentColor" />
  </>
);
export function HeroDecor({ className = "" }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        className="absolute -left-3 top-10 h-20 w-20 -rotate-[16deg] text-foreground/[0.07]"
      >
        {PADDLE_GLYPH}
      </svg>
      <svg
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        className="absolute right-[38%] top-6 h-12 w-12 rotate-[28deg] text-foreground/[0.06]"
      >
        {PADDLE_GLYPH}
      </svg>
      <svg
        viewBox="0 0 4 4"
        shapeRendering="crispEdges"
        className="absolute left-[46%] top-24 h-5 w-5 text-brand/30"
      >
        <rect x="1" y="1" width="2" height="2" fill="currentColor" />
      </svg>
      <svg
        viewBox="0 0 4 4"
        shapeRendering="crispEdges"
        className="absolute bottom-8 left-10 h-4 w-4 text-foreground/15"
      >
        <rect x="1" y="1" width="2" height="2" fill="currentColor" />
      </svg>
      <svg
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        className="absolute -bottom-4 right-6 h-24 w-24 rotate-[12deg] text-foreground/[0.05]"
      >
        {PADDLE_GLYPH}
      </svg>
    </div>
  );
}
