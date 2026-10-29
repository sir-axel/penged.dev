import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Pencil } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BackButton } from "@/components/BackButton";
import { EmptyState } from "@/components/EmptyState";
import { Avatar } from "@/components/Avatar";
import { GuildBadge, GuildTag } from "@/components/GuildBadge";
import { GuildForm } from "@/components/GuildForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { playerName, formatShortDate } from "@/lib/ladder";
import { invalidateGuilds } from "@/pages/Guilds";
import { api } from "@/api/client";

const num = (n) => (n || 0).toLocaleString("en-US");
const BTN = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm px-4 text-sm font-medium disabled:opacity-50";
const PRIMARY = `${BTN} bg-primary text-primary-foreground`;
const SECONDARY = `${BTN} border border-border bg-secondary hover:bg-accent`;
const SMALL = "inline-flex min-h-10 items-center rounded-sm border border-border bg-secondary px-3 text-xs font-medium hover:bg-accent disabled:opacity-50";

function Confirm({ trigger, title, body, confirm, onConfirm }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-10 rounded-sm">Never mind</AlertDialogCancel>
          <AlertDialogAction className="min-h-10 rounded-sm" onClick={onConfirm}>
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border border-border bg-card px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-heading text-lg font-bold leading-tight tabular-nums">{value}</p>
    </div>
  );
}

