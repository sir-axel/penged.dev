import { Link } from "react-router-dom";

/** The eight badge colors a guild can pick (CSS variables with a light and a dark set, see index.css). */
export const GUILD_COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"];
export const guildColor = (c) => `var(--guild-${GUILD_COLORS.includes(c) ? c : "blue"})`;

/** The guild's picture when it has one (`src`), otherwise a pixel shield in the guild's color. */
export function GuildBadge({ color, size = 28, className = "", src }) {
  if (src)
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        className={`shrink-0 rounded-sm border-2 object-cover ${className}`}
        style={{ width: size, height: size, borderColor: guildColor(color) }}
      />
    );
  return (
    <svg
      width={size}
      height={Math.round((size * 15) / 14)}
      viewBox="0 0 14 15"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className={`shrink-0 ${className}`}
    >
      <g fill="hsl(var(--foreground))" opacity="0.85">
        <rect x="0" y="0" width="14" height="9" />
        <rect x="1" y="9" width="12" height="2" />
        <rect x="2" y="11" width="10" height="1" />
        <rect x="3" y="12" width="8" height="1" />
        <rect x="5" y="13" width="4" height="1" />
        <rect x="6" y="14" width="2" height="1" />
      </g>
      <g fill={guildColor(color)}>
        <rect x="1" y="1" width="12" height="8" />
        <rect x="2" y="9" width="10" height="2" />
        <rect x="3" y="11" width="8" height="1" />
        <rect x="5" y="12" width="4" height="1" />
      </g>
      <rect x="3" y="3" width="3" height="3" fill="#fff" opacity="0.4" />
      <rect x="6" y="2" width="2" height="1" fill="#fff" opacity="0.25" />
    </svg>
  );
}

/** Small mono [TAG] chip. With `to` it links to the guild (never put a linked one inside another link). */
export function GuildTag({ tag, color, to, title, className = "" }) {
  if (!tag) return null;
  const cls = `inline-flex shrink-0 items-center rounded-sm border px-1 font-mono text-[10px] font-semibold leading-[1.35] tracking-[0.04em] ${className}`;
  const style = { color: guildColor(color), borderColor: guildColor(color) };
  const body = `[${tag}]`;
  return to ? (
    <Link to={to} title={title} className={`${cls} hover:bg-secondary`} style={style} data-testid="guild-tag">
      {body}
    </Link>
  ) : (
    <span title={title} className={cls} style={style} data-testid="guild-tag">
      {body}
    </span>
  );
}
