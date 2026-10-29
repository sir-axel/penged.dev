import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { PageHeader } from "@/components/PageHeader";
import { challengeClock, playerName } from "@/lib/ladder";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { SegmentedControl } from "@/components/match/SegmentedControl";
import { PlayerPicker } from "@/components/match/PlayerPicker";
import { StakesLine } from "@/components/match/StakesLine";
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
    return asChallenger ? `Declined · free — you are rated above ${t.defender_name}` : "Declined · free — they are rated above you";
  }
  if (t.penalty_reason === "declined_down_close") {
    return asChallenger
      ? `Declined · ${t.defender_name} ${minus(pen)} rating${moved} (half: you are just above)`
      : `Declined · ${minus(pen)} rating${moved} (half: they are just above you)`;
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
  if (isDoubles(t)) return outcomeText(t, false);
  if (!t.penalty_reason) return null;
  if (t.reversed) return "Penalty reversed by an admin";
  if (t.penalty_reason === "waived_recent_match") return "Declined · no penalty — they played this week";
  if (t.penalty_reason === "declined_down") return "Declined · free — challenged by someone rated well above";
  if (t.penalty_reason === "declined_down_close") return `Declined · ${t.defender_name} ${minus(pen)} rating (half: challenged from just above)`;
  if (t.penalty_reason === "expired_down") return `No response · ${minus(pen)} rating for ${t.defender_name} · no walkover`;
  if (t.penalty_reason === "expired")
    return `No response · walkover for ${t.challenger_name} · ${minus(pen)} rating for ${t.defender_name}`;
  return `Declined · ${t.defender_name} ${minus(pen)} rating${t.penalty_reason === "fatigue_halved" ? " (halved: busy week)" : ""}`;
}

/** Why ducking is free, in the defender's words (null when it costs). */
function freeWhy(reason) {
  return {
    declined_down: "No penalty for declining — they are rated well above you (3+ places up).",
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
          ? `Needs all three to accept · ${challengeClock(c.expires_at)}`
          : c.status === "accepted"
            ? `Everyone is in — play by ${challengeClock(c.expires_at)}`
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
          declined_down: `Free for ${name} to decline — you are 3+ places above them.`,
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
        })
        .catch(() => {});
  }, [user?.id, queryClient]);
  useEffect(() => setError(""), [format]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["challenges"] });
    queryClient.invalidateQueries({ queryKey: ["players"] });
    queryClient.invalidateQueries({ queryKey: ["challenge-quote"] });
    queryClient.invalidateQueries({ queryKey: ["queue"] });
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
            <p className="font-heading text-sm font-semibold">
              {mine ? "vs " : ""}
              {other}
              {otherRank != null && ` (#${otherRank})`}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {e.status === "open" ? challengeClock(e.expires_at) : `Accepted — play by ${challengeClock(e.expires_at)}`}
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
                    const farDown = down && player?.singles_rank != null && e.singles_rank != null && Math.abs(e.singles_rank - player.singles_rank) > 2;
                    const tag = full ? "weekly limit" : selectedId === e.id ? "selected" : farDown ? "free to decline" : down ? "half cost" : "challenge";
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
                            <span className="block truncate font-heading text-sm font-semibold">{playerName(e)}</span>
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
                {selected && <QuoteLine target={selected} />}
                {noteBox}
                <Button
                  onClick={async () => {
                    (await act("createChallenge", { defender_player_id: selectedId, message }, "create")) &&
                      (setSelectedId(""), setMessage(""));
                  }}
                  disabled={!selectedId || !!busy || outOfSends}
                  className="h-12 w-full rounded-sm"
                >
                  {busy === "create" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Send challenge
                </Button>
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
                  players={others}
                  value={partnerId}
                  onChange={setPartnerId}
                  excludeIds={[opp1Id, opp2Id]}
                />
                <p className="pt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Opponents</p>
                <PlayerPicker
                  label="Pick an opponent"
                  players={others}
                  value={opp1Id}
                  onChange={setOpp1Id}
                  excludeIds={[partnerId, opp2Id]}
                />
                <PlayerPicker
                  label="Pick the second opponent"
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
          body="Rank follows rating. Saying no to someone rated below you costs rating, and staying silent for 72 hours (weekends don't count) costs double and pays them. Saying no to someone 1–2 places above you costs half, and is free further up; staying silent costs half. Doubles challenges never cost anything."
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
