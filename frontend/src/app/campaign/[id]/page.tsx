"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Users, Clock } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { DonateDialog } from "@/components/donate-dialog";
import {
  useCampaign,
  useDonations,
  useWithdraw,
  useRefund,
  useCloseCampaign,
} from "@/hooks/use-campaigns";
import { useWallet } from "@/providers/wallet-provider";
import {
  formatXlm,
  fundingProgress,
  timeRemaining,
  isExpired,
  truncateAddress,
} from "@/lib/utils";
import { CampaignStatus } from "@/types";
import { toast } from "@/hooks/use-toast";
import { explorerTxUrl } from "@/lib/config";

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const campaignId = Number(id);
  const { data: campaign, isLoading, isError } = useCampaign(campaignId);
  const { data: donations } = useDonations(campaignId);

  if (isLoading) {
    return (
      <div className="container flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="container py-20 text-center">
        <p className="text-muted-foreground">Campaign not found.</p>
        <Button asChild variant="link" className="mt-2">
          <Link href="/">Back to campaigns</Link>
        </Button>
      </div>
    );
  }

  const pct = fundingProgress(campaign.raised, campaign.goal);
  const ended =
    campaign.status !== CampaignStatus.Active || isExpired(campaign.deadline);

  return (
    <div className="container max-w-4xl space-y-6 py-10">
      <Button asChild variant="ghost" size="sm" className="gap-2">
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          All campaigns
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {campaign.title}
            </h1>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="whitespace-pre-wrap text-muted-foreground">
            {campaign.description}
          </p>

          <Card>
            <CardHeader className="pb-2 text-sm font-semibold">
              Recent backers
            </CardHeader>
            <CardContent>
              {donations && donations.length > 0 ? (
                <ul className="divide-y divide-border">
                  {donations.slice(0, 10).map((d, i) => (
                    <li
                      key={`${d.donor}-${i}`}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="font-mono">
                        {truncateAddress(d.donor)}
                      </span>
                      <span className="font-medium">{formatXlm(d.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No donations yet — be the first to back this project.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <ProgressBar value={pct} />
              <div>
                <p className="text-2xl font-bold">
                  {formatXlm(campaign.raised)}
                </p>
                <p className="text-sm text-muted-foreground">
                  raised of {formatXlm(campaign.goal)} · {pct.toFixed(0)}%
                </p>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {campaign.donorsCount} backers
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  {ended ? "Ended" : timeRemaining(campaign.deadline)}
                </span>
              </div>

              {campaign.status === CampaignStatus.Active &&
                !isExpired(campaign.deadline) && (
                  <DonateDialog
                    campaignId={campaign.id}
                    title={campaign.title}
                  />
                )}

              <CreatorActions
                campaignId={campaign.id}
                creator={campaign.creator}
                status={campaign.status}
                expired={isExpired(campaign.deadline)}
              />
              <RefundAction
                campaignId={campaign.id}
                status={campaign.status}
                expired={isExpired(campaign.deadline)}
              />
            </CardContent>
          </Card>

          <p className="px-1 text-xs text-muted-foreground">
            Created by{" "}
            <span className="font-mono">
              {truncateAddress(campaign.creator)}
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}

function CreatorActions({
  campaignId,
  creator,
  status,
  expired,
}: {
  campaignId: number;
  creator: string;
  status: CampaignStatus;
  expired: boolean;
}) {
  const { address } = useWallet();
  const withdraw = useWithdraw(campaignId);
  const close = useCloseCampaign(campaignId);

  if (!address || address !== creator) return null;

  const canWithdraw =
    status === CampaignStatus.Successful ||
    (status === CampaignStatus.Active && expired);
  const canClose = status === CampaignStatus.Active && !expired;

  async function run(
    action: () => Promise<string>,
    okTitle: string,
  ) {
    try {
      const hash = await action();
      toast({ variant: "success", title: okTitle });
      window.open(explorerTxUrl(hash), "_blank", "noopener");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (!canWithdraw && !canClose) return null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      {canWithdraw && (
        <Button
          variant="secondary"
          className="w-full gap-2"
          disabled={withdraw.isPending}
          onClick={() =>
            run(() => withdraw.mutateAsync(creator), "Funds withdrawn")
          }
        >
          {withdraw.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Withdraw raised funds
        </Button>
      )}
      {canClose && (
        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={close.isPending}
          onClick={() =>
            run(() => close.mutateAsync(creator), "Campaign closed")
          }
        >
          {close.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Close campaign early
        </Button>
      )}
    </div>
  );
}

function RefundAction({
  campaignId,
  status,
  expired,
}: {
  campaignId: number;
  status: CampaignStatus;
  expired: boolean;
}) {
  const { address, connect } = useWallet();
  const refund = useRefund(campaignId);

  const refundable =
    status === CampaignStatus.Failed ||
    (status === CampaignStatus.Active && expired);
  if (!refundable) return null;

  async function onRefund() {
    if (!address) {
      try {
        await connect();
      } catch {
        return;
      }
      return;
    }
    try {
      const hash = await refund.mutateAsync(address);
      toast({ variant: "success", title: "Refund claimed" });
      window.open(explorerTxUrl(hash), "_blank", "noopener");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Refund failed",
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="border-t border-border pt-4">
      <Button
        variant="outline"
        className="w-full gap-2"
        disabled={refund.isPending}
        onClick={onRefund}
      >
        {refund.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Claim refund
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        This campaign did not reach its goal. Backers can reclaim their full
        contribution.
      </p>
    </div>
  );
}
