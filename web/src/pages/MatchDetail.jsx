import { BackButton } from "@/components/BackButton";
import { describeChange, describeGames } from "@/lib/ratingFactors";
import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, LoaderCircle, MessageSquare, TriangleAlert, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { formatShortDate } from "@/lib/ladder";
import { StatusBadge } from "@/components/StatusBadge";
import { SideCard } from "@/components/SideCard";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/TierBadge";
import { tierChips } from "@/lib/feedChips";
import { tierFor } from "@/lib/tiers";
import { Composer } from "@/components/chat/Composer";
import { api } from "@/api/client";

const sideLabel = (side) => (side || []).map((e) => e.display_name || e.username || "A player").join(" & ");

/** Link to the match's dispute topic, or (pending/disputed, participants only) a way to start one. */
function DiscussSection({ match, isParticipant }) {
  const nav = useNavigate();
  const [composing, setComposing] = useState(false);
  const { data: topic } = useQuery({
    queryKey: ["match-topic", match.id],
    staleTime: 30000,
    queryFn: async () => (await api.functions.invoke("listTopics", { match_id: match.id })).data.items[0] || null,
  });
  const open = ["pending", "disputed"].includes(match.status);
  if (!topic && !(open && isParticipant)) return null;
  const date = new Date(match.created_date).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const title = `Dispute: ${sideLabel(match.side_a)} vs ${sideLabel(match.side_b)} · ${date}`.slice(0, 120);
  const start = async (body) => {
    const { data } = await api.functions.invoke("createTopic", { category: "disputes", title, body, match_id: match.id });
    nav(`/chat/t/${data.topic.id}`);
  };
  return (
    <section className="space-y-2" aria-label="Discussion">
      <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">Discussion</h2>
      {topic ? (
        <Link
          to={`/chat/t/${topic.id}`}
          className="flex min-h-11 items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/40"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          <span className="flex-1">Open the discussion</span>
          <span className="font-mono text-[11px] text-muted-foreground">{topic.post_count} {topic.post_count === 1 ? "post" : "posts"}</span>
        </Link>
      ) : composing ? (
        <Composer
          id="discuss-body"
          label="Start a discussion"
          autoFocus
          rows={4}
          buttonLabel="Open discussion"
          initialText={`Let's sort out this result (${sideLabel(match.side_a)} vs ${sideLabel(match.side_b)}). `}
          onSend={start}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <Button variant="outline" onClick={() => setComposing(true)} className="h-11 w-full rounded-sm">
          <MessageSquare className="mr-2 h-4 w-4" aria-hidden="true" />
          Discuss
        </Button>
      )}
    </section>
  );
}

