import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import {
  formatXlm,
  fundingProgress,
  timeRemaining,
  isExpired,
} from "@/lib/utils";
import { CampaignStatus, type Campaign } from "@/types";

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const pct = fundingProgress(campaign.raised, campaign.goal);
  const ended =
    campaign.status !== CampaignStatus.Active || isExpired(campaign.deadline);

  return (
    <Link href={`/campaign/${campaign.id}`} className="group block">
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <h3 className="line-clamp-2 font-semibold leading-tight group-hover:text-primary">
            {campaign.title}
          </h3>
          <StatusBadge status={campaign.status} />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {campaign.description}
          </p>
          <div className="space-y-2">
            <ProgressBar value={pct} />
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{formatXlm(campaign.raised)}</span>
              <span className="text-muted-foreground">
                of {formatXlm(campaign.goal)}
              </span>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {campaign.donorsCount}{" "}
            {campaign.donorsCount === 1 ? "backer" : "backers"}
          </span>
          <span>
            {ended ? "Ended" : timeRemaining(campaign.deadline)}
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}