export function GuildPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["guild", id],
    queryFn: async () => (await api.functions.invoke("getGuild", { guild_id: id })).data,
    retry: false,
  });

  const act = async (key, name, payload, after) => {
    setBusy(key);
    setError("");
    try {
      await api.functions.invoke(name, payload);
      invalidateGuilds(queryClient);
      after?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Something went wrong.");
      invalidateGuilds(queryClient);
    } finally {
      setBusy("");
    }
  };

  if (isLoading)
    return (
      <div className="flex justify-center py-24">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
      </div>
    );
  if (isError || !data?.guild)
    return (
      <>
        <BackButton fallback="/guilds" />
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <EmptyState
            title="That guild is gone"
            body="It may have been disbanded. Find another one on the guild board."
            action={
              <Link to="/guilds" className="rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                All guilds
              </Link>
            }
          />
        </div>
      </>
    );

  const { guild: g, members, requests, me, max_members: max } = data;
  const leader = me.member && me.role === "leader";
  const full = g.member_count >= max;
  const gid = g.id;
  const nextLeader = members.find((m) => m.role !== "leader");

  let joinArea = null;
  if (!isAuthenticated) {
    joinArea = (
      <Link to={`/login?returnTo=${encodeURIComponent(`/guilds/${gid}`)}`} className={PRIMARY}>
        Sign in to join
      </Link>
    );
  } else if (!me.player_id) {
    joinArea = (
      <Link to="/welcome" className={PRIMARY}>
        Create your profile to join
      </Link>
    );
  } else if (me.member) {
    joinArea = (
      <Confirm
        trigger={
          <button type="button" className={SECONDARY} disabled={!!busy}>
            Leave guild
          </button>
        }
        title={`Leave ${g.name}?`}
        body={
          g.member_count <= 1
            ? "You are the last member, so the guild will be deleted."
            : leader && nextLeader
              ? `${playerName(nextLeader.player)} has been here longest and becomes leader.`
              : "Your XP stops counting for the guild. You can join again later if there is room."
        }
        confirm="Leave"
        onConfirm={() => act("leave", "leaveGuild", {}, () => (g.member_count <= 1 ? nav("/guilds", { replace: true }) : null))}
      />
    );
  } else if (me.guild_id) {
    joinArea = (
      <p className="text-sm text-muted-foreground">
        {"You are in another guild. "}
        <Link to={`/guilds/${me.guild_id}`} className="text-brand underline underline-offset-2">
          Go to yours
        </Link>
      </p>
    );
  } else if (full) {
    joinArea = <p className="text-sm text-muted-foreground">{`This guild is full (${max} members).`}</p>;
  } else if (me.requested) {
    joinArea = (
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-11 items-center rounded-sm border border-dashed border-border px-4 text-sm text-muted-foreground">Request sent</span>
        <button type="button" className={SECONDARY} disabled={!!busy} onClick={() => act("cancel", "cancelJoinRequest", { guild_id: gid })}>
          Cancel request
        </button>
      </div>
    );
  } else {
    joinArea = (
      <button type="button" className={PRIMARY} disabled={!!busy} onClick={() => act("request", "requestJoinGuild", { guild_id: gid })}>
        {busy === "request" ? "Sending…" : "Ask to join"}
      </button>
    );
  }

  return (
    <>
      <BackButton fallback="/guilds" />
      <div className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex items-start gap-4">
            <GuildBadge color={g.color} size={56} />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-brand">
                {`Guild · #${g.rank} this week`}
              </p>
              <h1 className="mt-1.5 flex flex-wrap items-center gap-2 font-heading text-2xl font-bold tracking-tight sm:text-3xl">
                <GuildTag tag={g.tag} color={g.color} className="text-xs" />
                <span className="min-w-0 break-words">{g.name}</span>
              </h1>
              {g.description && <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{g.description}</p>}
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {`Ask to join · the leader approves · up to ${max} members`}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {joinArea}
            {leader && !editing && (
              <button type="button" className={SECONDARY} onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit guild
              </button>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {editing && (
          <section className="mb-6 border border-border bg-card p-4" aria-label="Edit guild">
            <h2 className="mb-4 font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">Edit guild</h2>
            <GuildForm
              initial={g}
              submitLabel="Save"
              onCancel={() => setEditing(false)}
              onSubmit={async (v) => {
                await api.functions.invoke("updateGuild", { guild_id: gid, ...v });
                invalidateGuilds(queryClient);
                setEditing(false);
              }}
            />
          </section>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="This week" value={num(g.week_xp)} />
          <Stat label="All-time" value={num(g.total_xp)} />
          <Stat label="Members" value={`${g.member_count}/${max}`} />
          <Stat label="Avg rating" value={g.avg_rating ?? "—"} />
        </div>

        {leader && requests.length > 0 && (
          <section className="mt-6" aria-label="Join requests">
            <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-brand">{`Requests · ${requests.length}`}</h2>
            <ul className="mt-2 overflow-hidden rounded-sm border border-border bg-card">
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
                  <Link to={`/players/${r.player.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar name={playerName(r.player)} src={r.player.avatar_url} size={30} player={r.player} />
                    <span className="min-w-0">
                      <span className="block truncate font-heading text-sm font-semibold">{playerName(r.player)}</span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        {`lvl ${r.player.level || 1} · asked ${formatShortDate(r.created_date)}`}
                      </span>
                    </span>
                  </Link>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center rounded-sm bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      disabled={!!busy || full}
                      onClick={() => act(`a${r.id}`, "respondJoinRequest", { request_id: r.id, decision: "approve" })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className={SMALL}
                      disabled={!!busy}
                      onClick={() => act(`d${r.id}`, "respondJoinRequest", { request_id: r.id, decision: "decline" })}
                    >
                      Decline
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            {full && <p className="mt-1 text-xs text-muted-foreground">Your guild is full. Make room before approving anyone.</p>}
          </section>
        )}

        <section className="mt-6" aria-label="Members">
          <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">Members</h2>
          <ul className="mt-2 overflow-hidden rounded-sm border border-border bg-card">
            <li className="flex items-center gap-3 border-b border-border bg-secondary/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground" aria-hidden="true">
              <span className="w-[30px]" />
              <span className="flex-1">Player</span>
              <span className="w-14 text-right">Week</span>
            </li>
            {members.map((m) => {
              const isMe = m.player.id === me.player_id;
              return (
                <li key={m.player.id} className={`border-b border-border last:border-0 ${isMe ? "bg-brand-soft" : ""}`}>
                  <Link to={`/players/${m.player.username}`} className="flex min-h-[52px] items-center gap-3 px-3 py-2.5 hover:bg-secondary/60">
                    <Avatar name={playerName(m.player)} src={m.player.avatar_url} size={30} player={m.player} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="line-clamp-2 min-w-0 break-words font-heading text-sm font-semibold">{playerName(m.player)}</span>
                        {m.role === "leader" && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-brand/50 px-1 font-mono text-[9px] uppercase tracking-[0.08em] text-brand">
                            <Crown className="h-3 w-3" aria-hidden="true" />
                            leader
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        {`lvl ${m.player.level || 1} · joined ${formatShortDate(m.joined_at)} · ${num(m.total_xp)} all-time`}
                      </span>
                    </span>
                    <span className="w-14 shrink-0 text-right font-mono text-sm tabular-nums">{num(m.week_xp)}</span>
                  </Link>
                  {leader && !isMe && (
                    <div className="flex flex-wrap justify-end gap-2 px-3 pb-2.5">
                      <Confirm
                        trigger={
                          <button type="button" className={SMALL} disabled={!!busy}>
                            Make leader
                          </button>
                        }
                        title={`Make ${playerName(m.player)} the leader?`}
                        body="They get the leader controls and you become a regular member."
                        confirm="Make leader"
                        onConfirm={() => act(`t${m.player.id}`, "transferLeadership", { guild_id: gid, player_id: m.player.id })}
                      />
                      <Confirm
                        trigger={
                          <button type="button" className={`${SMALL} text-destructive`} disabled={!!busy}>
                            Kick
                          </button>
                        }
                        title={`Kick ${playerName(m.player)}?`}
                        body="They leave the guild right away. Their XP stops counting here."
                        confirm="Kick"
                        onConfirm={() => act(`k${m.player.id}`, "kickMember", { guild_id: gid, player_id: m.player.id })}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Week is XP from verified matches since Monday 12:00am Central. Only XP earned after joining counts.
          </p>
        </section>
      </div>
    </>
  );
}
