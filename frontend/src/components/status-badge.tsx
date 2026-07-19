import { Badge } from "@/components/ui/badge";
import { CampaignStatus, STATUS_LABELS } from "@/types";
import type { BadgeProps } from "@/components/ui/badge";

const VARIANT: Record<CampaignStatus, BadgeProps["variant"]> = {
  [CampaignStatus.Active]: "default",
  [CampaignStatus.Successful]: "success",
  [CampaignStatus.Failed]: "destructive",
  [CampaignStatus.Withdrawn]: "muted",
  [CampaignStatus.Closed]: "muted",
};

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
