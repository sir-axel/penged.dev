import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui/button";
import { challengeClock, playerName } from "@/lib/ladder";
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
import { api } from "@/api/client";

const minus = (n) => `−${Math.abs(n || 0)}`;
/** "Sun 11:59pm" in the viewer's zone: the last minute before the week ends (Monday 00:00 Chicago). */
export const weekDeadline = (iso) =>
  new Date(Date.parse(iso) - 60000)
    .toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
    .replace(" AM", "am")
    .replace(" PM", "pm");

/** This week's matchmaking for the signed-in player (myMatchup), shared by every page that shows the card. */
export function useMatchup() {
  const { player } = useMyPlayer();
  return useQuery({
    queryKey: ["matchup", player?.id],
    enabled: !!player?.id,
    staleTime: 30_000,
    queryFn: async () => (await api.functions.invoke("myMatchup", {})).data,
  });
}

/** "Matched" chip for a challenge sent from this week's matchmaking. */
export function MatchedChip({ challenge }) {
  if (!challenge?.matchup_id) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-sm border border-brand/40 bg-brand-soft px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-brand"
      title="Sent from this week's matchmaking"
      data-testid="matched-chip"
    >
      Matched
    </span>
  );
}

const STATE = {
  open: { label: "Your call", tone: "text-brand" },
  waiting: { label: "Sent", tone: "text-warning" },
  accepted: { label: "On", tone: "text-success" },
  unplayed: { label: "Play it", tone: "text-warning" },
  cleared: { label: "Cleared", tone: "text-success" },
  played: { label: "Played", tone: "text-success" },
  backed_out: { label: "Backed out", tone: "text-destructive" },
  missed: { label: "Missed", tone: "text-destructive" },
};
const incomingText = {
  open: "hasn't said yes yet",
  waiting: "challenged you",
  accepted: "on — play it",
  unplayed: "accepted, not played yet",
  cleared: "off the hook",
  played: "played",
  backed_out: "backed out",
  missed: "missed it",
};

const Eyebrow = ({ children }) => (
  <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">{children}</p>
);

