/** Domain types shared across the StellarFund frontend. */

/** Mirrors the on-chain `CampaignStatus` enum (see contracts/shared). */
export enum CampaignStatus {
  Active = 0,
  Successful = 1,
  Failed = 2,
  Withdrawn = 3,
  Closed = 4,
}

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  [CampaignStatus.Active]: "Active",
  [CampaignStatus.Successful]: "Goal reached",
  [CampaignStatus.Failed]: "Failed",
  [CampaignStatus.Withdrawn]: "Withdrawn",
  [CampaignStatus.Closed]: "Closed",
};

/** A campaign as consumed by the UI. Amounts are in stroops (bigint). */
export interface Campaign {
  id: number;
  creator: string;
  title: string;
  description: string;
  goal: bigint;
  raised: bigint;
  deadline: number; // unix seconds
  status: CampaignStatus;
  donorsCount: number;
  createdAt: number; // unix seconds
}

export interface Donation {
  donor: string;
  amount: bigint;
  timestamp: number;
}

/** A decoded contract event for the live activity feed. */
export interface ContractEvent {
  type:
    | "CampaignCreated"
    | "DonationReceived"
    | "GoalReached"
    | "FundsWithdrawn"
    | "RefundIssued"
    | "CampaignClosed";
  campaignId: number;
  ledger: number;
  txHash?: string;
  data: Record<string, string | number>;
}

export type CampaignFilter = "all" | "active" | "successful" | "failed";
export type CampaignSort = "newest" | "mostFunded" | "endingSoon";
