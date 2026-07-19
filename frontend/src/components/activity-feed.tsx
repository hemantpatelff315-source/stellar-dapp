"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { streamEvents } from "@/lib/events";
import { isConfigured } from "@/lib/config";
import { campaignKeys } from "@/hooks/use-campaigns";
import type { ContractEvent } from "@/types";

const LABELS: Record<ContractEvent["type"], string> = {
  CampaignCreated: "New campaign created",
  DonationReceived: "Donation received",
  GoalReached: "Goal reached 🎉",
  FundsWithdrawn: "Funds withdrawn",
  RefundIssued: "Refund issued",
  CampaignClosed: "Campaign closed",
};

const MAX_ITEMS = 12;

export function ActivityFeed() {
  const qc = useQueryClient();
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (!isConfigured()) return;
    const handle = streamEvents((ev) => {
      const key = `${ev.ledger}:${ev.type}:${ev.campaignId}:${ev.txHash ?? ""}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      setEvents((prev) => [ev, ...prev].slice(0, MAX_ITEMS));
      qc.invalidateQueries({ queryKey: campaignKeys.all });
      qc.invalidateQueries({ queryKey: campaignKeys.detail(ev.campaignId) });
    });
    return () => handle.stop();
  }, [qc]);

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        <Activity className="mx-auto mb-2 h-5 w-5" />
        Waiting for live on-chain activity…
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {events.map((ev, i) => (
        <li
          key={`${ev.ledger}-${ev.type}-${i}`}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5 text-sm"
        >
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            {LABELS[ev.type]}
          </span>
          <span className="text-muted-foreground">
            Campaign #{ev.campaignId}
          </span>
        </li>
      ))}
    </ul>
  );
}
