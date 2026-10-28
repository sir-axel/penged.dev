import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useMyPlayer } from "@/hooks/useMyPlayer";
import { PageHeader } from "@/components/PageHeader";
import { timeLeft } from "@/lib/ladder";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { api } from "@/api/client";

export function Challenges() {
  let { user } = useAuth(),
    { player, isLoading: playerLoading } = useMyPlayer(),
    queryClient = useQueryClient(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [selectedId, setSelectedId] = useState(""),
    [message, setMessage] = useState(""),
    { data: challenges = [] } = useQuery({
      queryKey: ["challenges", user?.id],
      enabled: !!user?.id,
      queryFn: async () =>
        (
          await api.entities.Challenge.list({
            limit: 100,
          })
        ).items || [],
    }),
    myRank = Number(player?.singles_rank) || 0,
    { data: targets = [], isLoading: targetsLoading } = useQuery({
      queryKey: ["challenge-targets", myRank],
      enabled: myRank > 1,
      queryFn: async () =>
        (
          await api.entities.Player.filter(
            {
              singles_rank: {
                $gte: Math.max(1, myRank - 3),
                $lte: myRank - 1,
              },
            },
            {
              sort: "singles_rank",
              limit: 5,
            },
          )
        ).items || [],
    });
  useEffect(() => {
    user?.id &&
      api.functions
        .invoke("syncLadder", {})
        .then(() => {
          (queryClient.invalidateQueries({
            queryKey: ["challenges"],
          }),
            queryClient.invalidateQueries({
              queryKey: ["players"],
            }),
            queryClient.invalidateQueries({
              queryKey: ["my-player"],
            }));
        })
        .catch(() => {});
  }, [user?.id, queryClient]);
  let refresh = () => {
      (queryClient.invalidateQueries({
        queryKey: ["challenges"],
      }),
        queryClient.invalidateQueries({
          queryKey: ["players"],
        }));
    },
    act = async (e, t, n) => {
      (setBusy(n), setError(""));
      try {
        let n = await api.functions.invoke(e, t);
        if (n.data?.error) throw Error(n.data.error);
        return (refresh(), true);
      } catch (e) {
        return (setError(e.response?.data?.error || e.message || "Something went wrong."), false);
      } finally {
        setBusy("");
      }
    },
    incoming = challenges.filter((t) => t.defender_user_id === user?.id && t.status === "open"),
    outgoing = challenges.filter(
      (t) => t.challenger_user_id === user?.id && ["open", "accepted"].includes(t.status),
    ),
    recent = challenges.filter((e) => !incoming.includes(e) && !outgoing.includes(e)).slice(0, 8);
  return (
    <>
      <PageHeader
        eyebrow="Rank duels"
        title="Challenges"
        description="Challenge up to three places above you. The window is 72 hours, and a forfeit is only awarded after review."
      />
      <div className="mx-auto max-w-2xl space-y-7 px-4 py-6 sm:px-6">
        {error && (
          <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <section>
          <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Incoming
          </h2>
          {incoming.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No open challenges against you.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {incoming.map((e) => (
                <li className="rounded-sm border border-border bg-card p-3" key={e.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-heading text-sm font-semibold">
                        {e.challenger_name}
                        {" (#"}
                        {e.challenger_rank})
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {timeLeft(e.expires_at)}
                      </p>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                  {e.message && (
                    <p className="mt-2 rounded-sm bg-secondary/60 px-2.5 py-1.5 text-xs">
                      “{e.message}”
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      onClick={() =>
                        act(
                          "respondChallenge",
                          {
                            challenge_id: e.id,
                            decision: "accept",
                          },
                          `accept-${e.id}`,
                        )
                      }
                      disabled={!!busy}
                      className="h-11 rounded-sm"
                    >
                      {busy === `accept-${e.id}` && (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                      )}
                      Accept
                    </Button>
                    <Button
                      onClick={() =>
                        act(
                          "respondChallenge",
                          {
                            challenge_id: e.id,
                            decision: "decline",
                          },
                          `decline-${e.id}`,
                        )
                      }
                      disabled={!!busy}
                      variant="outline"
                      className="h-11 rounded-sm"
                    >
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Yours in progress
          </h2>
          {outgoing.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">You have no open challenges.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {outgoing.map((e) => (
                <li className="rounded-sm border border-border bg-card p-3" key={e.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-heading text-sm font-semibold">
                        {"vs "}
                        {e.defender_name}
                        {" (#"}
                        {e.defender_rank})
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.status === "open"
                          ? timeLeft(e.expires_at)
                          : "Accepted — record the match when you play it"}
                      </p>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
            Challenge upward
          </h2>
          {playerLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">Loading the ladder…</p>
          ) : myRank <= 1 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              You are top of the ladder — there is nobody above you to challenge.
            </p>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {(targets.length ? targets : []).map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(e.id)}
                      className={`flex min-h-[54px] w-full items-center gap-3 rounded-sm border px-3 py-2 text-left transition-colors ${selectedId === e.id ? "border-foreground bg-secondary" : "border-border bg-card hover:border-foreground/40"}`}
                    >
                      <span className="w-6 font-mono text-xs text-muted-foreground">
                        {e.singles_rank}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-heading text-sm font-semibold">
                          {e.display_name || e.username}
                        </span>
                        <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                          {e.singles_rating}
                          {" rating"}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] uppercase text-brand">
                        {selectedId === e.id ? "selected" : "challenge"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {targets.length === 0 && !targetsLoading && (
                <p className="mt-2 text-sm text-muted-foreground">
                  There is nobody directly above you to challenge right now.
                </p>
              )}
              <div className="mt-3 space-y-2">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  maxLength={200}
                  placeholder="Add a note (optional) — e.g. 'Court at 4pm?'"
                  className="w-full rounded-sm border border-input bg-card px-3 py-2 text-base outline-none focus:border-foreground/40 sm:text-sm"
                />
                <Button
                  onClick={async () => {
                    (await act(
                      "createChallenge",
                      {
                        defender_player_id: selectedId,
                        message: message,
                      },
                      "create",
                    )) && (setSelectedId(""), setMessage(""));
                  }}
                  disabled={!selectedId || !!busy}
                  className="h-12 w-full rounded-sm"
                >
                  {busy === "create" && (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  )}
                  Send challenge
                </Button>
              </div>
            </>
          )}
        </section>
        {recent.length > 0 && (
          <section>
            <h2 className="font-display text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground">
              Recent
            </h2>
            <ul className="mt-2 divide-y divide-border overflow-hidden rounded-sm border border-border bg-card">
              {recent.map((t) => {
                let n = t.challenger_user_id === user?.id;
                return (
                  <li className="space-y-2 px-3 py-2.5" key={t.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-heading text-sm">
                        {n ? `You → ${t.defender_name}` : `${t.challenger_name} → You`}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>
                    {t.status === "expired" && n && !t.review_requested && !t.responded_at && (
                      <Button
                        onClick={() =>
                          act(
                            "resolveChallenge",
                            {
                              challenge_id: t.id,
                              action: "request",
                            },
                            `review-${t.id}`,
                          )
                        }
                        variant="outline"
                        className="h-9 w-full rounded-sm text-xs"
                        disabled={!!busy}
                      >
                        Request a review
                      </Button>
                    )}
                    {t.status === "expired" && n && t.review_requested && (
                      <p className="text-xs text-warning">
                        Review requested — an admin will decide.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        <EmptyState
          title="How challenges move rank"
          body="Beating someone above you takes their place. Silence never does: an unanswered challenge is only resolved after an admin review."
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
