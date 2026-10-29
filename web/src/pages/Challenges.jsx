import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Check, LoaderCircle, Search, Undo2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { PageHeader } from "@/components/PageHeader";
import { clockFor, playerName } from "@/lib/ladder";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { SegmentedControl } from "@/components/match/SegmentedControl";
import { PlayerPicker } from "@/components/match/PlayerPicker";
import { BountyChip } from "@/components/BountyChip";
import { Avatar } from "@/components/Avatar";
import { useBounties } from "@/hooks/useBounties";
import { StakesLine, useStakes, rangeText } from "@/components/match/StakesLine";
import { MatchupCard, MatchedChip, WeekMatchesList } from "@/components/MatchupCard";
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

const minus = (n) => `−${Math.abs(n)}`;
const H2 = ({ children }) => (
  <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">{children}</h2>
);
/** "Thu 4:30pm" in the viewer's zone. */
const localWhen = (iso) =>
  new Date(iso)
    .toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
    .replace(" AM", "am")
    .replace(" PM", "pm");

export const isDoubles = (c) => c.format === "doubles";
export const pairsText = (c) =>
  `${c.challenger_name} & ${c.challenger_partner_name} vs ${c.defender_name} & ${c.defender_partner_name}`;
/** The three players a doubles challenge waits on (everyone but the challenger). */
export const invitedIds = (c) => [c.challenger_partner_user_id, c.defender_user_id, c.defender_partner_user_id];
/** A doubles challenge waiting on THIS user's answer. */
export const awaitsMe = (c, uid) =>
  isDoubles(c) && c.status === "open" && invitedIds(c).includes(uid) && !(c.accepted_user_ids || []).includes(uid);
const inChallenge = (c, uid) => (c.all_user_ids || [c.challenger_user_id, c.defender_user_id]).includes(uid);

/** NewMatch pre-filled with the challenge's players (your side first). */
export function recordPath(c, uid) {
  if (!isDoubles(c)) {
    const opp = c.challenger_user_id === uid ? c.defender_player_id : c.challenger_player_id;
    return `/matches/new?format=singles&opp=${opp}`;
  }
  const chal = [c.challenger_player_id, c.challenger_partner_player_id];
  const def = [c.defender_player_id, c.defender_partner_player_id];
  const mineIsChal = [c.challenger_user_id, c.challenger_partner_user_id].includes(uid);
  const myPid = mineIsChal
    ? (c.challenger_user_id === uid ? chal[0] : chal[1])
    : (c.defender_user_id === uid ? def[0] : def[1]);
  const mine = mineIsChal ? chal : def;
  const theirs = mineIsChal ? def : chal;
  const partner = mine.find((p) => p !== myPid);
  return `/matches/new?format=doubles&partner=${partner}&opp=${theirs[0]}&opp2=${theirs[1]}`;
}

export function outcomeText(t, asChallenger) {
  const pen = t.penalty_rating || 0;
  if (isDoubles(t)) {
    if (t.status === "declined") return "Declined · no penalty for anyone";
    if (t.status === "expired") return "Ran out of time · no penalty for anyone";
    return null;
  }
  if (t.revoke_kind === "swapped") return asChallenger ? "You swapped this challenge to someone else · free" : `${t.challenger_name} swapped to someone else · free`;
  if (t.revoke_kind === "revoked")
    return asChallenger
      ? `You revoked it${t.revoke_penalty > 0 ? ` · ${minus(t.revoke_penalty)} rating` : " · free"}`
      : `${t.challenger_name} revoked it${t.revoke_penalty > 0 ? ` · ${minus(t.revoke_penalty)} rating for them` : ""}`;
  if (!t.penalty_reason) return null;
  if (t.reversed) return "Penalty reversed by an admin";
  const rankMoved = t.penalty_rank_after != null && t.penalty_rank_after !== t.penalty_rank_before;
  const moved = rankMoved ? ` · #${t.penalty_rank_before} → #${t.penalty_rank_after}` : "";
  if (t.penalty_reason === "waived_recent_match") {
    return asChallenger
      ? `Declined · no penalty — ${t.defender_name} played you this week`
      : "Declined · no penalty — you played this week";
  }
  if (t.penalty_reason === "declined_down") {
    return asChallenger
      ? `Declined · ${t.defender_name} ${minus(pen)} rating${moved} (half: you are rated above)`
      : `Declined · ${minus(pen)} rating${moved} (half: they are rated above you)`;
  }
  if (t.penalty_reason === "expired_down") {
    return asChallenger
      ? `No response · ${t.defender_name} ${minus(pen)} rating · no walkover (you are rated above)`
      : `No response · ${minus(pen)} rating${moved}`;
  }
  if (t.penalty_reason === "expired") {
    return asChallenger
      ? `No response · walkover over ${t.defender_name} · +${t.challenger_rating_gain || pen} rating · +15 xp`
      : `No response · ${minus(pen)} rating${moved}`;
  }
  const halved = t.penalty_reason === "fatigue_halved" ? " (halved: busy week)" : "";
  return asChallenger
    ? `Declined · ${t.defender_name} ${minus(pen)} rating${moved}`
    : `Declined · ${minus(pen)} rating${moved}${halved}`;
}

