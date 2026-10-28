export function Avatar({ name, src, size = 36, className = "" }) {
  let initials =
    (name || "?")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-secondary ${className}`}
      style={{
        width: size,
        height: size,
      }}
    >
      {src ? (
        <img
          loading="lazy"
          src={src}
          alt={name ? `${name}'s profile picture` : "Player"}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-display text-[0.55rem] text-muted-foreground">{initials}</span>
      )}
    </span>
  );
}
