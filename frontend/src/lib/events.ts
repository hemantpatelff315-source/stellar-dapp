/**
 * Soroban event streaming.
 *
 * Soroban RPC exposes `getEvents`, which we poll on an interval to deliver
 * near-real-time updates. Each decoded event carries its campaign id and a
 * human-friendly type so the UI can invalidate queries and render a live
 * activity feed / toast notifications.
 */
import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { config } from "./config";
import { getServer } from "./contracts";
import { ContractEvent } from "@/types";

/** Map the event's first topic symbol to our union type. */
const TOPIC_TO_TYPE: Record<string, ContractEvent["type"]> = {
  CampaignCreated: "CampaignCreated",
  DonationReceived: "DonationReceived",
  GoalReached: "GoalReached",
  FundsWithdrawn: "FundsWithdrawn",
  RefundIssued: "RefundIssued",
  CampaignClosed: "CampaignClosed",
};

function decodeEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any,
): ContractEvent | null {
  try {
    const topics: xdr.ScVal[] = raw.topic ?? [];
    if (topics.length < 1) return null;
    const name = scValToNative(topics[0]) as string;
    const type = TOPIC_TO_TYPE[name];
    if (!type) return null;

    // Second topic is the indexed campaign id (u64).
    const campaignId = topics[1] ? Number(scValToNative(topics[1])) : 0;
    const value = raw.value ? scValToNative(raw.value) : {};

    return {
      type,
      campaignId,
      ledger: Number(raw.ledger ?? 0),
      txHash: raw.txHash,
      data: value as Record<string, string | number>,
    };
  } catch {
    return null;
  }
}

export interface StreamHandle {
  stop: () => void;
}

/**
 * Start polling for contract events emitted by the campaign contract.
 *
 * @param onEvent  called for each newly-decoded event
 * @param intervalMs polling cadence (default 5s)
 */
export function streamEvents(
  onEvent: (event: ContractEvent) => void,
  intervalMs = 5000,
): StreamHandle {
  const server = getServer();
  let stopped = false;
  let cursor: string | undefined;
  let startLedger: number | undefined;

  async function poll() {
    if (stopped) return;
    try {
      if (startLedger === undefined) {
        const latest = await server.getLatestLedger();
        // Look back a small window so we don't miss very recent activity.
        startLedger = Math.max(1, latest.sequence - 120);
      }

      const filters = [
        {
          type: "contract" as const,
          contractIds: [config.campaignId].filter(Boolean),
        },
      ];
      // SDK 14+ treats `cursor` and `startLedger` as mutually exclusive:
      // paginate by cursor once we have one, otherwise seed from startLedger.
      const res = await server.getEvents(
        cursor
          ? { cursor, filters, limit: 100 }
          : { startLedger, filters, limit: 100 },
      );

      for (const ev of res.events ?? []) {
        const decoded = decodeEvent(ev);
        if (decoded) onEvent(decoded);
      }
      // Advance the cursor so the next poll only returns new events.
      if (res.cursor) cursor = res.cursor;
    } catch {
      // Transient RPC errors are swallowed; the next tick retries.
    } finally {
      if (!stopped) {
        setTimeout(poll, intervalMs);
      }
    }
  }

  void poll();
  return {
    stop: () => {
      stopped = true;
    },
  };
}