export function MatchDetail() {
  let { id } = useParams(),
    { user } = useAuth(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    {
      data: match,
      isLoading,
      refetch: refetch,
    } = useQuery({
      queryKey: ["match", id],
      queryFn: async () =>
        api.entities.Match.get(id).catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    });
  // Matches verified before rating_changes carried matches_played: fall back to each player's current count.
  const legacyIds = (match?.rating_changes || []).filter((c) => c.matches_played == null).map((c) => c.player_id);
  const { data: playedNow = {} } = useQuery({
    queryKey: ["match-played-now", id, legacyIds.join(",")],
    enabled: legacyIds.length > 0,
    queryFn: async () => {
      const f = match.format === "doubles" ? "doubles" : "singles";
      const { items = [] } = await api.entities.Player.filter({ id: { $in: legacyIds } }, { limit: 10 });
      return Object.fromEntries(items.map((p) => [p.id, (Number(p[`${f}_wins`]) || 0) + (Number(p[`${f}_losses`]) || 0)]));
    },
  });
  useEffect(() => {
    if (!isLoading && !match) {
      let e = document.createElement("meta");
      return (
        (e.name = "prerender-status-code"),
        (e.content = "404"),
        document.head.appendChild(e),
        () => e.remove()
      );
    }
  }, [isLoading, match]);
  let respond = async (t) => {
    (setBusy(t), setError(""));
    try {
      let n = await api.functions.invoke("respondMatch", {
        match_id: id,
        decision: t,
      });
      if (n.data?.error) throw Error(n.data.error);
      await refetch();
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Could not save your response.");
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
  if (!match)
    return (
      <>
        <BackButton fallback="/matches" />
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <EmptyState title="Match not found" body="This result may have been removed." />
        </div>
      </>
    );
  let participants = match.all_user_ids || [],
    accepted = match.accepted_user_ids || [],
    isParticipant = user ? participants.includes(user.id) : false,
    hasAccepted = user ? accepted.includes(user.id) : false,
    waitingOn = participants.filter((e) => !accepted.includes(e)),
    sideEntries = [...(match.side_a || []), ...(match.side_b || [])],
    tiersAfter =
      match.status === "verified"
        ? Object.fromEntries(
            (match.rating_changes || []).map((c) => [
              c.player_id,
              {
                tier: c.tier_after || tierFor(c.after).key,
                // Matches before this field existed: use the player's current count in this format.
                played: c.matches_played ?? playedNow[c.player_id],
              },
            ]),
          )
        : {},
    promoChips = tierChips(match),
    nameFor = (e) => {
      let t = sideEntries.find((t) => t.user_id === e);
      return t?.display_name || t?.username || "A player";
    };
  return (
    <>
      <BackButton fallback="/matches" />
      <PageHeader
        eyebrow={`${match.format === "doubles" ? "Doubles" : "Singles"} · to ${match.target}${match.ranked === false ? " · Unranked" : ""}`}
        title="Match result"
        description={`Submitted by ${match.submitted_by_name || "a player"} · ${formatShortDate(match.created_date)}`}
        action={<StatusBadge status={match.status} />}
      />
      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
        <div className="grid grid-cols-2 gap-2">
          <SideCard
            side={match.side_a}
            gamesWon={match.games_a}
            winner={match.winner_side === "a"}
            label="Side A"
            tiers={tiersAfter}
          />
          <SideCard
            side={match.side_b}
            gamesWon={match.games_b}
            winner={match.winner_side === "b"}
            label="Side B"
            tiers={tiersAfter}
          />
        </div>
        {promoChips.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Tier changes" data-testid="tier-chips">
            {promoChips.map((c) => (
              <li
                key={c.id}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-heading text-xs font-semibold ${c.kind === "promotion" ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
              >
                <span>{c.kind === "promotion" ? "▲" : "▼"}</span>
                <span>{`${c.name}: ${c.label}`}</span>
                <TierBadge tier={c.tier} />
              </li>
            ))}
          </ul>
        )}
        <section>
          <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Games
          </h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">
            {(match.games || []).map((e, t) => {
              let n = Number(e.a) > Number(e.b);
              return (
                <li className="flex items-center justify-between px-3 py-2.5" key={t}>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    {"Game "}
                    {t + 1}
                  </span>
                  <span className="font-mono text-sm tabular-nums">
                    <span className={n ? "font-semibold" : "text-muted-foreground"}>{e.a}</span>
                    <span className="mx-1.5 text-muted-foreground">–</span>
                    <span className={n ? "text-muted-foreground" : "font-semibold"}>{e.b}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Sign-off
          </h2>
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">
            {participants.map((e) => {
              let t = accepted.includes(e);
              return (
                <li className="flex items-center gap-2 px-3 py-2.5" key={e}>
                  {t ? (
                    <Check className="h-4 w-4 text-success" aria-hidden="true" />
                  ) : (
                    <span
                      className="h-4 w-4 rounded-full border border-border"
                      aria-hidden="true"
                    />
                  )}
                  <span className="flex-1 truncate font-heading text-sm">{nameFor(e)}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {t ? "Confirmed" : match.status === "pending" ? "Waiting" : "No"}
                  </span>
                </li>
              );
            })}
          </ul>
          {match.status === "pending" && (
            <p className="mt-2 text-xs text-muted-foreground">
              {waitingOn.length > 0
                ? `Waiting on ${waitingOn.length} ${waitingOn.length === 1 ? "player" : "players"} before this counts.`
                : "All players have confirmed."}
            </p>
          )}
          {match.note && (
            <p className="mt-2 rounded-sm border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              {"Note: "}
              {match.note}
            </p>
          )}
        </section>
        {match.status === "pending" && isParticipant && !hasAccepted && (
          <section className="space-y-2">
            <p className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
              Your call
            </p>
            <Button
              onClick={() => respond("accept")}
              disabled={!!busy}
              size="lg"
              className="h-12 w-full rounded-sm"
            >
              {busy === "accept" ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Confirm result
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={() => respond("dispute")}
                disabled={!!busy}
                variant="outline"
                className="h-11 rounded-sm"
              >
                <TriangleAlert className="mr-2 h-4 w-4" aria-hidden="true" />
                Dispute
              </Button>
              <Button
                onClick={() => respond("decline")}
                disabled={!!busy}
                variant="outline"
                className="h-11 rounded-sm text-destructive"
              >
                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                Decline
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Disputed and declined matches never change ratings, levels or records.
            </p>
          </section>
        )}
        {match.status === "pending" && user && match.submitted_by_user_id === user.id && (
          <section>
            <Button
              onClick={() => respond("cancel")}
              disabled={!!busy}
              variant="outline"
              className="h-10 w-full rounded-sm"
            >
              {busy === "cancel" && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Cancel this result
            </Button>
          </section>
        )}
        {error && (
          <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <DiscussSection match={match} isParticipant={isParticipant} />
        {match.status === "verified" && (match.rating_changes || []).length > 0 && (
          <section>
            <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
              {match.ranked === false ? "XP earned · unranked, ratings unchanged" : "Rating change"}
            </h2>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">
              {match.rating_changes.map((e) => (
                <li className="px-3 py-2.5" key={e.player_id}>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 truncate font-heading text-sm">{e.name}</span>
                    {!e.unranked && (<>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {e.before}
                      {" → "}
                      {e.after}
                    </span>
                    <span
                      className={`w-12 text-right font-mono text-xs tabular-nums ${e.delta >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {e.delta >= 0 ? "+" : "−"}
                      {Math.abs(e.delta)}
                    </span>
                    </>)}
                  </div>
                  {(e.bounties || []).map((b) => (
                    <p key={b.from} className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-brand" data-testid="bounty-claimed">
                      {`Bounty claimed on ${b.name}${(b.parts || []).length ? ` (${b.parts.map((k) => ({ podium: "top 3", streak: "streak", riser: "riser" })[k] || k).join(" + ")})` : ""}: +${b.rating} rating · +${b.xp} xp`}
                    </p>
                  ))}
                  {e.bounty_paid > 0 && (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-destructive">{`Bounty paid: −${e.bounty_paid} rating`}</p>
                  )}
                  {(e.games || []).length > 0 ? <GameLines change={e} /> : e.mov != null && <FactorLines change={e} />}
                  {(e.xp_parts || []).length > 0 && (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-brand">
                      {e.xp_parts.map((x) => `+${x.xp} ${x.label}`).join(" · ")}
                      {` = +${e.xp_gained} xp`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

/** Per-game rating: every game is its own rating event. One compact line, expandable into each game's factors. */
function GameLines({ change }) {
  const games = describeGames(change);
  return (
    <details className="group mt-1">
      <summary className="flex min-h-10 cursor-pointer list-none items-start gap-1 font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          {games.map((g, i) => (
            <span key={g.key} className="whitespace-nowrap">
              {i > 0 && <span className="mx-1">·</span>}
              {`${g.label} ${g.score} `}
              <span className={g.delta >= 0 ? "text-success" : "text-destructive"}>{`${g.delta >= 0 ? "+" : "−"}${Math.abs(g.delta)}`}</span>
            </span>
          ))}
        </span>
        <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-brand transition-transform group-open:rotate-180" aria-label="Show each game" />
      </summary>
      <ol className="mt-1 space-y-2 border-l-2 border-border pl-3">
        {games.map((g) => (
          <li key={g.key}>
            <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] text-foreground">
              <span>{`Game ${g.key} · ${g.score} · ${g.won ? "won" : "lost"}`}</span>
              <span className="tabular-nums text-muted-foreground">
                {`${g.change.before} → ${g.change.after}`}
                <span className={`ml-2 ${g.delta >= 0 ? "text-success" : "text-destructive"}`}>{`${g.delta >= 0 ? "+" : "−"}${Math.abs(g.delta)}`}</span>
              </span>
            </div>
            <FactorLines change={g.change} compactOnly />
          </li>
        ))}
        <p className="font-mono text-[10px] text-muted-foreground">
          {games[0]?.change?.rd_before != null
            ? "each game: step size (from both confidences) × (result − expected) × the factors above, rounded, at most 40 a game; the match total never exceeds 80; every game firms your confidence up"
            : "each game: ½ × K × (result − expected) × the factors above, rounded, at most 40 a game; the match total never exceeds 80"}
        </p>
      </ol>
    </details>
  );
}

function FactorLines({ change, compactOnly = false }) {
  const { compact, detail } = describeChange(change);
  return (
    <>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] leading-relaxed text-muted-foreground">
        {compact.join(" · ")}
      </p>
      {!compactOnly && detail.length > 2 && (
        <details className="mt-1 group">
          <summary className="inline-flex min-h-10 cursor-pointer items-center font-mono text-[10px] uppercase tracking-[0.08em] text-brand">
            How this was calculated
          </summary>
          <dl className="mt-1 space-y-1.5 border-l-2 border-border pl-3">
            {detail.map((d) => (
              <div key={d.label}>
                <dt className="flex justify-between gap-3 font-mono text-[11px] text-foreground">
                  <span>{d.label}</span>
                  <span className="tabular-nums">{d.value}</span>
                </dt>
                <dd className="text-[11px] leading-snug text-muted-foreground">{d.note}</dd>
              </div>
            ))}
            <p className="font-mono text-[10px] text-muted-foreground">
              {change.rd_before != null
                ? "change = step size (from both confidences) × (result − expected) × the factors above, rounded, never more than 80"
                : "change = K × (result − expected) × the factors above, rounded, never more than 80"}
            </p>
          </dl>
        </details>
      )}
    </>
  );
}
