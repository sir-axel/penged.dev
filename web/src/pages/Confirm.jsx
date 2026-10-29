import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ResultRow } from "@/components/ResultRow";
import { Button } from "@/components/ui/button";
import { DeclineButton } from "@/pages/Challenges";
import { StakesLine } from "@/components/match/StakesLine";
import { timeLeft } from "@/lib/ladder";
import { timeAgo } from "@/lib/timeAgo";
import { api } from "@/api/client";

const H2 = ({ children, n }) => (
  <h2 className="flex items-center gap-2 font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
    {children}
    {n > 0 && <span className="font-mono text-[10px] tracking-normal text-foreground">{n}</span>}
  </h2>
);

function MatchSummary({ match, children }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {match.format === "doubles" ? "Doubles" : "Singles"}
          {" · to "}
          {match.target}
          <span className="block normal-case tracking-normal">
            {"Submitted by "}
            {match.submitted_by_name || "a player"}
            {" · "}
            {timeAgo(match.created_date)}
            {" · "}
            {timeLeft(match.expires_at).replace("Window closed", "expired")}
          </span>
        </div>
        <Link
          to={`/matches/${match.id}`}
          className="-mr-1 inline-flex min-h-[44px] shrink-0 items-center gap-0.5 px-1 text-xs font-medium text-brand hover:underline"
        >
          Full match
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-1 space-y-1">
        <ResultRow players={match.side_a || []} games={match.games_a} won={match.winner_side === "a"} />
        <ResultRow players={match.side_b || []} games={match.games_b} won={match.winner_side === "b"} />
      </div>
      {(match.games || []).length > 0 && (
        <p className="mt-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
          {match.games.map((g) => `${g.a}–${g.b}`).join("  ·  ")}
        </p>
      )}
      {children}
    </>
  );
}

