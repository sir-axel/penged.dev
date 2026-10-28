import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { FeedCard } from "@/components/feed/FeedCard";
import { api } from "@/api/client";

const PAGE = 20;
const TABS = [
  { key: "all", label: "All" },
  { key: "singles", label: "Singles" },
  { key: "doubles", label: "Doubles" },
  { key: "mine", label: "Mine", auth: true },
];

export function Feed() {
  const { user, isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("scope") === "mine" ? "mine" : "all");
  const scope = tab === "mine" && !user?.id ? "all" : tab;
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["feed", scope, user?.id],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const filter = { status: "verified" };
      if (scope === "singles" || scope === "doubles") filter.format = scope;
      if (scope === "mine") filter.all_user_ids = user.id;
      // Ask for one extra row to know whether another page exists.
      const { items } = await api.entities.Match.filter(filter, { sort: "-verified_at", limit: PAGE + 1, skip: pageParam });
      return { items: items.slice(0, PAGE), more: items.length > PAGE, next: pageParam + PAGE };
    },
    getNextPageParam: (last) => (last.more ? last.next : undefined),
  });
  const matches = (data?.pages || []).flatMap((p) => p.items);
  return (
    <>
      <PageHeader
        eyebrow="Match feed"
        title="Latest results"
        description="Every verified result, newest first, with the rating swing and the story of the match."
        action={
          <Link
            to="/matches/new"
            className="inline-flex min-h-[44px] items-center justify-center rounded-sm bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Record a match
          </Link>
        }
      />
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Feed filter">
          {TABS.filter((t) => !t.auth || isAuthenticated).map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={scope === t.key}
              onClick={() => setTab(t.key)}
              className={`min-h-[44px] shrink-0 rounded-sm px-4 font-heading text-sm font-medium transition-colors ${scope === t.key ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground" />
          </div>
        ) : isError ? (
          <EmptyState title="Could not load the feed" body="Check your connection and try again." />
        ) : matches.length === 0 ? (
          <EmptyState
            title="No results here yet"
            body="Record a result and it shows up here once everyone has signed off."
            action={
              <Link to="/matches/new" className="rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                Record a match
              </Link>
            }
          />
        ) : (
          <>
            <ul className="overflow-hidden rounded-sm border border-border bg-card" data-testid="feed-list">
              {matches.map((m) => (
                <FeedCard match={m} key={m.id} />
              ))}
            </ul>
            {hasNextPage && (
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="mt-4 min-h-[44px] w-full rounded-sm border border-border bg-card px-4 font-heading text-sm font-medium hover:border-foreground/40 disabled:opacity-60"
              >
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
