import { TierEmblem } from "@/components/TierEmblem";
import { tierFor, PROVISIONAL } from "@/lib/tiers";
import { matchesPlayed, overallRating, ratingFor } from "@/lib/ladder";

/** Tier key for a player row in a format ("overall" uses the display blend), "unranked" while placing; null without rating data. */
export function tierKeyOf(player, format = "singles") {
  if (!player || player.singles_rating === undefined) return null;
  const played =
    format === "overall" ? matchesPlayed(player, "singles") + matchesPlayed(player, "doubles") : matchesPlayed(player, format);
  if (played < PROVISIONAL) return "unranked";
  return tierFor(format === "overall" ? overallRating(player) : ratingFor(player, format)).key;
}

/**
 * Profile picture. Pass `player` (a row with ratings) to pin that player's tier emblem to the corner
 * (singles by default, or `format`); `tier` overrides the key; `tier={false}` hides it.
 */
export function Avatar({ name, src, size = 36, className = "", player, format = "singles", tier }) {
  let initials =
    (name || "?")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?";
  const key = tier === false ? null : tier || tierKeyOf(player, format);
  const em = Math.max(12, Math.round(size * 0.42));
  const pic = (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-secondary ${key ? "" : className}`}
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
  if (!key) return pic;
  const unranked = key === "unranked";
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} data-testid="avatar-tier" data-tier={key}>
      {pic}
      <span
        className={`absolute -bottom-1 -right-1 flex items-center justify-center rounded-sm border shadow-sm ${unranked ? "border-dashed border-muted-foreground/60 bg-secondary" : ""}`}
        style={unranked ? { width: em + 2, height: em + 2 } : { width: em + 2, height: em + 2, backgroundColor: `var(--tier-${key}-bg)`, borderColor: `var(--tier-${key}-bd)` }}
        title={unranked ? "Unranked" : key[0].toUpperCase() + key.slice(1)}
      >
        <TierEmblem tierKey={key} size={em - 2} />
      </span>
    </span>
  );
}