function ConfirmCard({ match, busy, onRespond }) {
  // Decline / Dispute never change ratings but cannot be undone, so they take one extra tap here.
  const [pending, setPending] = useState(null);
  const mine = busy.startsWith(match.id);
  return (
    <li className="rounded-sm border border-border bg-card p-3" data-testid="confirm-card">
      <MatchSummary match={match}>
        {match.note && <p className="mt-2 rounded-sm bg-secondary/60 px-2.5 py-1.5 text-xs">Note: {match.note}</p>}
        <StakesLine request={{ match_id: match.id }} showResult className="mt-2" />
        {pending ? (
          <div className="mt-3 space-y-2 rounded-sm border border-destructive/30 bg-destructive/5 p-2.5">
            <p className="text-sm">
              {pending === "decline" ? "Decline this result?" : "Dispute this result?"}
              <span className="block text-xs text-muted-foreground">It will not count and cannot be undone.</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 rounded-sm" onClick={() => setPending(null)} disabled={mine}>
                Keep it
              </Button>
              <Button
                className="h-11 rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onRespond(match.id, pending)}
                disabled={!!busy}
              >
                {mine && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {pending === "decline" ? "Yes, decline" : "Yes, dispute"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <Button onClick={() => onRespond(match.id, "accept")} disabled={!!busy} className="h-12 w-full rounded-sm">
              {busy === `${match.id}:accept` ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Confirm
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11 rounded-sm" disabled={!!busy} onClick={() => setPending("dispute")}>
                <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Dispute
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-sm text-destructive"
                disabled={!!busy}
                onClick={() => setPending("decline")}
              >
                <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Decline
              </Button>
            </div>
          </div>
        )}
      </MatchSummary>
    </li>
  );
}

export function Confirm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["queue", user?.id],
    enabled: !!user?.id,
    refetchOnMount: "always",
    queryFn: async () => {
      const [m, c] = await Promise.all([
        api.entities.Match.filter({ all_user_ids: user.id, status: "pending" }, { sort: "-created_date", limit: 100 }),
        api.entities.Challenge.filter({ defender_user_id: user.id, status: "open" }, { sort: "-created_date", limit: 50 }),
      ]);
      return { matches: m.items || [], challenges: c.items || [] };
    },
  });

  const now = Date.now();
  const live = (data?.matches || []).filter((m) => !m.expires_at || new Date(m.expires_at).getTime() > now);
  const toConfirm = live.filter((m) => !(m.accepted_user_ids || []).includes(user?.id));
  const waiting = live.filter((m) => (m.accepted_user_ids || []).includes(user?.id));
  const challenges = (data?.challenges || []).filter((c) => !c.expires_at || new Date(c.expires_at).getTime() > now);
  const empty = toConfirm.length === 0 && challenges.length === 0;

  // Whatever changed can show up on the ladder, home, feed and badges: refresh everything cheap.
  const refresh = () => queryClient.invalidateQueries();

  const act = async (key, name, payload) => {
    setBusy(key);
    setError("");
    try {
      const r = await api.functions.invoke(name, payload);
      if (r.data?.error) throw Error(r.data.error);
      await refresh();
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Something went wrong.");
      refresh();
    } finally {
      setBusy("");
    }
  };
  const respondMatch = (id, decision) => act(`${id}:${decision}`, "respondMatch", { match_id: id, decision });

  return (
    <>
      <PageHeader
        eyebrow="Review queue"
        title="To confirm"
        description="Results other players submitted that need your sign-off, and challenges waiting on your answer."
      />
      <div className="mx-auto max-w-2xl space-y-7 px-4 py-6 sm:px-6">
        {error && (
          <p role="alert" className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : isError ? (
          <EmptyState title="Could not load your queue" body="Check your connection and try again." />
        ) : (
          <>
            {empty && <EmptyState title="You're all caught up." body="Nothing is waiting on you right now." />}
            {toConfirm.length > 0 && (
              <section>
                <H2 n={toConfirm.length}>Results to confirm</H2>
                <ul className="mt-2 space-y-3">
                  {toConfirm.map((m) => (
                    <ConfirmCard key={m.id} match={m} busy={busy} onRespond={respondMatch} />
                  ))}
                </ul>
              </section>
            )}
            {challenges.length > 0 && (
              <section>
                <H2 n={challenges.length}>Challenges for you</H2>
                <ul className="mt-2 space-y-3">
                  {challenges.map((c) => (
                    <li className="rounded-sm border border-border bg-card p-3" key={c.id} data-testid="challenge-card">
                      <p className="font-heading text-sm font-semibold">
                        {c.challenger_name}
                        {" (#"}
                        {c.challenger_rank})
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{timeLeft(c.expires_at)}</p>
                      {c.message && <p className="mt-2 rounded-sm bg-secondary/60 px-2.5 py-1.5 text-xs">“{c.message}”</p>}
                      <StakesLine request={{ challenge_id: c.id }} className="mt-2" />
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Button
                          className="h-11 rounded-sm"
                          disabled={!!busy}
                          onClick={() => act(`ch:${c.id}`, "respondChallenge", { challenge_id: c.id, decision: "accept" })}
                        >
                          {busy === `ch:${c.id}` && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                          Accept
                        </Button>
                        <DeclineButton
                          challenge={c}
                          busy={!!busy}
                          onDecline={() => act(`ch:${c.id}`, "respondChallenge", { challenge_id: c.id, decision: "decline" })}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {waiting.length > 0 && (
              <section>
                <H2 n={waiting.length}>Waiting on others</H2>
                <ul className="mt-2 space-y-3">
                  {waiting.map((m) => {
                    const missing = (m.all_user_ids || []).filter((u) => !(m.accepted_user_ids || []).includes(u));
                    const names = [...(m.side_a || []), ...(m.side_b || [])]
                      .filter((p) => missing.includes(p.user_id))
                      .map((p) => p.display_name || p.username);
                    return (
                      <li className="rounded-sm border border-border bg-card p-3" key={m.id} data-testid="waiting-card">
                        <MatchSummary match={m}>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {"Waiting on "}
                            {names.join(", ") || "other players"}
                          </p>
                          {m.submitted_by_user_id === user?.id && (
                            <Button
                              variant="outline"
                              className="mt-2 h-10 w-full rounded-sm"
                              disabled={!!busy}
                              onClick={() =>
                                window.confirm("Cancel this result? It will not count.") && respondMatch(m.id, "cancel")
                              }
                            >
                              {busy === `${m.id}:cancel` && (
                                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                              )}
                              Cancel this result
                            </Button>
                          )}
                        </MatchSummary>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
