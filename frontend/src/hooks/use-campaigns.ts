"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  createCampaign,
  donate,
  getAllCampaigns,
  getCampaign,
  getDonations,
  refund,
  withdraw,
  closeCampaign,
} from "@/lib/contracts";
import { isConfigured } from "@/lib/config";
import type { Campaign, Donation } from "@/types";

export const campaignKeys = {
  all: ["campaigns"] as const,
  detail: (id: number) => ["campaign", id] as const,
  donations: (id: number) => ["donations", id] as const,
};

/** List every campaign from the factory registry. */
export function useCampaigns(): UseQueryResult<Campaign[]> {
  return useQuery({
    queryKey: campaignKeys.all,
    queryFn: getAllCampaigns,
    enabled: isConfigured(),
  });
}

/** A single campaign by id. */
export function useCampaign(id: number): UseQueryResult<Campaign> {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: () => getCampaign(id),
    enabled: isConfigured() && Number.isFinite(id),
  });
}

/** Donation history for a campaign. */
export function useDonations(id: number): UseQueryResult<Donation[]> {
  return useQuery({
    queryKey: campaignKeys.donations(id),
    queryFn: () => getDonations(id),
    enabled: isConfigured() && Number.isFinite(id),
  });
}

/** Invalidate all campaign-related caches after a state change. */
function useInvalidate() {
  const qc = useQueryClient();
  return (id?: number) => {
    qc.invalidateQueries({ queryKey: campaignKeys.all });
    if (id !== undefined) {
      qc.invalidateQueries({ queryKey: campaignKeys.detail(id) });
      qc.invalidateQueries({ queryKey: campaignKeys.donations(id) });
    }
  };
}

export function useCreateCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: {
      creator: string;
      title: string;
      description: string;
      goalStroops: bigint;
      durationSecs: number;
    }) =>
      createCampaign(
        v.creator,
        v.title,
        v.description,
        v.goalStroops,
        v.durationSecs,
      ),
    onSuccess: () => invalidate(),
  });
}

export function useDonate(id: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { donor: string; amountStroops: bigint }) =>
      donate(id, v.donor, v.amountStroops),
    onSuccess: () => invalidate(id),
  });
}

export function useWithdraw(id: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (creator: string) => withdraw(id, creator),
    onSuccess: () => invalidate(id),
  });
}

export function useRefund(id: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (donor: string) => refund(id, donor),
    onSuccess: () => invalidate(id),
  });
}

export function useCloseCampaign(id: number) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (creator: string) => closeCampaign(id, creator),
    onSuccess: () => invalidate(id),
  });
}
