import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { formatShortDate } from "@/lib/ladder";
import { Button } from "@/components/ui/button";
import { api } from "@/api/client";

export function AdminReviews() {
  let { user } = useAuth(),
    queryClient = useQueryClient(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    { data: queue = [] } = useQuery({
      queryKey: ["review-queue"],
      enabled: user?.role === "admin",
      queryFn: async () =>
        (
          await api.entities.Challenge.filter(
            {
              status: "expired",
            },
            {
              sort: "-created_date",
              limit: 100,
            },
          )
        ).items || [],
    }),
    resolve = async (e, n) => {
      (setBusy(`${n}-${e.id}`), setError(""));
      try {
        let r = await api.functions.invoke("resolveChallenge", {
          challenge_id: e.id,
          action: n,
        });
        if (r.data?.error) throw Error(r.data.error);
        (queryClient.invalidateQueries({
          queryKey: ["review-queue"],
        }),
          queryClient.invalidateQueries({
            queryKey: ["players"],
          }));
      } catch (e) {
        setError(e.response?.data?.error || e.message || "Could not resolve that review.");
      } finally {
        setBusy("");
      }
    };
  return user?.role === "admin" ? (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Forfeit review"
        description="Challenges that ran out of time. A forfeit moves the ladder position only — ratings never change without a played match."
      />
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6">
        {error && (
          <p className="rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {queue.length === 0 ? (
          <EmptyState
            title="Nothing to review"
            body="No challenge windows have closed without a response."
          />
        ) : (
          <ul className="space-y-2">
            {queue.map((e) => (
              <li className="rounded-sm border border-border bg-card p-3" key={e.id}>
                <p className="font-heading text-sm font-semibold">
                  {e.challenger_name}
                  {" (#"}
                  {e.challenger_rank}) → {e.defender_name}
                  {" (#"}
                  {e.defender_rank})
                </p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                  {"sent "}
                  {formatShortDate(e.created_date)}
                  {" ·"} {e.review_requested ? "review requested" : "no response"}
                </p>
                {e.message && <p className="mt-2 text-xs text-muted-foreground">“{e.message}”</p>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => resolve(e, "forfeit")}
                    disabled={!!busy}
                    className="h-11 rounded-sm"
                  >
                    {busy === `forfeit-${e.id}` && (
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    )}
                    Award position
                  </Button>
                  <Button
                    onClick={() => resolve(e, "dismiss")}
                    disabled={!!busy}
                    variant="outline"
                    className="h-11 rounded-sm"
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  ) : (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <EmptyState
        title="Admins only"
        body="The forfeit review queue is limited to ladder admins."
      />
    </div>
  );
}
