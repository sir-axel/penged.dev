import { Link } from "react-router-dom";
import { Avatar } from "@/components/Avatar";
import { playerName, isPlacing } from "@/lib/ladder";
import { TierBadge } from "@/components/TierBadge";
import { GuildTag } from "@/components/GuildBadge";
import { useGuildTags } from "@/hooks/useGuildTags";
import { BountyChip } from "@/components/BountyChip";
import { useBounties } from "@/hooks/useBounties";

export function LadderRow({ rank, player, rating: rating, wins = 0, losses = 0, provisional = false, inactive = false, unrated = false, streak = 0, format = "singles" }) {
  const guild = useGuildTags()[player.id];
  const bountyOf = useBounties(format);
  const placing = !unrated && isPlacing(player, format); // rating hidden until placement is done
  return (
    <li className="border-b border-border last:border-0">
      <Link
        to={`/players/${player.username}`}
        className="flex min-h-[52px] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/60"
      >
        <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {inactive || unrated ? "—" : String(rank).padStart(2, "0")}
        </span>
        <Avatar name={playerName(player)} src={player.avatar_url} size={30} player={player} format={format} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="line-clamp-2 min-w-0 break-words font-heading text-sm font-semibold">
              {playerName(player)}
            </span>
            {!unrated && <TierBadge rating={rating} played={wins + losses} />}
            {player.under_review && (
              <span className="shrink-0 rounded-sm border border-destructive/40 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-destructive">
                review
              </span>
            )}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {!unrated && !inactive && format !== "overall" && <BountyChip bounty={bountyOf(player)} className="mb-1 mr-1.5 align-middle" />}
            {guild && <GuildTag tag={guild.tag} color={guild.color} title={guild.name} className="mr-1.5 align-middle" />}
            {"lvl "}
            {player.level || 1}
            {" · "}
            {wins}W–{losses}L
            {streak >= 2 && (
              <span className="ml-1.5 text-brand">{` · ${streak}W STREAK`}</span>
            )}
          </span>
        </span>
        <span
          className={`w-12 shrink-0 text-right font-mono text-sm tabular-nums${unrated || placing ? " text-muted-foreground" : ""}`}
          title={placing ? "Rating hidden until placement is done" : undefined}
        >
          {unrated ? "nil" : placing ? "—" : rating}
        </span>
      </Link>
    </li>
  );
}