function Stake({ label, value, tone, testId }) {
  return (
    <div className="rounded-sm border border-border bg-secondary/50 px-3 py-2" data-testid={testId}>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`font-heading text-3xl font-bold leading-none tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function Confirm({ trigger, title, body, action, onConfirm }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-10 rounded-sm">Not yet</AlertDialogCancel>
          <AlertDialogAction className="min-h-10 rounded-sm" onClick={onConfirm}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * "This week's match": your assigned opponent, why them, max win / max loss, the deadline and I'm in / Back out,
 * plus who was matched with you. `onRecord(opponentId)`: on Record a match, pre-fill in place instead of linking.
 */
export function MatchupCard({ onRecord, className = "" }) {
  const { player } = useMyPlayer();
  const { data, isLoading } = useMatchup();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (!player || isLoading || !data) return null;
  const act = async (name) => {
    setBusy(name);
    setError("");
    try {
      const r = await api.functions.invoke(name, {});
      queryClient.setQueryData(["matchup", player.id], r.data);
      for (const k of ["matchup", "challenges", "players", "my-player", "queue", "stakes"]) queryClient.invalidateQueries({ queryKey: [k] });
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Something went wrong.");
    } finally {
      setBusy("");
    }
  };
  const m = data.matchup;
  const incoming = data.incoming || [];
  const shell = (children) => (
    <section className={`rounded-sm border border-border bg-card p-3 sm:p-4 ${className}`} data-testid="matchup-card">
      {children}
    </section>
  );
  const incomingList = incoming.length > 0 && (
    <div className="mt-3 border-t border-border pt-3" data-testid="matchup-incoming">
      <Eyebrow>
        {incoming.length === 1 ? "Matched with you this week" : `Matched with you this week · ${incoming.length} players`}
      </Eyebrow>
      <ul className="mt-2 space-y-1.5">
        {incoming.map((x) => (
          <li key={x.id} className="flex min-w-0 items-center gap-2">
            <Avatar name={playerName(x.player)} src={x.player?.avatar_url} size={24} player={x.player} />
            <span className="min-w-0 flex-1 truncate font-heading text-sm font-semibold">{playerName(x.player)}</span>
            <span
              className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] ${x.status === "waiting" ? "text-warning" : "text-muted-foreground"}`}
            >
              {incomingText[x.status] || x.status}
            </span>
          </li>
        ))}
      </ul>
      {incoming.some((x) => x.status === "waiting") && (
        <p className="mt-2 text-xs text-muted-foreground">
          Their challenges are regular ones for you: answer them under Waiting on you.
        </p>
      )}
    </div>
  );

  if (!m) {
    const why = {
      unranked: "You join matchmaking after your first ranked singles match. Play one and you get a matched opponent every Monday.",
      late: "Matches for this week were made before you were on the ladder. You get yours on Monday.",
      alone: "Nobody else is on the singles ladder to match you with this week.",
      pending: "This week's matches are being made.",
    }[data.reason] || "No match for you this week.";
    return shell(
      <>
        <Eyebrow>This week's match</Eyebrow>
        <p className="mt-2 text-sm text-muted-foreground">{why}</p>
        {incomingList}
      </>,
    );
  }

  const opp = m.opponent;
  const name = playerName(opp);
  const st = STATE[m.status] || STATE.open;
  const ch = m.challenge;
  const deadline = weekDeadline(data.deadline);
  const settled = ["played", "backed_out", "missed"].includes(m.status);
  const canBackOut = m.status === "waiting" || m.status === "accepted";
  const theyAsked = m.status === "open" && incoming.some((x) => x.player?.id === opp?.id && x.status === "waiting");
  const record = (m.status === "accepted" || m.status === "unplayed") && (
    onRecord ? (
      <Button onClick={() => onRecord(opp.id)} className="h-11 w-full rounded-sm">
        Record result
      </Button>
    ) : (
      <Link
        to={`/matches/new?format=singles&opp=${opp.id}`}
        className="inline-flex h-11 w-full items-center justify-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Record result
      </Link>
    )
  );
  const statusLine = {
    open: theyAsked
      ? `${name} already said yes. Say I'm in to accept their challenge.`
      : `Say I'm in and the challenge goes to ${name}.`,
    waiting: `Waiting for ${name} to answer${ch?.expires_at ? ` · ${challengeClock(ch.expires_at)}` : ""}.`,
    accepted: `${name} is in. Play it by ${deadline} and record the result.`,
    unplayed: `The challenge window closed, but the week hasn't: play ${name} by ${deadline} or lose ${m.max_loss}.`,
    cleared: `${name} didn't take it, so you're cleared for this week.`,
    played: "Played. See you next Monday.",
    backed_out: `You backed out: ${minus(m.penalty_rating)} rating.`,
    missed: `Not played this week: ${minus(m.penalty_rating)} rating.`,
  }[m.status];

  return shell(
    <>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>This week's match</Eyebrow>
        <span className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] ${st.tone}`} data-testid="matchup-status">
          {(m.status === "played" || m.status === "cleared") && <Check className="h-3 w-3" aria-hidden="true" />}
          {st.label}
        </span>
      </div>
      <Link to={`/players/${encodeURIComponent(opp.username || "")}`} className="mt-2 flex min-w-0 items-center gap-3">
        <Avatar name={name} src={opp.avatar_url} size={48} player={opp} />
        <span className="min-w-0">
          <span className="block truncate font-heading text-lg font-semibold leading-tight">{name}</span>
          <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {opp.singles_rank ? `#${opp.singles_rank} · ` : ""}
            {opp.singles_rating} rating
          </span>
        </span>
      </Link>
      {m.why && (
        <p className="mt-2 text-sm" data-testid="matchup-why">
          <span className="text-muted-foreground">Why them: </span>
          {m.why}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stake label="Max win" value={`+${m.max_win}`} tone="text-success" testId="matchup-max-win" />
        <Stake label="Max loss" value={minus(m.max_loss)} tone="text-destructive" testId="matchup-max-loss" />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        A 2-0 either way, played as a challenge{m.frozen && !settled ? " · frozen when you said yes" : ""}.
      </p>
      {!settled && (
        <p className="mt-2 rounded-sm border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-warning" data-testid="matchup-deadline">
          {m.status === "cleared"
            ? `Cleared until ${deadline}.`
            : m.status === "waiting"
              ? `If they accept, play it by ${deadline} or lose ${m.miss_cost}. No answer by then: you owe nothing.`
              : `Play it this week (by ${deadline}) or lose ${m.miss_cost}.`}
        </p>
      )}
      <p className="mt-2 text-sm">{statusLine}</p>
      {error && (
        <p className="mt-2 rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
      {m.status === "open" && (
        <div className="mt-3">
          <Confirm
            trigger={
              <Button disabled={!!busy} className="h-12 w-full rounded-sm" data-testid="matchup-yes">
                {busy === "matchupYes" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                I'm in
              </Button>
            }
            title={`Play ${name} this week?`}
            body={`Once you say yes you can't back out without losing 2x the max loss (${minus(m.backout_cost)}).${theyAsked ? ` It accepts ${name}'s challenge.` : ` It sends ${name} a challenge.`}`}
            action="I'm in"
            onConfirm={() => act("matchupYes")}
          />
        </div>
      )}
      {record && <div className="mt-3">{record}</div>}
      {canBackOut && (
        <div className="mt-2 text-right">
          <Confirm
            trigger={
              <button
                type="button"
                disabled={!!busy}
                className="min-h-10 px-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive disabled:opacity-50"
                data-testid="matchup-backout"
              >
                {busy === "matchupBackOut" ? "Backing out…" : `Back out (${minus(m.backout_cost)})`}
              </button>
            }
            title="Back out of this week's match?"
            body={`You said yes, so backing out costs ${m.backout_cost} rating (2x your max loss) and cancels the challenge.`}
            action={`Back out · ${minus(m.backout_cost)}`}
            onConfirm={() => act("matchupBackOut")}
          />
        </div>
      )}
      {incomingList}
    </>,
  );
}

/** Home: the card in its own band under Your spot (nothing until it has loaded). */
export function HomeMatchup() {
  const { data } = useMatchup();
  if (!data) return null;
  return (
    <div className="border-b border-border">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        <MatchupCard className="sm:max-w-xl" />
      </div>
    </div>
  );
}

/** Everyone's matches this week (public), compact. */
export function WeekMatchesList() {
  const { data } = useQuery({
    queryKey: ["matchup", "list"],
    staleTime: 60_000,
    queryFn: async () => (await api.functions.invoke("listMatchups", {})).data,
  });
  const items = data?.items || [];
  if (!items.length) return null;
  return (
    <details className="rounded-sm border border-border bg-card" data-testid="week-matches">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
        <span>This week's matches</span>
        <span className="font-mono text-[10px] tracking-[0.1em]">{items.length}</span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {items.map((x) => (
          <li key={x.id} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 truncate">
              {x.player_name} <span className="text-muted-foreground">→</span> {x.opponent_name}
              {x.opponent_rank ? <span className="text-muted-foreground"> #{x.opponent_rank}</span> : null}
            </span>
            <span className={`shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] ${(STATE[x.status] || STATE.open).tone}`}>
              {x.status === "open" ? "Not yet" : (STATE[x.status] || STATE.open).label}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
