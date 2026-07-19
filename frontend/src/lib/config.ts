/**
 * Central runtime configuration, sourced from `NEXT_PUBLIC_*` env vars.
 *
 * Every value has a testnet-friendly default so the app renders even before a
 * deployment exists; `isConfigured()` reports whether real contract IDs are
 * present so the UI can show a helpful "not deployed yet" state instead of
 * failing opaquely.
 */

export const config = {
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? "testnet",
  rpcUrl:
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
    "https://soroban-testnet.stellar.org",
  networkPassphrase:
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
    "Test SDF Network ; September 2015",
  nativeToken:
    process.env.NEXT_PUBLIC_NATIVE_TOKEN ??
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  factoryId: process.env.NEXT_PUBLIC_FACTORY_ID ?? "",
  campaignId: process.env.NEXT_PUBLIC_CAMPAIGN_ID ?? "",
  treasuryId: process.env.NEXT_PUBLIC_TREASURY_ID ?? "",
} as const;

/** True when the three contract IDs are all present. */
export function isConfigured(): boolean {
  return Boolean(config.factoryId && config.campaignId && config.treasuryId);
}

/** Base URL of the network explorer for linking transactions. */
export function explorerTxUrl(hash: string): string {
  const net = config.network === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}

/** Explorer URL for a contract. */
export function explorerContractUrl(id: string): string {
  const net = config.network === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/contract/${id}`;
}
