import { z } from "zod";

/** Minimum goal / donation mirror the on-chain constants (1 XLM / 0.1 XLM). */
const MIN_GOAL_XLM = 1;
const MIN_DONATION_XLM = 0.1;
const MAX_DURATION_DAYS = 180;
const MIN_DURATION_HOURS = 1;

const xlmAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,7})?$/, "Enter a valid amount (max 7 decimals)");

/** Validation for the Create Campaign form. */
export const createCampaignSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be at most 100 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Description must be at least 10 characters")
    .max(1000, "Description must be at most 1000 characters"),
  goal: xlmAmount.refine(
    (v) => Number(v) >= MIN_GOAL_XLM,
    `Goal must be at least ${MIN_GOAL_XLM} XLM`,
  ),
  durationDays: z
    .number({ message: "Select a duration" })
    .int()
    .min(
      MIN_DURATION_HOURS / 24,
      "Duration is too short",
    )
    .max(MAX_DURATION_DAYS, `Duration must be at most ${MAX_DURATION_DAYS} days`),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/** Validation for the Donate modal. */
export const donateSchema = z.object({
  amount: xlmAmount.refine(
    (v) => Number(v) >= MIN_DONATION_XLM,
    `Minimum donation is ${MIN_DONATION_XLM} XLM`,
  ),
});

export type DonateInput = z.infer<typeof donateSchema>;