// Wording for a row you are not part of (the list is public): third person, no "you".
export function publicOutcomeText(t) {
  const pen = t.penalty_rating || 0;
  if (isDoubles(t) || t.revoke_kind) return outcomeText(t, false);
  if (!t.penalty_reason) return null;
  if (t.reversed) return "Penalty reversed by an admin";
  if (t.penalty_reason === "waived_recent_match") return "Declined · no penalty — they played this week";
  if (t.penalty_reason === "declined_down") return `Declined · ${t.defender_name} ${minus(pen)} rating (half: challenged from above)`;
  if (t.penalty_reason === "expired_down") return `No response · ${minus(pen)} rating for ${t.defender_name} · no walkover`;
  if (t.penalty_reason === "expired")
    return `No response · walkover for ${t.challenger_name} · ${minus(pen)} rating for ${t.defender_name}`;
  return `Declined · ${t.defender_name} ${minus(pen)} rating${t.penalty_reason === "fatigue_halved" ? " (halved: busy week)" : ""}`;
}

/** Why ducking is free, in the defender's words (null when it costs). */
function freeWhy(reason) {
  return {
    waived_recent_match: "Declining is free this time — you played this challenger this week.",
    doubles: "No penalty for declining a doubles challenge.",
  }[reason] || null;
}

