"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Rocket, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampaignCard } from "@/components/campaign-card";
import { ActivityFeed } from "@/components/activity-feed";
import { useCampaigns } from "@/hooks/use-campaigns";
import { isConfigured } from "@/lib/config";
import { isExpired } from "@/lib/utils";
import {
  CampaignStatus,
  type Campaign,
  type CampaignFilter,
  type CampaignSort,
} from "@/types";
import { cn } from "@/lib/utils";

const FILTERS: { key: CampaignFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "successful", label: "Funded" },
  { key: "failed", label: "Ended" },
];

const SORTS: { key: CampaignSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "mostFunded", label: "Most funded" },
  { key: "endingSoon", label: "Ending soon" },
];

export default function HomePage() {
  const { data, isLoading, isError } = useCampaigns();
  const [filter, setFilter] = useState<CampaignFilter>("all");
  const [sort, setSort] = useState<CampaignSort>("newest");

  const campaigns = useMemo(
    () => sortAndFilter(data ?? [], filter, sort),
    [data, filter, sort],
  );

  return (
    <div className="container space-y-10 py-10">
      <Hero />

      {!isConfigured() && <NotDeployedNotice />}

      <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={filter === f.key ? "default" : "ghost"}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as CampaignSort)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {isLoading && <GridSkeleton />}
          {isError && (
            <p className="text-sm text-destructive">
              Failed to load campaigns from the network.
            </p>
          )}
          {!isLoading && !isError && campaigns.length === 0 && (
            <EmptyState configured={isConfigured()} />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            {campaigns.map((c) => (
              <CampaignCard key={c.id} campaign={c} />
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Live activity
          </h2>
          <ActivityFeed />
        </aside>
      </section>
    </div>
  );
}

function Hero() {
  return (
    <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-8 sm:p-12">
      <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
        Fund what matters — trustlessly, on Stellar.
      </h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Every contribution is held in an on-chain treasury. Creators withdraw
        only when goals are met; backers are automatically refundable otherwise.
      </p>
      <div className="mt-6 flex gap-3">
        <Button asChild size="lg" className="gap-2">
          <Link href="/create">
            <Rocket className="h-4 w-4" />
            Launch a campaign
          </Link>
        </Button>
      </div>
    </section>
  );
}

function NotDeployedNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <p>
        Contracts are not configured yet. Set the{" "}
        <code className="font-mono">NEXT_PUBLIC_FACTORY_ID</code>,{" "}
        <code className="font-mono">NEXT_PUBLIC_CAMPAIGN_ID</code>, and{" "}
        <code className="font-mono">NEXT_PUBLIC_TREASURY_ID</code> env vars to
        connect to a deployment.
      </p>
    </div>
  );
}

function EmptyState({ configured }: { configured: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center">
      <p className="text-muted-foreground">
        {configured
          ? "No campaigns match this filter yet."
          : "No campaigns to show until contracts are deployed."}
      </p>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-52 animate-pulse rounded-xl border border-border bg-muted/40",
          )}
        />
      ))}
    </div>
  );
}

function sortAndFilter(
  campaigns: Campaign[],
  filter: CampaignFilter,
  sort: CampaignSort,
): Campaign[] {
  const filtered = campaigns.filter((c) => {
    switch (filter) {
      case "active":
        return c.status === CampaignStatus.Active && !isExpired(c.deadline);
      case "successful":
        return (
          c.status === CampaignStatus.Successful ||
          c.status === CampaignStatus.Withdrawn
        );
      case "failed":
        return (
          c.status === CampaignStatus.Failed ||
          c.status === CampaignStatus.Closed ||
          (c.status === CampaignStatus.Active && isExpired(c.deadline))
        );
      default:
        return true;
    }
  });

  return [...filtered].sort((a, b) => {
    switch (sort) {
      case "mostFunded":
        return a.raised > b.raised ? -1 : a.raised < b.raised ? 1 : 0;
      case "endingSoon":
        return a.deadline - b.deadline;
      default:
        return b.createdAt - a.createdAt;
    }
  });
}
