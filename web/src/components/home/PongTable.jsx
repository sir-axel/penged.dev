export function PongTable({ className = "", withBall = true }) {
  return (
    <svg
      viewBox="0 0 200 120"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="200" height="120" fill="hsl(var(--secondary))" />
      <rect
        x="6"
        y="6"
        width="188"
        height="108"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="14" y="14" width="172" height="92" fill="hsl(var(--card))" opacity="0.55" />
      {[10, 22, 34, 46, 58, 70, 82, 94, 106].map((e) => (
        <rect x="98" y={e} width="4" height="8" fill="currentColor" opacity="0.7" key={e} />
      ))}
      <rect x="18" y="42" width="5" height="34" fill="currentColor" />
      <rect x="177" y="50" width="5" height="34" fill="currentColor" />
      {withBall && (
        <rect className="pong-ball" x="34" y="54" width="6" height="6" fill="hsl(var(--brand))" />
      )}
    </svg>
  );
}
