/**
 * Soroban contract client for StellarFund.
 *
 * Wraps `@stellar/stellar-sdk`'s RPC server with:
 *  - read-only view calls (simulate only, no signing)
 *  - state-changing calls (simulate → sign with Freighter → send → poll)
 *  - typed decoding of `Campaign`/`Donation` structs from `ScVal`
 *
 * Keeping all XDR/ScVal handling here means React components deal only with
 * plain typed objects.
 */
import {
  Address,
  BASE_FEE,
  Contract,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { config } from "./config";
import { signXdr } from "./wallet";
import { Campaign, CampaignStatus, Donation } from "@/types";

const server = new rpc.Server(config.rpcUrl, {
  allowHttp: config.rpcUrl.startsWith("http://"),
});

/** Public RPC server handle (used by the event streamer). */
export function getServer(): rpc.Server {
  return server;
}

function u64(n: number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(n), { type: "u64" });
}

function i128(n: bigint): xdr.ScVal {
  return nativeToScVal(n, { type: "i128" });
}

function addr(a: string): xdr.ScVal {
  return new Address(a).toScVal();
}

function str(s: string): xdr.ScVal {
  return nativeToScVal(s, { type: "string" });
}

/**
 * Simulate a read-only contract call and decode the native result.
 * Never signs or submits — safe for rendering.
 */
async function view<T>(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<T> {
  const contract = new Contract(contractId);
  // A placeholder source is fine for simulation of view methods.
  const source = await server
    .getAccount(config.nativeToken)
    .catch(() => null);
  const account =
    source ??
    new (
      await import("@stellar/stellar-sdk")
    ).Account(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
      "0",
    );

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  const retval = sim.result?.retval;
  if (!retval) return undefined as T;
  return scValToNative(retval) as T;
}

/**
 * Execute a state-changing call: simulate for footprint, sign with Freighter,
 * submit, and poll to completion. Returns the transaction hash.
 */
async function send(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  publicKey: string,
): Promise<string> {
  const contract = new Contract(contractId);
  const account = await server.getAccount(publicKey);

  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const prepared = await server.prepareTransaction(built);
  const signedXdr = await signXdr(prepared.toXDR());
  const signed = TransactionBuilder.fromXDR(
    signedXdr,
    config.networkPassphrase,
  );

  const sent = await server.sendTransaction(signed);
  if (sent.status === "ERROR") {
    throw new Error("Transaction submission failed.");
  }

  // Poll until the ledger closes the transaction.
  let status = await server.getTransaction(sent.hash);
  const deadline = Date.now() + 30_000;
  while (status.status === "NOT_FOUND" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    status = await server.getTransaction(sent.hash);
  }
  if (status.status !== "SUCCESS") {
    throw new Error(`Transaction failed: ${status.status}`);
  }
  return sent.hash;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeCampaign(raw: any): Campaign {
  return {
    id: Number(raw.id),
    creator: raw.creator,
    title: raw.title,
    description: raw.description,
    goal: BigInt(raw.goal),
    raised: BigInt(raw.raised),
    deadline: Number(raw.deadline),
    status: Number(raw.status) as CampaignStatus,
    donorsCount: Number(raw.donors_count),
    createdAt: Number(raw.created_at),
  };
}

// ---- Public API ----------------------------------------------------------

/** List all campaign ids from the factory registry. */
export async function listCampaignIds(): Promise<number[]> {
  const ids = await view<bigint[]>(config.factoryId, "list_campaigns", []);
  return (ids ?? []).map(Number);
}

/** Fetch a single campaign by id from the campaign contract. */
export async function getCampaign(id: number): Promise<Campaign> {
  const raw = await view<unknown>(config.campaignId, "get_campaign", [u64(id)]);
  return decodeCampaign(raw);
}

/** Fetch all campaigns (ids → records). */
export async function getAllCampaigns(): Promise<Campaign[]> {
  const ids = await listCampaignIds();
  const results = await Promise.allSettled(ids.map((id) => getCampaign(id)));
  return results
    .filter(
      (r): r is PromiseFulfilledResult<Campaign> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}

/** Donation history for a campaign. */
export async function getDonations(id: number): Promise<Donation[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await view<any[]>(config.campaignId, "get_donations", [u64(id)]);
  return (raw ?? []).map((d) => ({
    donor: d.donor,
    amount: BigInt(d.amount),
    timestamp: Number(d.timestamp),
  }));
}

/** A donor's cumulative contribution to a campaign (for refund eligibility). */
export async function getContribution(
  id: number,
  donor: string,
): Promise<bigint> {
  const raw = await view<bigint>(config.campaignId, "get_contribution", [
    u64(id),
    addr(donor),
  ]);
  return BigInt(raw ?? 0n);
}

/** Create a campaign through the factory. Returns the tx hash. */
export async function createCampaign(
  creator: string,
  title: string,
  description: string,
  goalStroops: bigint,
  durationSecs: number,
): Promise<string> {
  return send(
    config.factoryId,
    "create_campaign",
    [addr(creator), str(title), str(description), i128(goalStroops), u64(durationSecs)],
    creator,
  );
}

/** Donate to a campaign. Returns the tx hash. */
export async function donate(
  id: number,
  donor: string,
  amountStroops: bigint,
): Promise<string> {
  return send(
    config.campaignId,
    "donate",
    [u64(id), addr(donor), i128(amountStroops)],
    donor,
  );
}

/** Withdraw raised funds (creator only). Returns the tx hash. */
export async function withdraw(id: number, creator: string): Promise<string> {
  return send(config.campaignId, "withdraw", [u64(id)], creator);
}

/** Claim a refund from a failed campaign. Returns the tx hash. */
export async function refund(id: number, donor: string): Promise<string> {
  return send(config.campaignId, "refund", [u64(id), addr(donor)], donor);
}

/** Close a campaign early (creator only). Returns the tx hash. */
export async function closeCampaign(
  id: number,
  creator: string,
): Promise<string> {
  return send(config.campaignId, "close", [u64(id)], creator);
}