export function DeclineButton({ challenge, busy, onDecline }) {
  const { data } = useQuery({
    queryKey: ["penalty-preview", challenge.id],
    enabled: !isDoubles(challenge),
    queryFn: async () => (await api.functions.invoke("challengePenaltyPreview", { challenge_id: challenge.id })).data,
  });
  const d = isDoubles(challenge) ? { penalty: 0, reason: "doubles" } : data?.decline;
  const e = data?.expire;
  const growth = closeLossGain(useStakes({ challenge_id: challenge.id }).data);
  const label = !d ? "Decline" : d.penalty > 0 ? `Decline · ${minus(d.penalty)}` : "Decline · free";
  const silence = e
    ? e.penalty > 0
      ? ` Staying silent for 72 hours (weekends don't count) would cost ${e.penalty}${e.challenger_gain > 0 ? " and pay the challenger" : ""}.`
      : " Staying silent costs nothing either."
    : "";
  const confirmText = !d
    ? "Decline this challenge?"
    : d.penalty > 0
      ? `Declining costs ${d.penalty} rating${d.drops_rank ? ` and drops you to #${d.rank_after}` : ""}.${silence} Decline anyway?`
      : `${freeWhy(d.reason) || "Declining is free."}${isDoubles(challenge) ? " It closes the challenge for all four." : silence} Decline?`;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={busy} variant="outline" className="h-11 rounded-sm">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="w-[calc(100%-2rem)] rounded-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Decline this challenge?</AlertDialogTitle>
          <AlertDialogDescription>{confirmText}</AlertDialogDescription>
          {growth > 0 && (
            <p className="rounded-sm border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" data-testid="close-loss-warning">
              {`Even if you lose, you can still gain: keep it close (a narrow 2-1) and you take +${growth}. Only a clear beating costs you.`}
            </p>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-10 rounded-sm">Keep it</AlertDialogCancel>
          <AlertDialogAction className="min-h-10 rounded-sm" onClick={onDecline}>
            Decline
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Your gain from a narrow loss (the stakes preview's mildest loss), when it is a gain; else 0. */
const closeLossGain = (stakes) => {
  const me = stakes?.players?.find((p) => p.you);
  return me && me.lose?.[0] > 0 ? me.lose[0] : 0;
};

/** Free-to-decline note on an incoming singles challenge (shown before you open the dialog). */
function FreeNote({ challenge }) {
  const { data } = useQuery({
    queryKey: ["penalty-preview", challenge.id],
    queryFn: async () => (await api.functions.invoke("challengePenaltyPreview", { challenge_id: challenge.id })).data,
  });
  const why = data?.decline && data.decline.penalty === 0 ? freeWhy(data.decline.reason) : null;
  if (!why) return null;
  return (
    <p className="mt-2 text-xs text-success">
      {why}
      {data.expire?.penalty > 0 && ` Ignoring it still costs ${data.expire.penalty}.`}
    </p>
  );
}

/**
 * Take back a challenge you sent: swap it to someone else (free, open challenges only) or revoke it for good (costs what
 * ducking them would). Weekly matches use Back out on the match card instead.
 */
function RevokeButton({ challenge, me, targets, atLimit, busy, onSwap, onRevoke }) {
  const [open, setOpen] = useState(false);
  const [swapTo, setSwapTo] = useState("");
  const { data } = useQuery({
    queryKey: ["revoke-quote", challenge.id],
    enabled: open,
    queryFn: async () => (await api.functions.invoke("revokeQuote", { challenge_id: challenge.id })).data,
  });
  const cost = data?.revoke?.penalty ?? null;
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const options = targets.filter(
    (p) =>
      p.id !== challenge.defender_player_id &&
      !atLimit[p.id] &&
      (!needle || playerName(p).toLowerCase().includes(needle) || String(p.username || "").toLowerCase().includes(needle)),
  );
  const bountyOf = useBounties("singles");
  const picked = targets.find((p) => p.id === swapTo);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-sm border border-border bg-card px-3 text-sm font-medium transition-colors hover:border-foreground/40 disabled:opacity-50"
          data-testid="revoke"
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Revoke
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[88dvh] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Take back your challenge?</AlertDialogTitle>
          <AlertDialogDescription>
            {`Send it to someone else instead and it's free. Revoke it for good and it costs you what ducking ${challenge.defender_name} would.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {data?.can_swap !== false && (
          <div className="space-y-2 rounded-sm border border-success/40 bg-success/5 p-3">
            <p className="text-sm font-medium">
              Swap to someone else <span className="font-mono text-xs text-success">· free</span>
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search players"
                aria-label="Search players to swap to"
                className="h-11 w-full rounded-sm border border-input bg-card pl-9 pr-3 text-base outline-none focus:border-foreground/40 lg:text-sm"
              />
            </div>
            <ul
              id={`swap-${challenge.id}`}
              role="listbox"
              aria-label="Pick a player to swap to"
              className="max-h-56 space-y-1 overflow-y-auto overscroll-contain rounded-sm border border-border bg-card p-1"
            >
              {options.map((p) => {
                const picked = swapTo === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={picked}
                      onClick={() => setSwapTo(p.id)}
                      className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors ${picked ? "bg-foreground text-background" : "hover:bg-secondary"}`}
                    >
                      <span className={`w-6 shrink-0 font-mono text-xs tabular-nums ${picked ? "text-background/70" : "text-muted-foreground"}`}>{p.singles_rank}</span>
                      <Avatar name={playerName(p)} src={p.avatar_url} size={28} player={p} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-heading text-sm font-semibold">{playerName(p)}</span>
                        <span className={`block font-mono text-[10px] uppercase tracking-[0.1em] ${picked ? "text-background/70" : "text-muted-foreground"}`}>{`${p.singles_rating} rating`}</span>
                      </span>
                      <BountyChip bounty={bountyOf(p)} />
                      {picked && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
              {!options.length && (
                <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                  {needle ? `Nobody matches "${q.trim()}".` : "Nobody else can take a challenge right now."}
                </li>
              )}
            </ul>
            {picked && <SwapCompare from={challenge} to={picked} me={me} />}
            {picked && <QuoteLine target={picked} />}
            <Button className="h-11 w-full rounded-sm" disabled={!swapTo || busy} onClick={async () => (await onSwap(swapTo), setOpen(false))}>
              {picked ? `Swap ${challenge.defender_name} → ${playerName(picked)} · free` : "Pick a player to swap to"}
            </Button>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-10 rounded-sm">Keep it</AlertDialogCancel>
          <Button
            variant="outline"
            className="min-h-10 rounded-sm border-destructive/50 text-destructive hover:bg-destructive/10"
            disabled={busy || cost == null}
            onClick={async () => (await onRevoke(), setOpen(false))}
            data-testid="revoke-confirm"
          >
            {cost == null ? "Working out the cost…" : cost > 0 ? `Revoke for good · ${minus(cost)}` : "Revoke for good · free"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RecordButton({ challenge, userId }) {
  return (
    <Link
      to={recordPath(challenge, userId)}
      className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground"
    >
      Record result
    </Link>
  );
}

/** A doubles challenge: both pairs, who has accepted, and accept/decline for an invited player who hasn't answered. */
export function DoublesCard({ challenge: c, userId, busy, onRespond }) {
  const accepted = c.accepted_user_ids || [];
  const mineToAnswer = awaitsMe(c, userId);
  const canBackOut = c.status === "open" && invitedIds(c).includes(userId) && accepted.includes(userId);
  const who = (uid, name) => {
    const state = uid === c.challenger_user_id ? "sent it" : accepted.includes(uid) ? "in" : c.status === "open" ? "waiting" : "";
    return (
      <li className="flex min-w-0 items-center justify-between gap-2" key={uid}>
        <span className="min-w-0 truncate font-heading text-sm font-semibold">
          {name}
          {uid === userId && <span className="font-normal text-muted-foreground"> (you)</span>}
        </span>
        {state && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em] ${state === "waiting" ? "text-warning" : "text-muted-foreground"}`}
          >
            {(state === "in" || state === "sent it") && <Check className="h-3 w-3" aria-hidden="true" />}
            {state}
          </span>
        )}
      </li>
    );
  };
  return (
    <li className="rounded-sm border border-border bg-card p-3" data-testid="doubles-challenge">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-[0.55rem] uppercase tracking-[0.16em] text-muted-foreground">Doubles challenge</p>
        <StatusBadge status={c.status} />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 min-[400px]:grid-cols-[1fr_auto_1fr] min-[400px]:items-center">
        <ul className="space-y-1 rounded-sm bg-secondary/50 px-2.5 py-2">
          {who(c.challenger_user_id, c.challenger_name)}
          {who(c.challenger_partner_user_id, c.challenger_partner_name)}
        </ul>
        <span className="text-center font-mono text-[10px] uppercase text-muted-foreground">vs</span>
        <ul className="space-y-1 rounded-sm bg-secondary/50 px-2.5 py-2">
          {who(c.defender_user_id, c.defender_name)}
          {who(c.defender_partner_user_id, c.defender_partner_name)}
        </ul>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {c.status === "open"
          ? `Needs all three to accept · ${clockFor(c)}`
          : c.status === "accepted"
            ? `Everyone is in · ${clockFor(c, { left: "left to play" })}`
            : outcomeText(c, false)}
      </p>
      {c.message && <p className="mt-2 rounded-sm bg-secondary/60 px-2.5 py-1.5 text-xs">“{c.message}”</p>}
      {["open", "accepted"].includes(c.status) && <StakesLine request={{ challenge_id: c.id }} className="mt-2" />}
      {mineToAnswer && <p className="mt-2 text-xs text-success">No penalty for declining a doubles challenge.</p>}
      {mineToAnswer && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button onClick={() => onRespond(c, "accept")} disabled={!!busy} className="h-11 rounded-sm">
            {busy === `accept-${c.id}` && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Accept
          </Button>
          <DeclineButton challenge={c} busy={!!busy} onDecline={() => onRespond(c, "decline")} />
        </div>
      )}
      {canBackOut && (
        <div className="mt-3">
          <DeclineButton challenge={c} busy={!!busy} onDecline={() => onRespond(c, "decline")} />
        </div>
      )}
      {c.status === "accepted" && inChallenge(c, userId) && <RecordButton challenge={c} userId={userId} />}
    </li>
  );
}

/** What declining / ignoring would cost the player you picked, before you send it. */
/** Side by side: the challenge you have out now vs the one you'd swap to, for you (elo ranges, XP, bounty). */
function SwapCompare({ from, to, me }) {
  const now = useStakes({ challenge_id: from.id }).data;
  const next = useStakes(
    me ? { format: "singles", target: 11, as_challenge: true, side_a: [{ player_id: me.id }], side_b: [{ player_id: to.id }] } : null,
  ).data;
  const a = now?.players?.find((p) => p.you);
  const b = next?.players?.find((p) => p.you);
  const rows = [
    ["If you win", (x) => x && rangeText(x.win), (x) => x?.win?.[1]],
    ["If you lose", (x) => x && rangeText(x.lose), (x) => x?.lose?.[1]],
    ["XP if you win", (x) => x && `+${x.xp_win}`, (x) => x?.xp_win],
    ["XP if you lose", (x) => x && `+${x.xp_lose}`, (x) => x?.xp_lose],
    ["Bounty", (x) => (x ? (x.bounty_win ? `+${x.bounty_win.rating} · ${x.bounty_win.xp}xp` : "none") : null), (x) => x?.bounty_win?.rating || 0],
  ];
  const better = (va, vb) => (va == null || vb == null || va === vb ? null : vb > va ? "b" : "a");
  return (
    <div className="overflow-hidden rounded-sm border border-border bg-card text-xs" data-testid="swap-compare">
      <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-border bg-secondary/60 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        <span className="px-2 py-1.5" />
        <span className="truncate px-2 py-1.5">{`Now: ${from.defender_name}`}</span>
        <span className="truncate px-2 py-1.5 text-foreground">{`Swap: ${playerName(to)}`}</span>
      </div>
      {rows.map(([label, show, val]) => {
        const w = better(val(a), val(b));
        return (
          <div key={label} className="grid grid-cols-[1fr_1fr_1fr] border-b border-border last:border-0">
            <span className="px-2 py-1.5 text-muted-foreground">{label}</span>
            <span className={`px-2 py-1.5 font-mono tabular-nums ${w === "a" ? "font-semibold text-success" : ""}`}>{show(a) ?? "…"}</span>
            <span className={`px-2 py-1.5 font-mono tabular-nums ${w === "b" ? "font-semibold text-success" : ""}`}>{show(b) ?? "…"}</span>
          </div>
        );
      })}
      <p className="border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground">
        Elo: a narrow 2-1 to a dominant 2-0, played as a challenge. XP: a 2-0 win or a 2-1 loss, before first-of-day and streak bonuses.
      </p>
    </div>
  );
}

/** The swap button with its confirmation: who goes out, who comes in, and what changes for you. */
function SwapConfirm({ from, to, me, busy, onSwap, trigger }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      {to && (
        <AlertDialogContent className="max-h-[88dvh] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Swap ${from.defender_name} for ${playerName(to)}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Your challenge to ${from.defender_name} is taken back and goes to ${playerName(to)} instead. Free, and it doesn't use one of your weekly sends.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SwapCompare from={from} to={to} me={me} />
          <QuoteLine target={to} />
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-10 rounded-sm">{`Keep ${from.defender_name}`}</AlertDialogCancel>
            <AlertDialogAction className="min-h-10 rounded-sm" onClick={onSwap}>
              {`Swap to ${playerName(to)}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}

/** Before sending (or swapping) a challenge: what's on the line for you, and what ducking it would cost them. */
function SendPreview({ me, target }) {
  return (
    <div className="space-y-2">
      {me && (
        <StakesLine
          request={{ format: "singles", target: 11, side_a: [{ player_id: me.id }], side_b: [{ player_id: target.id }] }}
        />
      )}
      <QuoteLine target={target} />
    </div>
  );
}

function QuoteLine({ target }) {
  const { data } = useQuery({
    queryKey: ["challenge-quote", target.id],
    staleTime: 30_000,
    queryFn: async () => (await api.functions.invoke("challengeQuote", { defender_player_id: target.id })).data,
  });
  if (!data?.decline) return null;
  const name = playerName(target);
  const d = data.decline;
  const e = data.expire;
  const decline =
    d.penalty > 0
      ? `If ${name} declines: ${minus(d.penalty)} for them.`
      : {
          waived_recent_match: `Free for ${name} to decline — you played this week.`,
        }[d.reason] || `Free for ${name} to decline.`;
  const silence =
    e.penalty > 0
      ? ` No answer: ${minus(e.penalty)} for them${e.challenger_gain > 0 ? `, +${e.challenger_gain} for you` : ", no walkover"}.`
      : "";
  return (
    <p className="rounded-sm border border-border bg-secondary/50 px-2.5 py-1.5 text-xs" data-testid="challenge-quote">
      {decline}
      {silence}
    </p>
  );
}

export function Challenges() {
  const { user } = useAuth();
  const { player, isLoading: playerLoading } = useMyPlayer();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [format, setFormat] = useState("singles");
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [opp1Id, setOpp1Id] = useState("");
  const [opp2Id, setOpp2Id] = useState("");
  const [recentFilter, setRecentFilter] = useState("all");
  const [message, setMessage] = useState("");
  const { data: challenges = [] } = useQuery({
    queryKey: ["challenges", user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await api.entities.Challenge.list({ limit: 100 })).items || [],
  });
  const { data: limits } = useQuery({
    queryKey: ["challenges", "limits", user?.id],
    enabled: !!user?.id,
    queryFn: async () => (await api.functions.invoke("challengeLimits", {})).data,
  });
  const { data: allPlayers = [] } = useQuery({
    queryKey: ["players"],
    queryFn: async () => (await api.entities.Player.list({ limit: 300 })).items || [],
  });
  const myRank = Number(player?.singles_rank) || 0;
  const bountyOf = useBounties("singles");
  const atLimit = limits?.at_limit || {};
  const outOfSends = limits && limits.sends_left <= 0;
  const ladder = useMemo(
    () => allPlayers.filter((p) => p.singles_rank != null && p.id !== player?.id).sort((a, b) => a.singles_rank - b.singles_rank),
    [allPlayers, player?.id],
  );
  const q = search.trim().toLowerCase();
  const targets = q
    ? ladder.filter((p) => playerName(p).toLowerCase().includes(q) || String(p.username || "").toLowerCase().includes(q))
    : ladder;
  const selected = ladder.find((p) => p.id === selectedId);
  const others = allPlayers.filter((p) => p.id !== player?.id);
  const limited = [opp1Id, opp2Id].map((id) => others.find((p) => p.id === id)).filter((p) => p && atLimit[p.id]);

  useEffect(() => {
    user?.id &&
      api.functions
        .invoke("syncLadder", {})
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["challenges"] });
          queryClient.invalidateQueries({ queryKey: ["players"] });
          queryClient.invalidateQueries({ queryKey: ["my-player"] });
          queryClient.invalidateQueries({ queryKey: ["matchup"] });
        })
        .catch(() => {});
  }, [user?.id, queryClient]);
  useEffect(() => setError(""), [format]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["challenges"] });
    queryClient.invalidateQueries({ queryKey: ["players"] });
    queryClient.invalidateQueries({ queryKey: ["challenge-quote"] });
    queryClient.invalidateQueries({ queryKey: ["queue"] });
    queryClient.invalidateQueries({ queryKey: ["matchup"] });
  };
  const act = async (name, payload, key) => {
    setBusy(key);
    setError("");
    try {
      const r = await api.functions.invoke(name, payload);
      if (r.data?.error) throw Error(r.data.error);
      refresh();
      return true;
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Something went wrong.");
      return false;
    } finally {
      setBusy("");
    }
  };
  const respond = (c, decision) => act("respondChallenge", { challenge_id: c.id, decision }, `${decision}-${c.id}`);

  const uid = user?.id;
  const incoming = challenges.filter(
    (t) => (!isDoubles(t) && t.defender_user_id === uid && t.status === "open") || awaitsMe(t, uid),
  );
  const outgoing = challenges.filter(
    (t) =>
      !incoming.includes(t) &&
      inChallenge(t, uid) &&
      (t.status === "accepted" || (t.status === "open" && (t.challenger_user_id === uid || isDoubles(t)))),
  );
  // Your live regular singles challenge (one at a time): open = can be swapped for free from the send list.
  const myLive = challenges.find(
    (t) => !isDoubles(t) && !t.matchup_id && t.challenger_user_id === uid && (t.status === "open" || t.status === "accepted"),
  );
  const canSwap = myLive?.status === "open";
  // Challenges are public: everyone's recent ones, with the ones you are part of marked "You".
  const isMine = (e) => inChallenge(e, uid);
  const recentAll = challenges.filter((e) => !incoming.includes(e) && !outgoing.includes(e));
  const recent = (recentFilter === "mine" ? recentAll.filter(isMine) : recentAll).slice(0, 8);

  const sendsLine = limits && (
    <p className={`text-xs ${outOfSends ? "text-warning" : "text-muted-foreground"}`} data-testid="sends-left">
      {outOfSends
        ? `You have sent ${limits.sent_cap} challenges this week. Your next one frees up ${localWhen(limits.send_again_at)}.`
        : `${limits.sends_left} of ${limits.sent_cap} challenges left this week (singles and doubles together).`}
    </p>
  );
  const noteBox = (
    <textarea
      value={message}
      onChange={(e) => setMessage(e.target.value)}
      rows={2}
      maxLength={200}
      placeholder="Add a note (optional) — e.g. 'Court at 4pm?'"
      className="w-full rounded-sm border border-input bg-card px-3 py-2 text-base outline-none focus:border-foreground/40 lg:text-sm"
    />
  );

  const singlesCard = (e) => {
    const mine = e.challenger_user_id === uid;
    const other = mine ? e.defender_name : e.challenger_name;
    const otherRank = mine ? e.defender_rank : e.challenger_rank;
    return (
      <li className="rounded-sm border border-border bg-card p-3" key={e.id}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-heading text-sm font-semibold">
              <span>
                {mine ? "vs " : ""}
                {other}
                {otherRank != null && ` (#${otherRank})`}
              </span>
              <MatchedChip challenge={e} />
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {e.status === "open" ? clockFor(e) : `Accepted · ${clockFor(e, { left: "left to play" })}`}
            </p>
          </div>
          <StatusBadge status={e.status} />
        </div>
        {e.message && <p className="mt-2 rounded-sm bg-secondary/60 px-2.5 py-1.5 text-xs">“{e.message}”</p>}
        <StakesLine request={{ challenge_id: e.id }} className="mt-2" />
        {e.status === "open" && !mine && <FreeNote challenge={e} />}
        {e.status === "open" && !mine && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => respond(e, "accept")} disabled={!!busy} className="h-11 rounded-sm">
              {busy === `accept-${e.id}` && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Accept
            </Button>
            <DeclineButton challenge={e} busy={!!busy} onDecline={() => respond(e, "decline")} />
          </div>
        )}
        {e.status === "accepted" && <RecordButton challenge={e} userId={uid} />}
        {mine && !e.matchup_id && (e.status === "open" || e.status === "accepted") && (
          <RevokeButton
            challenge={e}
            me={player}
            targets={ladder}
            atLimit={atLimit}
            busy={!!busy}
            onSwap={(to) => act("revokeChallenge", { challenge_id: e.id, swap_to_player_id: to }, `revoke-${e.id}`)}
            onRevoke={() => act("revokeChallenge", { challenge_id: e.id }, `revoke-${e.id}`)}
          />
        )}
      </li>
    );
  };
  const card = (c) =>
    isDoubles(c) ? <DoublesCard key={c.id} challenge={c} userId={uid} busy={busy} onRespond={respond} /> : singlesCard(c);

  return (
    <>
      <PageHeader
        eyebrow="Duels"
        title="Challenges"
        description="Challenge anyone on the ladder, or set up a doubles challenge. The window is 72 hours, not counting weekends. Ducking a singles challenge from someone rated below you costs rating."
      />
      <div className="mx-auto max-w-2xl space-y-7 px-4 py-6 sm:px-6">
        <div className="space-y-2">
          <MatchupCard />
          <WeekMatchesList />
        </div>
        {error && (
          <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <section>
          <H2>Waiting on you</H2>
          {incoming.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No challenges waiting on your answer.</p>
          ) : (
            <ul className="mt-2 space-y-2">{incoming.map(card)}</ul>
          )}
        </section>
        <section>
          <H2>In progress</H2>
          {outgoing.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">You have no open challenges.</p>
          ) : (
            <ul className="mt-2 space-y-2">{outgoing.map(card)}</ul>
          )}
        </section>
        <section className="space-y-3">
          <H2>Send a challenge</H2>
          <SegmentedControl
            label="Challenge format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "singles", label: "Singles" },
              { value: "doubles", label: "Doubles" },
            ]}
          />
          {sendsLine}
          {format === "singles" ? (
            playerLoading ? (
              <p className="text-sm text-muted-foreground">Loading the ladder…</p>
            ) : myRank === 0 ? (
              <p className="text-sm text-muted-foreground">
                {(Number(player?.singles_wins) || 0) + (Number(player?.singles_losses) || 0) === 0
                  ? "You are not ranked yet. Play your first verified ranked singles match to get a ladder position, then you can challenge anyone on it."
                  : "You are not on the ranked ladder right now — play a verified ranked singles match to get back on it."}
              </p>
            ) : (
              <>
                {ladder.length > 8 && (
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find a player"
                    aria-label="Find a player to challenge"
                    className="h-11 w-full rounded-sm border border-input bg-card px-3 text-base outline-none focus:border-foreground/40 lg:text-sm"
                  />
                )}
                <ul className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-contain" data-testid="challenge-targets">
                  {targets.map((e) => {
                    const full = atLimit[e.id];
                    const down = (Number(player?.singles_rating) || 0) > (Number(e.singles_rating) || 0);
                    const current = myLive?.defender_player_id === e.id;
                    const tag = current ? "your challenge" : full ? "weekly limit" : selectedId === e.id ? "selected" : down ? "half cost" : "challenge";
                    if (canSwap && !current && !full)
                      return (
                        <li key={e.id} className="flex min-h-[54px] items-center gap-3 rounded-sm border border-border bg-card px-3 py-2">
                          <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">{e.singles_rank}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-heading text-sm font-semibold">{playerName(e)}</span>
                              <BountyChip bounty={bountyOf(e)} />
                            </span>
                            <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              {`${e.singles_rating} rating${down ? " · half cost" : ""}`}
                            </span>
                          </span>
                          <SwapConfirm
                            from={myLive}
                            to={e}
                            me={player}
                            busy={busy === `swap-${e.id}`}
                            onSwap={() =>
                              act("revokeChallenge", { challenge_id: myLive.id, swap_to_player_id: e.id, ...(message.trim() ? { message } : null) }, `swap-${e.id}`)
                            }
                            trigger={
                              <button
                                type="button"
                                disabled={!!busy}
                                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-sm bg-secondary px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50"
                                data-testid={`swap-${e.username}`}
                              >
                                {busy === `swap-${e.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}
                                Swap
                              </button>
                            }
                          />
                        </li>
                      );
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          disabled={!!full}
                          onClick={() => setSelectedId(e.id)}
                          title={full ? `${playerName(e)} is at their weekly limit until ${localWhen(full)}` : undefined}
                          className={`flex min-h-[54px] w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${selectedId === e.id ? "border-foreground bg-secondary" : "border-border bg-card hover:border-foreground/40"}`}
                        >
                          <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">{e.singles_rank}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate font-heading text-sm font-semibold">{playerName(e)}</span>
                              <BountyChip bounty={bountyOf(e)} />
                            </span>
                            <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              {e.singles_rating}
                              {" rating"}
                              {full ? ` · free again ${localWhen(full)}` : ""}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 text-right font-mono text-[10px] uppercase ${full ? "text-muted-foreground" : down ? "text-muted-foreground" : "text-brand"}`}
                          >
                            {tag}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {targets.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {q ? "Nobody on the ladder matches that." : "There is nobody else on the ladder yet."}
                  </p>
                )}
                {!canSwap && selected && <SendPreview me={player} target={selected} />}
                {noteBox}
                {myLive && !canSwap && (
                  <p className="rounded-sm border border-border bg-secondary/50 px-3 py-2 text-xs" data-testid="swap-note">
                    {`${myLive.defender_name} already accepted your challenge. Play it, or revoke it from In progress, before sending another.`}
                  </p>
                )}
                {canSwap ? null : (
                  <Button
                    onClick={async () => {
                      (await act("createChallenge", { defender_player_id: selectedId, message }, "create")) &&
                        (setSelectedId(""), setMessage(""));
                    }}
                    disabled={!selectedId || !!busy || outOfSends || !!myLive}
                    className="h-12 w-full rounded-sm"
                  >
                    {busy === "create" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    Send challenge
                  </Button>
                )}
              </>
            )
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Pick a partner and two opponents, anyone with a profile. All three have to accept; nobody loses rating for
                saying no.
              </p>
              <div className="space-y-2 rounded-sm border border-border bg-card p-3">
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Your partner</p>
                <PlayerPicker
                  label="Pick your partner"
                  format="doubles"
                  players={others}
                  value={partnerId}
                  onChange={setPartnerId}
                  excludeIds={[opp1Id, opp2Id]}
                />
                <p className="pt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Opponents</p>
                <PlayerPicker
                  label="Pick an opponent"
                  format="doubles"
                  bounty
                  players={others}
                  value={opp1Id}
                  onChange={setOpp1Id}
                  excludeIds={[partnerId, opp2Id]}
                />
                <PlayerPicker
                  label="Pick the second opponent"
                  format="doubles"
                  bounty
                  players={others}
                  value={opp2Id}
                  onChange={setOpp2Id}
                  excludeIds={[partnerId, opp1Id]}
                />
              </div>
              {limited.length > 0 && (
                <p className="text-xs text-warning">
                  {limited.map((p) => `${playerName(p)} is at their weekly limit until ${localWhen(atLimit[p.id])}.`).join(" ")}
                </p>
              )}
              {partnerId && opp1Id && opp2Id && player && (
                <StakesLine
                  request={{
                    format: "doubles",
                    target: 11,
                    side_a: [player.id, partnerId].map((id) => ({ player_id: id })),
                    side_b: [opp1Id, opp2Id].map((id) => ({ player_id: id })),
                  }}
                />
              )}
              {noteBox}
              <Button
                onClick={async () => {
                  (await act(
                    "createChallenge",
                    {
                      format: "doubles",
                      partner_player_id: partnerId,
                      defender_player_id: opp1Id,
                      defender_partner_player_id: opp2Id,
                      message,
                    },
                    "create",
                  )) && (setPartnerId(""), setOpp1Id(""), setOpp2Id(""), setMessage(""));
                }}
                disabled={!partnerId || !opp1Id || !opp2Id || !!busy || outOfSends || limited.length > 0}
                className="h-12 w-full rounded-sm"
              >
                {busy === "create" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                Send doubles challenge
              </Button>
            </>
          )}
        </section>
        {recentAll.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-3">
              <H2>Recent</H2>
              {user && (
                <div className="w-36">
                  <SegmentedControl
                    label="Show recent challenges"
                    value={recentFilter}
                    onChange={setRecentFilter}
                    options={[
                      { value: "all", label: "All" },
                      { value: "mine", label: "Mine" },
                    ]}
                  />
                </div>
              )}
            </div>
            {recent.length === 0 && <p className="mt-2 text-sm text-muted-foreground">You have no past challenges yet.</p>}
            <ul className={`mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card ${recent.length ? "" : "hidden"}`}>
              {recent.map((t) => {
                const n = t.challenger_user_id === uid;
                const mine = isMine(t);
                const title = isDoubles(t)
                  ? `Doubles · ${pairsText(t)}`
                  : n
                    ? `You → ${t.defender_name}`
                    : mine
                      ? `${t.challenger_name} → You`
                      : `${t.challenger_name} → ${t.defender_name}`;
                const outcome = mine ? outcomeText(t, n) : publicOutcomeText(t);
                return (
                  <li className="space-y-2 px-3 py-2.5" key={t.id} data-mine={mine || undefined}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 break-words font-heading text-sm">{title}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <MatchedChip challenge={t} />
                        {mine && (
                          <span className="rounded-sm border border-foreground px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]">
                            You
                          </span>
                        )}
                        <StatusBadge status={t.status} />
                      </span>
                    </div>
                    {outcome && <p className="text-xs text-muted-foreground">{outcome}</p>}
                    {mine && !n && !isDoubles(t) &&
                      t.penalty_reason &&
                      !t.reversed &&
                      !t.review_requested &&
                      (t.penalty_rating > 0 || t.penalty_rank_after !== t.penalty_rank_before) && (
                        <Button
                          onClick={() => act("resolveChallenge", { challenge_id: t.id, action: "request" }, `review-${t.id}`)}
                          variant="outline"
                          className="h-10 w-full rounded-sm text-xs"
                          disabled={!!busy}
                        >
                          Ask an admin to review this penalty
                        </Button>
                      )}
                    {mine && !n && t.review_requested && !t.reversed && (
                      <p className="text-xs text-warning">Review requested — an admin will decide.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <EmptyState
          title="How challenges move rating"
          body="Rank follows rating. Saying no to someone rated below you costs rating, and staying silent for 72 hours (weekends don't count) costs double and pays them. Saying no to someone rated above you costs half, and so does staying silent. Losing a close one to a much stronger player still gains you rating. Doubles challenges never cost anything."
          action={
            <Link
              to="/rules"
              className="inline-flex min-h-10 items-center rounded-sm border border-border bg-card px-4 py-2 text-sm font-medium hover:border-foreground/40"
            >
              Read the rules
            </Link>
          }
        />
      </div>
    </>
  );
}
