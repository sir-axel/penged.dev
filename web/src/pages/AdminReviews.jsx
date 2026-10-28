import { BackButton } from "@/components/BackButton";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { formatShortDate } from "@/lib/ladder";
import { outcomeText } from "@/pages/Challenges";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CountBadge, useNewFeedbackCount } from "@/hooks/useFeedbackCount";
import { api } from "@/api/client";

export function AdminReviews() {
  let { user } = useAuth(),
    newFeedback = useNewFeedbackCount(),
    queryClient = useQueryClient(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    { data: queue = [] } = useQuery({
      queryKey: ["review-queue"],
      enabled: user?.role === "admin",
      queryFn: async () =>
        (
          await api.entities.Challenge.filter(
            { penalized_at: { $ne: null } },
            { sort: "-penalized_at", limit: 100 },
          )
        ).items || [],
    }),
    reverse = async (e) => {
      (setBusy(e.id), setError(""));
      try {
        let r = await api.functions.invoke("resolveChallenge", {
          challenge_id: e.id,
          action: "reverse",
        });
        if (r.data?.error) throw Error(r.data.error);
        (queryClient.invalidateQueries({ queryKey: ["review-queue"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }));
      } catch (e) {
        setError(e.response?.data?.error || e.message || "Could not reverse that penalty.");
      } finally {
        setBusy("");
      }
    };
  return user?.role === "admin" ? (
    <>
      <BackButton fallback="/profile" />
      <PageHeader
        eyebrow="Admin"
        title="Challenge penalties"
        description="Recent declines and no-shows. Reversing a penalty gives the defender back their rating, and takes the walkover rating and xp from the challenger."
        action={
          <Link
            to="/admin/feedback"
            className="inline-flex min-h-10 items-center gap-2 border border-foreground bg-card px-3 py-1.5 font-display text-[0.55rem] uppercase tracking-[0.12em] hover:bg-secondary"
          >
            Feedback inbox
            <CountBadge n={newFeedback} />
          </Link>
        }
      />
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6">
        {error && (
          <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {queue.length === 0 ? (
          <EmptyState title="No penalties" body="Nobody has ducked a challenge yet." />
        ) : (
          <ul className="space-y-2">
            {queue.map((e) => (
              <li className="rounded-sm border border-border bg-card p-3" key={e.id}>
                <p className="font-heading text-sm font-semibold">
                  {e.challenger_name} → {e.defender_name}
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {formatShortDate(e.penalized_at)}
                  {e.review_requested && !e.reversed ? " · review requested" : ""}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{outcomeText(e, false)}</p>
                {e.message && <p className="mt-2 text-xs text-muted-foreground">“{e.message}”</p>}
                {!e.reversed && (e.penalty_rating > 0 || e.penalty_rank_after !== e.penalty_rank_before) && (
                  <Button
                    onClick={() => reverse(e)}
                    disabled={!!busy}
                    variant="outline"
                    className="mt-3 h-11 w-full rounded-sm"
                  >
                    {busy === e.id && (
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    )}
                    Reverse
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  ) : (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <EmptyState title="Admins only" body="The penalty review list is limited to ladder admins." />
    </div>
  );
}
