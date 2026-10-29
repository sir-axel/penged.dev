import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { BackButton } from "@/components/BackButton";
import { GuildBadge, GuildTag } from "@/components/GuildBadge";
import { GuildForm } from "@/components/GuildForm";
import { api } from "@/api/client";

const num = (n) => (n || 0).toLocaleString("en-US");

export function useGuildList() {
  return useQuery({
    queryKey: ["guilds"],
    queryFn: async () => (await api.functions.invoke("listGuilds")).data,
  });
}

/** Everything that shows guild data; call after any guild change. */
export function invalidateGuilds(queryClient) {
  for (const k of ["guilds", "guild", "guild-tags"]) queryClient.invalidateQueries({ queryKey: [k] });
}

function GuildRow({ guild: g, mine, max }) {
  return (
    <li className="border-b border-border last:border-0">
      <Link
        to={`/guilds/${g.id}`}
        className={`flex min-h-[56px] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-secondary/60 ${mine ? "bg-brand-soft" : ""}`}
        data-testid="guild-row"
      >
        <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{String(g.rank).padStart(2, "0")}</span>
        <GuildBadge color={g.color} size={26} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <GuildTag tag={g.tag} color={g.color} />
            <span className="line-clamp-2 min-w-0 break-words font-heading text-sm font-semibold">{g.name}</span>
            {mine && (
              <span className="shrink-0 rounded-sm border border-brand/50 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-brand">you</span>
            )}
          </span>
          <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {`${g.member_count}/${max} · ${num(g.total_xp)} all-time`}
            {g.avg_rating != null && ` · avg ${g.avg_rating}`}
            {g.join_mode === "invite" && " · invite"}
          </span>
        </span>
        <span className="w-14 shrink-0 text-right font-mono text-sm tabular-nums">{num(g.week_xp)}</span>
      </Link>
    </li>
  );
}

export function Guilds() {
  const { player: me } = useMyPlayer();
  const { data, isLoading } = useGuildList();
  const guilds = data?.guilds || [];
  const max = data?.max_members || 10;
  const myId = data?.my_guild_id || null;
  const mine = guilds.find((g) => g.id === myId);
  const createBtn = (
    <Link
      to={me ? "/guilds/new" : "/register"}
      className="inline-flex min-h-[40px] items-center gap-1.5 self-start rounded-sm bg-primary px-3 font-heading text-sm font-medium text-primary-foreground sm:self-auto"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Create a guild
    </Link>
  );
  return (
    <>
      <PageHeader
        eyebrow="Ladder"
        title="Guilds"
        description="Team up with up to 10 players. Every verified match your members play earns the guild points."
        action={!myId && createBtn}
      />
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex gap-1" aria-label="Leaderboards">
          <Link to="/leaderboard" className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-sm px-3 font-heading text-sm font-medium text-muted-foreground hover:bg-secondary sm:flex-none">
            Players
          </Link>
          <span aria-current="page" className="inline-flex min-h-[40px] flex-1 items-center justify-center rounded-sm bg-primary px-3 font-heading text-sm font-medium text-primary-foreground sm:flex-none">
            Guilds
          </span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : guilds.length === 0 ? (
          <EmptyState title="No guilds yet" body="Start one, pick a tag and a color, and bring your crew." action={createBtn} />
        ) : (
          <>
            {mine && (
              <section className="mb-4" aria-label="Your guild">
                <h2 className="mb-2 font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">Your guild</h2>
                <ul className="overflow-hidden rounded-sm border border-foreground/60 bg-card">
                  <GuildRow guild={mine} mine max={max} />
                </ul>
              </section>
            )}
            <div className="overflow-hidden rounded-sm border border-border bg-card">
              <div className="flex items-center gap-3 border-b border-border bg-secondary/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <span className="w-7">#</span>
                <span className="w-[26px]" />
                <span className="flex-1">Guild</span>
                <span className="w-14 text-right">Week</span>
              </div>
              <ul>
                {guilds.map((g) => (
                  <GuildRow guild={g} mine={g.id === myId} max={max} key={g.id} />
                ))}
              </ul>
            </div>
          </>
        )}
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          Week points are the XP members earn in verified matches, ranked or unranked, since Monday 12:00am Central. XP only counts from the day
          someone joins. All-time is the same since each member joined. Average rating uses members with 5+ singles matches.
        </p>
      </div>
    </>
  );
}

export function GuildNew() {
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useGuildList();
  const myId = data?.my_guild_id;
  return (
    <>
      <BackButton fallback="/guilds" />
      <PageHeader eyebrow="Guilds" title="Create a guild" description="You will be the leader. One guild per player, up to 10 members." />
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6">
        {myId ? (
          <EmptyState
            title="You are already in a guild"
            body="Leave it first if you want to start a new one."
            action={
              <Link to={`/guilds/${myId}`} className="rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                Go to my guild
              </Link>
            }
          />
        ) : (
          <GuildForm
            submitLabel="Create guild"
            onSubmit={async (v) => {
              const { data: res } = await api.functions.invoke("createGuild", v);
              invalidateGuilds(queryClient);
              nav(`/guilds/${res.guild.id}`, { replace: true });
            }}
          />
        )}
      </div>
    </>
  );
}
