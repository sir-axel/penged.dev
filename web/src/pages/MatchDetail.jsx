import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { formatShortDate } from "@/lib/ladder";
import { StatusBadge } from "@/components/StatusBadge";
import { SideCard } from "@/components/SideCard";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

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
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Match not found"
          body="This result may have been removed."
          action={
            <Link
              to="/matches"
              className="inline-flex min-h-10 items-center rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Back to matches
            </Link>
          }
        />
      </div>
    );
  let participants = match.all_user_ids || [],
    accepted = match.accepted_user_ids || [],
    isParticipant = user ? participants.includes(user.id) : false,
    hasAccepted = user ? accepted.includes(user.id) : false,
    waitingOn = participants.filter((e) => !accepted.includes(e)),
    sideEntries = [...(match.side_a || []), ...(match.side_b || [])],
    nameFor = (e) => {
      let t = sideEntries.find((t) => t.user_id === e);
      return t?.display_name || t?.username || "A player";
    };
  return (
    <>
      <PageHeader
        eyebrow={`${match.format === "doubles" ? "Doubles" : "Singles"} · to ${match.target}`}
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
          />
          <SideCard
            side={match.side_b}
            gamesWon={match.games_b}
            winner={match.winner_side === "b"}
            label="Side B"
          />
        </div>
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
        {match.status === "verified" && (match.rating_changes || []).length > 0 && (
          <section>
            <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
              Rating change
            </h2>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">
              {match.rating_changes.map((e) => (
                <li className="flex items-center gap-2 px-3 py-2.5" key={e.player_id}>
                  <span className="flex-1 truncate font-heading text-sm">{e.name}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {e.before}
                    {" → "}
                    {e.after}
                  </span>
                  <span
                    className={`w-10 text-right font-mono text-xs tabular-nums ${e.delta >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {e.delta >= 0 ? "+" : ""}
                    {e.delta}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
