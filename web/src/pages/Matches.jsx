import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { MatchRow } from "@/components/MatchRow";
import { api } from "@/api/client";

export function Matches() {
  let { user, isAuthenticated: isAuthenticated } = useAuth(),
    [scope, setScope] = useState("all"),
    { data: matchData, isLoading } = useQuery({
      queryKey: ["matches", scope, user?.id],
      queryFn: async () =>
        scope === "mine" && user?.id
          ? (
              await api.entities.Match.filter(
                {
                  all_user_ids: user.id,
                },
                {
                  sort: "-created_date",
                  limit: 40,
                },
              )
            ).items || []
          : (
              await api.entities.Match.list({
                sort: "-created_date",
                limit: 40,
              })
            ).items || [],
    }),
    matches = matchData || [];
  return (
    <>
      <PageHeader
        eyebrow="Match log"
        title="Matches"
        description="Every submitted result, with its sign-off status."
        action={
          <Link
            to="/matches/new"
            className="inline-flex min-h-[44px] items-center justify-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Record a match
          </Link>
        }
      />
      {isAuthenticated && (
        <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
          <div className="flex gap-1">
            {[
              {
                key: "all",
                label: "All",
              },
              {
                key: "mine",
                label: "Mine",
              },
            ].map((e) => (
              <button
                onClick={() => setScope(e.key)}
                className={`min-h-[38px] rounded-sm px-4 font-heading text-sm font-medium transition-colors ${scope === e.key ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
                key={e.key}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : matches.length === 0 ? (
          <EmptyState
            title="No matches here yet"
            body="Record a result and it will show up here until everyone signs off."
            action={
              <Link
                to="/matches/new"
                className="rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
              >
                Record a match
              </Link>
            }
          />
        ) : (
          <ul className="overflow-hidden rounded-sm border border-border bg-card">
            {matches.map((e) => (
              <MatchRow match={e} key={e.id} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
